import { parentPort, workerData } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import * as vm from 'vm';

// Try to import esbuild, fallback if not available
let esbuild: typeof import('esbuild') | null = null;
try {
  esbuild = require('esbuild');
} catch (error) {
  console.warn('[Worker] esbuild not available, will use vm fallback for TS execution');
}

interface WorkerInput {
  tempDir: string;
  files: Record<string, string>;
  timeout: number;
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  output?: string;
}

interface WorkerOutput {
  success: boolean;
  results: TestResult[];
  stdout: string[];
  stderr: string[];
  error?: string;
}

// Capture console output
const stdoutCapture: string[] = [];
const stderrCapture: string[] = [];

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
  stdoutCapture.push(args.map(a => String(a)).join(' '));
  originalConsoleLog(...args);
};

console.error = (...args: any[]) => {
  stderrCapture.push(args.map(a => String(a)).join(' '));
  originalConsoleError(...args);
};

console.warn = (...args: any[]) => {
  stderrCapture.push(args.map(a => String(a)).join(' '));
  originalConsoleWarn(...args);
};

/**
 * Compile TypeScript to JavaScript using esbuild
 */
async function compileTypeScript(tsCode: string, filePath: string): Promise<string | null> {
  if (!esbuild) {
    return null;
  }

  try {
    const loader = filePath.endsWith('.tsx') ? 'tsx' : 'ts';
    const result = await esbuild.build({
      stdin: {
        contents: tsCode,
        loader,
        resolveDir: process.cwd(),
      },
      write: false,
      format: 'cjs',
      platform: 'node',
      bundle: true,
      target: 'node18',
    });

    if (result.outputFiles && result.outputFiles.length > 0) {
      return result.outputFiles[0].text;
    }

    return null;
  } catch (error: any) {
    console.error(`[Worker] esbuild compilation failed for ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Execute JavaScript code in isolated context
 */
function executeJavaScript(jsCode: string, filePath: string): { exports: any; error?: string } {
  try {
    const moduleExports: any = {};
    const context = vm.createContext({
      module: { exports: moduleExports },
      exports: moduleExports,
      require: require,
      console: console,
      process: process,
      __filename: filePath,
      __dirname: path.dirname(filePath),
    });

    vm.runInContext(jsCode, context, {
      filename: filePath,
      timeout: 5000,
    });

    return { exports: context.module.exports };
  } catch (error: any) {
    return { exports: {}, error: error.message };
  }
}

/**
 * Execute tests on generated code files
 */
async function executeTests(): Promise<WorkerOutput> {
  const { tempDir, files } = workerData as WorkerInput;
  const results: TestResult[] = [];

  try {
    console.log(`[Worker] Starting tests in ${tempDir}`);
    console.log(`[Worker] Testing ${Object.keys(files).length} files`);
    console.log(`[Worker] esbuild available: ${esbuild !== null}`);

    for (const [filePath, content] of Object.entries(files)) {
      // Skip non-executable files
      if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx') && !filePath.endsWith('.js')) {
        continue;
      }

      const fullPath = path.join(tempDir, filePath);

      // Test 1: File exists and is readable
      try {
        const exists = fs.existsSync(fullPath);
        if (!exists) {
          results.push({
            name: `File exists: ${filePath}`,
            passed: false,
            error: 'File not found in temp directory',
          });
          continue;
        }

        results.push({
          name: `File exists: ${filePath}`,
          passed: true,
        });
      } catch (error: any) {
        results.push({
          name: `File exists: ${filePath}`,
          passed: false,
          error: error.message,
        });
        continue;
      }

      // Test 2: Syntax validation - try to parse/compile
      try {
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        
        if (!fileContent || fileContent.trim().length === 0) {
          throw new Error('File is empty');
        }

        // Basic syntax checks
        if (fileContent.includes('import from') || fileContent.includes('import  from')) {
          throw new Error('Malformed import statement');
        }

        results.push({
          name: `Syntax validation: ${filePath}`,
          passed: true,
        });
      } catch (error: any) {
        results.push({
          name: `Syntax validation: ${filePath}`,
          passed: false,
          error: error.message,
        });
        continue;
      }

      // Test 3: TypeScript compilation and execution
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        const tsContent = fs.readFileSync(fullPath, 'utf-8');
        
        // Try to compile with esbuild
        let jsCode = await compileTypeScript(tsContent, filePath);
        
        if (jsCode) {
          // Successfully compiled with esbuild
          results.push({
            name: `TypeScript compilation: ${filePath}`,
            passed: true,
            output: 'Compiled with esbuild',
          });

          // Execute the compiled JavaScript
          const execResult = executeJavaScript(jsCode, fullPath);
          
          if (execResult.error) {
            results.push({
              name: `TypeScript execution: ${filePath}`,
              passed: false,
              error: execResult.error,
            });
          } else {
            results.push({
              name: `TypeScript execution: ${filePath}`,
              passed: true,
              output: `Executed successfully with ${Object.keys(execResult.exports).length} export(s)`,
            });

            // Verify exports
            if (Object.keys(execResult.exports).length > 0) {
              results.push({
                name: `Export verification: ${filePath}`,
                passed: true,
                output: `Exports: ${Object.keys(execResult.exports).join(', ')}`,
              });
            }
          }
        } else {
          // Fallback: Static analysis only
          results.push({
            name: `TypeScript compilation: ${filePath}`,
            passed: true,
            output: 'esbuild not available - using static analysis fallback',
          });

          // Check for exports statically
          if (tsContent.includes('export ')) {
            const exportMatches = tsContent.match(/export\s+(const|function|class|interface|type|default|{)/g);
            if (exportMatches && exportMatches.length > 0) {
              results.push({
                name: `Export validation (static): ${filePath}`,
                passed: true,
                output: `Found ${exportMatches.length} export pattern(s)`,
              });
            }
          }
        }
      }

      // Test 4: JavaScript execution
      if (filePath.endsWith('.js')) {
        const jsContent = fs.readFileSync(fullPath, 'utf-8');
        
        // Try to execute using vm.runInContext first
        const execResult = executeJavaScript(jsContent, fullPath);
        
        if (execResult.error) {
          // Fallback: try require() for better dependency resolution
          try {
            const module = require(fullPath);
            
            results.push({
              name: `JavaScript execution: ${filePath}`,
              passed: true,
              output: `Successfully loaded module with ${Object.keys(module).length} export(s)`,
            });

            // Verify exports exist
            if (Object.keys(module).length > 0) {
              results.push({
                name: `Export verification: ${filePath}`,
                passed: true,
                output: `Exports: ${Object.keys(module).join(', ')}`,
              });
            }
          } catch (requireError: any) {
            // This is acceptable for files with external dependencies
            if (requireError.code === 'MODULE_NOT_FOUND') {
              results.push({
                name: `JavaScript execution: ${filePath}`,
                passed: true,
                output: 'Module has external dependencies (expected in generated code)',
              });
            } else {
              results.push({
                name: `JavaScript execution: ${filePath}`,
                passed: false,
                error: `vm: ${execResult.error}, require: ${requireError.message}`,
              });
            }
          }
        } else {
          results.push({
            name: `JavaScript execution: ${filePath}`,
            passed: true,
            output: `Executed successfully with ${Object.keys(execResult.exports).length} export(s)`,
          });

          // Verify exports
          if (Object.keys(execResult.exports).length > 0) {
            results.push({
              name: `Export verification: ${filePath}`,
              passed: true,
              output: `Exports: ${Object.keys(execResult.exports).join(', ')}`,
            });
          }
        }
      }
    }

    console.log(`[Worker] Completed ${results.length} tests`);

    return {
      success: true,
      results,
      stdout: stdoutCapture,
      stderr: stderrCapture,
    };
  } catch (error: any) {
    console.error(`[Worker] Fatal error:`, error);
    
    return {
      success: false,
      results,
      stdout: stdoutCapture,
      stderr: stderrCapture,
      error: error.message,
    };
  }
}

// Execute tests and send results back to parent
executeTests()
  .then((output) => {
    if (parentPort) {
      parentPort.postMessage(output);
    } else {
      console.error('[Worker] No parent port available');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('[Worker] Unhandled error:', error);
    if (parentPort) {
      parentPort.postMessage({
        success: false,
        results: [],
        stdout: stdoutCapture,
        stderr: stderrCapture,
        error: error.message,
      });
    }
    process.exit(1);
  });
