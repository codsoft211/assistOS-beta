import { build } from 'esbuild';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

export interface ValidationError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  passed: boolean;
  errors?: ValidationError[];
  warnings?: string[];
  metadata?: Record<string, any>;
}

export interface SyntaxValidationResult extends ValidationResult {
  syntax?: {
    passed: boolean;
    errors?: string[];
  };
}

export interface LSPValidationResult extends ValidationResult {
  lsp?: {
    passed: boolean;
    errors?: string[];
  };
}

export interface ConflictValidationResult extends ValidationResult {
  conflicts?: {
    passed: boolean;
    conflicts?: string[];
  };
}

export class ValidationService {
  /**
   * Validate TypeScript syntax using esbuild (fast) and TypeScript compiler API (detailed)
   */
  async validateSyntax(files: Record<string, string>): Promise<SyntaxValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    try {
      // Phase 1: Fast syntax check with esbuild
      for (const [filePath, content] of Object.entries(files)) {
        if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) {
          continue; // Skip non-TypeScript files
        }

        try {
          // Calculate resolveDir for correct relative import resolution
          const resolveDir = path.dirname(path.join(process.cwd(), filePath));
          
          await build({
            stdin: {
              contents: content,
              loader: filePath.endsWith('.tsx') ? 'tsx' : 'ts',
              sourcefile: filePath,
              resolveDir, // Critical: allows esbuild to resolve relative imports correctly
            },
            write: false,
            bundle: false,
            target: 'esnext',
            logLevel: 'silent',
          });
        } catch (buildError: any) {
          if (buildError.errors) {
            for (const error of buildError.errors) {
              errors.push({
                file: filePath,
                line: error.location?.line,
                column: error.location?.column,
                message: error.text,
                severity: 'error',
              });
            }
          }
        }
      }

      // Phase 2: Detailed validation with TypeScript compiler API
      const tsErrors = this.validateWithTypeScript(files);
      errors.push(...tsErrors);

      const passed = errors.length === 0;

      return {
        passed,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        syntax: {
          passed,
          errors: errors.length > 0 ? errors.map(e => e.message) : undefined,
        },
      };
    } catch (error: any) {
      console.error('[ValidationService] Syntax validation error:', error);
      return {
        passed: false,
        errors: [
          {
            message: `Validation system error: ${error.message}`,
            severity: 'error',
          },
        ],
      };
    }
  }

  /**
   * Validate using TypeScript compiler API for type checking
   */
  private validateWithTypeScript(files: Record<string, string>): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      // Create in-memory file system for TypeScript
      const fileNames = Object.keys(files);
      const options: ts.CompilerOptions = {
        noEmit: true,
        strict: true,
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ES2020,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        jsx: ts.JsxEmit.ReactJSX,
        skipLibCheck: true,
      };

      // Create compiler host
      const host = ts.createCompilerHost(options);
      const originalGetSourceFile = host.getSourceFile;

      host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
        // Check if it's one of our in-memory files
        if (files[fileName]) {
          return ts.createSourceFile(fileName, files[fileName], languageVersion);
        }
        // Otherwise use original implementation
        return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
      };

      // Create program and get diagnostics
      const program = ts.createProgram(fileNames, options, host);
      const diagnostics = ts.getPreEmitDiagnostics(program);

      for (const diagnostic of diagnostics) {
        if (diagnostic.file) {
          const { line, character } = ts.getLineAndCharacterOfPosition(
            diagnostic.file,
            diagnostic.start!
          );

          errors.push({
            file: diagnostic.file.fileName,
            line: line + 1,
            column: character + 1,
            message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
            severity: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
          });
        } else {
          errors.push({
            message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
            severity: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
          });
        }
      }
    } catch (error: any) {
      console.error('[ValidationService] TypeScript validation error:', error);
      errors.push({
        message: `TypeScript compiler error: ${error.message}`,
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Detect conflicts with existing codebase files
   */
  async validateConflicts(
    files: Record<string, string>,
    workspaceRoot: string = process.cwd() // Default to current working directory
  ): Promise<ConflictValidationResult> {
    const conflicts: string[] = [];
    const warnings: string[] = [];

    try {
      for (const filePath of Object.keys(files)) {
        const fullPath = path.join(workspaceRoot, filePath);

        // Check if file already exists
        if (fs.existsSync(fullPath)) {
          // Read existing file
          const existingContent = fs.readFileSync(fullPath, 'utf-8');
          const newContent = files[filePath];

          // Simple conflict detection: if files differ, it's a potential conflict
          if (existingContent !== newContent) {
            conflicts.push(
              `File ${filePath} already exists with different content. Manual merge may be required.`
            );
          } else {
            warnings.push(`File ${filePath} already exists but content is identical.`);
          }
        }
      }

      const passed = conflicts.length === 0;

      return {
        passed,
        warnings: warnings.length > 0 ? warnings : undefined,
        conflicts: {
          passed,
          conflicts: conflicts.length > 0 ? conflicts : undefined,
        },
      };
    } catch (error: any) {
      console.error('[ValidationService] Conflict validation error:', error);
      return {
        passed: false,
        errors: [
          {
            message: `Conflict detection error: ${error.message}`,
            severity: 'error',
          },
        ],
      };
    }
  }

  /**
   * Run all validations
   */
  async validateAll(
    files: Record<string, string>,
    options?: { skipConflicts?: boolean }
  ): Promise<{
    passed: boolean;
    syntax: SyntaxValidationResult;
    conflicts?: ConflictValidationResult;
  }> {
    const syntaxResult = await this.validateSyntax(files);
    let conflictsResult: ConflictValidationResult | undefined;

    if (!options?.skipConflicts) {
      conflictsResult = await this.validateConflicts(files);
    }

    const passed = syntaxResult.passed && (conflictsResult?.passed !== false);

    return {
      passed,
      syntax: syntaxResult,
      conflicts: conflictsResult,
    };
  }
}

export const validationService = new ValidationService();
