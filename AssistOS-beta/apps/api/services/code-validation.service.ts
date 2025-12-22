import ts from 'typescript';
import { db } from '../db';
import { codeGenerationValidations } from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';

export interface ValidationResult {
  passed: boolean;
  errors: Array<{
    file?: string;
    line?: number;
    column?: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
  }>;
  warnings: Array<{
    file?: string;
    line?: number;
    column?: number;
    message: string;
  }>;
  metadata?: Record<string, any>;
}

export interface CodeFiles {
  [filepath: string]: string;
}

export interface ValidationOptions {
  timeoutMs?: number;
  maxFileSize?: number;
  maxTotalSize?: number;
}

const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
  timeoutMs: 30000, // 30 seconds
  maxFileSize: 500000, // 500KB per file
  maxTotalSize: 2000000, // 2MB total
};

export class CodeValidationService {
  /**
   * Run all validation stages sequentially with resource limits and timeouts
   * Returns first failure or success if all pass
   */
  async validateCode(
    generatedCodeId: string,
    files: CodeFiles,
    tenantId: string,
    options: ValidationOptions = DEFAULT_VALIDATION_OPTIONS
  ): Promise<ValidationResult> {
    console.log(`[CodeValidation] Starting validation for generatedCode ${generatedCodeId}, tenant ${tenantId}`);

    const opts = { ...DEFAULT_VALIDATION_OPTIONS, ...options };

    // Check resource limits
    const limitCheck = this.checkResourceLimits(files, opts);
    if (!limitCheck.passed) {
      return limitCheck;
    }

    // Wrap validation in timeout
    return await this.withTimeout(
      async () => {
        // Stage 1: Syntax Validation
        const syntaxResult = await this.validateSyntax(generatedCodeId, files, tenantId);
        if (!syntaxResult.passed) {
          console.log(`[CodeValidation] ❌ Syntax validation failed`);
          return syntaxResult;
        }
        console.log(`[CodeValidation] ✅ Syntax validation passed`);

        // Stage 2: Type Checking
        const typeResult = await this.validateTypes(generatedCodeId, files, tenantId);
        if (!typeResult.passed) {
          console.log(`[CodeValidation] ❌ Type validation failed`);
          return typeResult;
        }
        console.log(`[CodeValidation] ✅ Type validation passed`);

        // Stage 3: Security Scanning
        const securityResult = await this.validateSecurity(generatedCodeId, files, tenantId);
        if (!securityResult.passed) {
          console.log(`[CodeValidation] ❌ Security validation failed`);
          return securityResult;
        }
        console.log(`[CodeValidation] ✅ Security validation passed`);

        // Stage 4: Dependency Analysis
        const dependencyResult = await this.validateDependencies(generatedCodeId, files, tenantId);
        if (!dependencyResult.passed) {
          console.log(`[CodeValidation] ❌ Dependency validation failed`);
          return dependencyResult;
        }
        console.log(`[CodeValidation] ✅ Dependency validation passed`);

        console.log(`[CodeValidation] ✅ All validations passed`);

        return {
          passed: true,
          errors: [],
          warnings: [],
          metadata: {
            stagesCompleted: ['syntax', 'types', 'security', 'dependencies'],
            totalFiles: Object.keys(files).length,
          },
        };
      },
      opts.timeoutMs || 30000
    );
  }

  /**
   * Check resource limits before validation
   */
  private checkResourceLimits(
    files: CodeFiles,
    options: ValidationOptions
  ): ValidationResult {
    const errors: ValidationResult['errors'] = [];

    let totalSize = 0;
    for (const [filepath, content] of Object.entries(files)) {
      const fileSize = Buffer.byteLength(content, 'utf8');
      totalSize += fileSize;

      if (options.maxFileSize && fileSize > options.maxFileSize) {
        errors.push({
          file: filepath,
          message: `File size (${fileSize} bytes) exceeds limit (${options.maxFileSize} bytes)`,
          severity: 'error',
        });
      }
    }

    if (options.maxTotalSize && totalSize > options.maxTotalSize) {
      errors.push({
        message: `Total code size (${totalSize} bytes) exceeds limit (${options.maxTotalSize} bytes)`,
        severity: 'error',
      });
    }

    if (errors.length > 0) {
      return {
        passed: false,
        errors,
        warnings: [],
        metadata: { reason: 'resource_limits_exceeded' },
      };
    }

    return { passed: true, errors: [], warnings: [] };
  }

  /**
   * Execute validation with timeout
   */
  private async withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Validation timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Stage 1: Syntax Validation
   * Parse TypeScript/JavaScript files to detect syntax errors
   */
  private async validateSyntax(
    generatedCodeId: string,
    files: CodeFiles,
    tenantId: string
  ): Promise<ValidationResult> {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    await this.createValidationRecord(generatedCodeId, tenantId, 'syntax', 'running');

    for (const [filepath, content] of Object.entries(files)) {
      // Only validate .ts, .tsx, .js, .jsx files
      if (!/\.(ts|tsx|js|jsx)$/.test(filepath)) {
        continue;
      }

      const sourceFile = ts.createSourceFile(
        filepath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      // Check for syntax errors using TypeScript's parser
      const diagnostics = (sourceFile as any).parseDiagnostics || [];

      for (const diagnostic of diagnostics) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        const { line, character } = diagnostic.file
          ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start || 0)
          : { line: 0, character: 0 };

        errors.push({
          file: filepath,
          line: line + 1,
          column: character + 1,
          message,
          severity: 'error',
        });
      }
    }

    const passed = errors.length === 0;

    await this.updateValidationRecord(generatedCodeId, tenantId, 'syntax', 'completed', passed, {
      errors,
      warnings,
      filesChecked: Object.keys(files).filter(f => /\.(ts|tsx|js|jsx)$/.test(f)),
    });

    return { passed, errors, warnings };
  }

  /**
   * Stage 2: Type Checking
   * Run TypeScript compiler with FULL in-memory CompilerHost to detect type errors
   */
  private async validateTypes(
    generatedCodeId: string,
    files: CodeFiles,
    tenantId: string
  ): Promise<ValidationResult> {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    await this.createValidationRecord(generatedCodeId, tenantId, 'type_check', 'running');

    // Consistent virtual root for tenant isolation
    const virtualRoot = `/virtual/${tenantId}`;

    // Create in-memory file system for TypeScript compiler with path alias support
    const compilerOptions: ts.CompilerOptions = {
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      jsx: ts.JsxEmit.React,
      baseUrl: virtualRoot,
      paths: {
        '@shared/*': [`${virtualRoot}/shared/*`],
        '@/*': [`${virtualRoot}/client/src/*`], // FIX: Point to actual frontend root
        '@lib/*': [`${virtualRoot}/client/src/lib/*`],
        '@components/*': [`${virtualRoot}/client/src/components/*`],
        '@hooks/*': [`${virtualRoot}/client/src/hooks/*`],
      }
    };

    const fileNames = Object.keys(files).filter(f => /\.(ts|tsx)$/.test(f));
    
    // Create full in-memory compiler host with tenant-isolated virtual FS
    const host = this.createInMemoryCompilerHost(files, tenantId, compilerOptions);

    // Map file names to virtual paths with tenant isolation
    const virtualFileNames = fileNames.map(f => `${virtualRoot}/${f}`);
    const program = ts.createProgram(virtualFileNames, compilerOptions, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);

    for (const diagnostic of diagnostics) {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      
      if (diagnostic.file) {
        const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
          diagnostic.start || 0
        );

        const severity = diagnostic.category === ts.DiagnosticCategory.Error 
          ? 'error' 
          : diagnostic.category === ts.DiagnosticCategory.Warning
          ? 'warning'
          : 'info';

        const entry = {
          file: diagnostic.file.fileName,
          line: line + 1,
          column: character + 1,
          message,
        };

        if (severity === 'error') {
          errors.push({ ...entry, severity });
        } else {
          warnings.push(entry);
        }
      } else {
        // Global diagnostic
        errors.push({
          message,
          severity: 'error',
        });
      }
    }

    const passed = errors.length === 0;

    await this.updateValidationRecord(generatedCodeId, tenantId, 'type_check', 'completed', passed, {
      errors,
      warnings,
      filesChecked: fileNames,
    });

    return { passed, errors, warnings };
  }

  /**
   * Stage 3: Security Scanning
   * Scan for dangerous patterns, potential security vulnerabilities
   */
  private async validateSecurity(
    generatedCodeId: string,
    files: CodeFiles,
    tenantId: string
  ): Promise<ValidationResult> {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    await this.createValidationRecord(generatedCodeId, tenantId, 'security', 'running');

    // Define security patterns to check
    const dangerousPatterns = [
      {
        pattern: /eval\s*\(/gi,
        message: 'Use of eval() is prohibited - security risk',
        severity: 'error' as const,
      },
      {
        pattern: /new\s+Function\s*\(/gi,
        message: 'Dynamic function creation is prohibited - security risk',
        severity: 'error' as const,
      },
      {
        pattern: /process\.env\.\w+/gi,
        message: 'Direct access to process.env - use configuration service instead',
        severity: 'warning' as const,
      },
      {
        pattern: /exec\s*\(|spawn\s*\(/gi,
        message: 'Direct shell execution detected - ensure proper sanitization',
        severity: 'warning' as const,
      },
      {
        pattern: /dangerouslySetInnerHTML/gi,
        message: 'dangerouslySetInnerHTML detected - ensure content is sanitized',
        severity: 'warning' as const,
      },
      {
        pattern: /\.innerHTML\s*=/gi,
        message: 'innerHTML assignment detected - XSS risk if content is not sanitized',
        severity: 'warning' as const,
      },
      {
        pattern: /sql`.*\$\{/gi,
        message: 'Potential SQL injection - use parameterized queries',
        severity: 'error' as const,
      },
      {
        pattern: /Math\.random\(\)/gi,
        message: 'Math.random() is not cryptographically secure - use crypto.randomBytes() for security',
        severity: 'info' as const,
      },
    ];

    for (const [filepath, content] of Object.entries(files)) {
      // Only scan code files
      if (!/\.(ts|tsx|js|jsx)$/.test(filepath)) {
        continue;
      }

      const lines = content.split('\n');

      for (const { pattern, message, severity } of dangerousPatterns) {
        let match;
        pattern.lastIndex = 0; // Reset regex

        while ((match = pattern.exec(content)) !== null) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          const columnNum = match.index - content.lastIndexOf('\n', match.index - 1);

          const entry = {
            file: filepath,
            line: lineNum,
            column: columnNum,
            message,
          };

          if (severity === 'error') {
            errors.push({ ...entry, severity });
          } else {
            warnings.push(entry);
          }
        }
      }
    }

    const passed = errors.length === 0;

    await this.updateValidationRecord(generatedCodeId, tenantId, 'security', 'completed', passed, {
      errors,
      warnings,
      patternsChecked: dangerousPatterns.length,
      filesChecked: Object.keys(files).filter(f => /\.(ts|tsx|js|jsx)$/.test(f)),
    });

    return { passed, errors, warnings };
  }

  /**
   * Stage 4: Dependency Analysis
   * Validate imports and check for missing/invalid dependencies
   */
  private async validateDependencies(
    generatedCodeId: string,
    files: CodeFiles,
    tenantId: string
  ): Promise<ValidationResult> {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    await this.createValidationRecord(generatedCodeId, tenantId, 'dependency', 'running');

    // Allowed internal imports (project structure)
    const allowedPrefixes = [
      '@shared/',
      '@/',
      '../../shared/',
      '../shared/',
      './shared/',
      '../',
      './',
    ];

    // Track all imports
    const imports = new Set<string>();
    const externalImports = new Set<string>();

    for (const [filepath, content] of Object.entries(files)) {
      if (!/\.(ts|tsx|js|jsx)$/.test(filepath)) {
        continue;
      }

      // Match import statements
      const importRegex = /import\s+(?:(?:\*\s+as\s+\w+)|(?:\{[^}]*\})|(?:\w+))\s+from\s+['"]([^'"]+)['"]/g;
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        imports.add(importPath);

        // Check if it's an external import (not relative, not @shared, not @/)
        const isInternal = allowedPrefixes.some(prefix => importPath.startsWith(prefix));
        
        if (!isInternal && !importPath.startsWith('node:')) {
          externalImports.add(importPath);
        }

        // Check for imports from files that should exist in generated code
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          // Resolve relative import to absolute path
          const currentDir = filepath.substring(0, filepath.lastIndexOf('/'));
          const resolvedPath = this.resolveRelativePath(currentDir, importPath);

          // Check if the file exists in generated files
          const possibleExtensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
          const fileExists = possibleExtensions.some(ext => {
            const fullPath = resolvedPath + ext;
            return files.hasOwnProperty(fullPath) || files.hasOwnProperty(fullPath.replace(/^\//, ''));
          });

          if (!fileExists && !importPath.includes('@shared') && !importPath.includes('node:')) {
            const lines = content.substring(0, match.index).split('\n');
            errors.push({
              file: filepath,
              line: lines.length,
              column: match.index - content.lastIndexOf('\n', match.index - 1),
              message: `Import "${importPath}" references a file that does not exist in generated code`,
              severity: 'error',
            });
          }
        }
      }
    }

    const passed = errors.length === 0;

    await this.updateValidationRecord(generatedCodeId, tenantId, 'dependency', 'completed', passed, {
      errors,
      warnings,
      totalImports: imports.size,
      externalImports: Array.from(externalImports),
      filesChecked: Object.keys(files).filter(f => /\.(ts|tsx|js|jsx)$/.test(f)),
    });

    return { passed, errors, warnings };
  }

  /**
   * Create full in-memory TypeScript CompilerHost
   * Wraps default host and overrides filesystem hooks to support virtual files
   */
  private createInMemoryCompilerHost(
    files: CodeFiles,
    tenantId: string,
    options: ts.CompilerOptions
  ): ts.CompilerHost {
    // Consistent virtual root: /virtual/<tenantId>/
    const virtualRoot = `/virtual/${tenantId}`;
    
    // Build virtual file system map with consistent root
    const virtualFiles = new Map<string, string>();
    const virtualDirs = new Set<string>();
    
    for (const [filepath, content] of Object.entries(files)) {
      const virtualPath = `${virtualRoot}/${filepath}`;
      virtualFiles.set(virtualPath, content);
      
      // Register all parent directories
      let dir = virtualPath.substring(0, virtualPath.lastIndexOf('/'));
      while (dir.length > virtualRoot.length) {
        virtualDirs.add(dir);
        dir = dir.substring(0, dir.lastIndexOf('/'));
      }
      virtualDirs.add(virtualRoot);
    }

    // Start from default compiler host (includes stdlib, getDefaultLibFileName, etc.)
    const defaultHost = ts.createCompilerHost(options);
    
    // Normalize paths consistently
    const normalizePath = (path: string): string => {
      return path.replace(/\\/g, '/');
    };

    // WRAP default host - override only filesystem hooks
    const host: ts.CompilerHost = {
      ...defaultHost,

      getSourceFile: (fileName, languageVersion) => {
        const normalized = normalizePath(fileName);
        
        // Check virtual files first
        if (virtualFiles.has(normalized)) {
          return ts.createSourceFile(
            fileName,
            virtualFiles.get(normalized)!,
            languageVersion,
            true
          );
        }

        // Fallback to default host for node_modules, lib.d.ts, etc.
        return defaultHost.getSourceFile(fileName, languageVersion);
      },

      fileExists: (fileName) => {
        const normalized = normalizePath(fileName);
        
        // Check virtual files first
        if (virtualFiles.has(normalized)) {
          return true;
        }

        // Fallback to real filesystem (node_modules, type definitions)
        return ts.sys.fileExists(fileName);
      },

      readFile: (fileName) => {
        const normalized = normalizePath(fileName);
        
        // Check virtual files first
        if (virtualFiles.has(normalized)) {
          return virtualFiles.get(normalized);
        }

        // Fallback to real filesystem
        return ts.sys.readFile(fileName);
      },

      directoryExists: (dirName) => {
        const normalized = normalizePath(dirName);
        
        // Check virtual directories first
        if (virtualDirs.has(normalized)) {
          return true;
        }

        // Fallback to real filesystem
        return ts.sys.directoryExists(dirName);
      },

      getDirectories: (path) => {
        const normalized = normalizePath(path);
        const virtualSubDirs = new Set<string>();

        // Get virtual subdirectories
        Array.from(virtualDirs).forEach((dir) => {
          if (dir.startsWith(normalized + '/')) {
            const parts = dir.substring(normalized.length + 1).split('/');
            if (parts.length > 0) {
              virtualSubDirs.add(parts[0]);
            }
          }
        });

        // Merge with real filesystem directories (for node_modules)
        const realDirs = ts.sys.directoryExists(path) ? ts.sys.getDirectories(path) : [];
        return [... Array.from(virtualSubDirs), ...realDirs];
      },

      getCurrentDirectory: () => virtualRoot,

      useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,

      getCanonicalFileName: (fileName) => {
        return ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase();
      },

      getNewLine: () => ts.sys.newLine,

      // Custom module resolution to handle virtual files
      resolveModuleNames: (moduleNames, containingFile) => {
        return moduleNames.map((moduleName) => {
          // Use TypeScript's resolver with our custom host
          const result = ts.resolveModuleName(
            moduleName,
            containingFile,
            options,
            {
              fileExists: host.fileExists!,
              readFile: host.readFile!,
            }
          );

          if (result.resolvedModule) {
            return result.resolvedModule;
          }

          // If not resolved and it's a relative/alias import, try virtual files
          if (moduleName.startsWith('./') || moduleName.startsWith('../') || 
              moduleName.startsWith('@/') || moduleName.startsWith('@shared/')) {
            
            // Try to resolve relative to virtual root
            let resolvedPath = moduleName;
            
            if (moduleName.startsWith('@shared/')) {
              resolvedPath = moduleName.replace('@shared/', `${virtualRoot}/shared/`);
            } else if (moduleName.startsWith('@lib/')) {
              resolvedPath = moduleName.replace('@lib/', `${virtualRoot}/client/src/lib/`);
            } else if (moduleName.startsWith('@components/')) {
              resolvedPath = moduleName.replace('@components/', `${virtualRoot}/client/src/components/`);
            } else if (moduleName.startsWith('@hooks/')) {
              resolvedPath = moduleName.replace('@hooks/', `${virtualRoot}/client/src/hooks/`);
            } else if (moduleName.startsWith('@/')) {
              resolvedPath = moduleName.replace('@/', `${virtualRoot}/client/src/`);
            } else {
              // Relative import - resolve from containing file
              const containingDir = containingFile.substring(0, containingFile.lastIndexOf('/'));
              resolvedPath = this.resolveRelativePath(containingDir, moduleName);
            }

            // Try with common extensions
            const extensions = ['.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx'];
            for (const ext of extensions) {
              const fullPath = resolvedPath + ext;
              if (virtualFiles.has(fullPath)) {
                return {
                  resolvedFileName: fullPath,
                  extension: ts.Extension.Ts,
                  isExternalLibraryImport: false,
                };
              }
            }
          }

          return undefined;
        });
      },
    };

    return host;
  }

  /**
   * Helper: Resolve relative import paths
   */
  private resolveRelativePath(currentDir: string, importPath: string): string {
    const parts = currentDir.split('/').filter(Boolean);
    const importParts = importPath.split('/').filter(Boolean);

    for (const part of importParts) {
      if (part === '..') {
        parts.pop();
      } else if (part !== '.') {
        parts.push(part);
      }
    }

    return parts.join('/');
  }

  /**
   * Create validation record in database
   */
  private async createValidationRecord(
    generatedCodeId: string,
    tenantId: string,
    validationType: string,
    status: 'pending' | 'running' | 'completed' | 'failed'
  ): Promise<void> {
    await db.insert(codeGenerationValidations).values({
      generatedCodeId,
      validationType,
      status,
      passed: null,
      results: {},
      startedAt: new Date(),
    });
  }

  /**
   * Update validation record with results
   */
  private async updateValidationRecord(
    generatedCodeId: string,
    tenantId: string,
    validationType: string,
    status: 'completed' | 'failed',
    passed: boolean,
    results: any
  ): Promise<void> {
    const validations = await db
      .select()
      .from(codeGenerationValidations)
      .where(and(
        eq(codeGenerationValidations.generatedCodeId, generatedCodeId),
        eq(codeGenerationValidations.validationType, validationType)
      ))
      .orderBy(desc(codeGenerationValidations.createdAt))
      .limit(1);

    if (validations.length > 0) {
      await db
        .update(codeGenerationValidations)
        .set({
          status,
          passed,
          results,
          completedAt: new Date(),
        })
        .where(eq(codeGenerationValidations.id, validations[0].id));
    }
  }
}

// Export singleton instance
export const codeValidationService = new CodeValidationService();
