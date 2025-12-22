import { Worker } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SandboxTestResult {
  passed: boolean;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  errors: string[];
  executionTimeMs: number;
  memoryUsedMb: number;
  stdout: string[];
  stderr: string[];
  metadata?: Record<string, any>;
}

interface WorkerOutput {
  success: boolean;
  results: Array<{
    name: string;
    passed: boolean;
    error?: string;
    output?: string;
  }>;
  stdout: string[];
  stderr: string[];
  error?: string;
}

export class SandboxTestRunner {
  private tempDir: string | null = null;
  private readonly WORKER_TIMEOUT_MS = 30000; // 30 seconds

  /**
   * Run sandbox tests on generated code files using worker thread isolation
   */
  async runTests(files: Record<string, string>): Promise<SandboxTestResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      // Create temporary directory for generated files
      this.tempDir = await this.createTempDirectory();
      console.log(`[SandboxTestRunner] Created temp directory: ${this.tempDir}`);

      // Write all files to temp directory
      await this.writeFilesToTempDir(files);

      console.log(`[SandboxTestRunner] Starting worker thread to execute tests...`);

      // Execute tests in worker thread
      const workerResults = await this.runWorkerThread();

      const executionTimeMs = Date.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed;
      const memoryUsedMb = Math.round((endMemory - startMemory) / 1024 / 1024);

      // Process worker results
      const testsRun = workerResults.results.length;
      const testsPassed = workerResults.results.filter(r => r.passed).length;
      const testsFailed = testsRun - testsPassed;
      const errors = workerResults.results
        .filter(r => !r.passed)
        .map(r => `${r.name}: ${r.error || 'Unknown error'}`);

      if (workerResults.error) {
        errors.push(`Worker error: ${workerResults.error}`);
      }

      const passed = testsFailed === 0 && workerResults.success;

      console.log(`[SandboxTestRunner] Worker execution complete: ${testsPassed}/${testsRun} tests passed`);

      return {
        passed,
        testsRun,
        testsPassed,
        testsFailed,
        errors,
        executionTimeMs,
        memoryUsedMb,
        stdout: workerResults.stdout,
        stderr: workerResults.stderr,
        metadata: {
          executionTier: 'worker_threads',
          filesCount: Object.keys(files).length,
          workerIsolation: true,
        },
      };
    } catch (error: any) {
      console.error('[SandboxTestRunner] Fatal error:', error);
      
      const executionTimeMs = Date.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed;
      const memoryUsedMb = Math.round((endMemory - startMemory) / 1024 / 1024);

      return {
        passed: false,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 1,
        errors: [`Fatal error: ${error.message}`],
        executionTimeMs,
        memoryUsedMb,
        stdout: [],
        stderr: [error.message],
        metadata: {
          executionTier: 'worker_threads',
          filesCount: Object.keys(files).length,
          workerIsolation: false,
          fatalError: error.message,
        },
      };
    } finally {
      // Cleanup temp directory (ALWAYS cleanup - don't persist tempDir path)
      if (this.tempDir) {
        await this.cleanupTempDirectory();
        this.tempDir = null;
      }
    }
  }

  /**
   * Recursively read directory (Node 18 compatible)
   */
  private readDirRecursive(dir: string, baseDir: string = dir): string[] {
    const files: string[] = [];
    
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);
      
      if (entry.isDirectory()) {
        files.push(...this.readDirRecursive(fullPath, baseDir));
      } else {
        files.push(relativePath);
      }
    }
    
    return files;
  }

  /**
   * Run tests in worker thread with timeout
   */
  private async runWorkerThread(): Promise<WorkerOutput> {
    if (!this.tempDir) {
      throw new Error('Temp directory not initialized');
    }

    const workerPath = path.join(__dirname, 'sandbox-test-worker.js');
    
    // Check if worker file exists
    if (!fs.existsSync(workerPath)) {
      throw new Error(`Worker script not found at ${workerPath}`);
    }

    return new Promise((resolve, reject) => {
      let workerCompleted = false;
      
      // Create worker with temp directory and files info
      const worker = new Worker(workerPath, {
        workerData: {
          tempDir: this.tempDir,
          files: this.readDirRecursive(this.tempDir)
            .reduce((acc: Record<string, string>, file) => {
              const filePath = path.join(this.tempDir!, file);
              if (fs.statSync(filePath).isFile()) {
                acc[file] = fs.readFileSync(filePath, 'utf-8');
              }
              return acc;
            }, {}),
          timeout: this.WORKER_TIMEOUT_MS,
        },
      });

      // Set timeout for worker execution
      const timeout = setTimeout(() => {
        if (!workerCompleted) {
          workerCompleted = true;
          worker.terminate();
          reject(new Error(`Worker timed out after ${this.WORKER_TIMEOUT_MS}ms`));
        }
      }, this.WORKER_TIMEOUT_MS);

      // Listen for messages from worker
      worker.on('message', (message: WorkerOutput) => {
        if (!workerCompleted) {
          workerCompleted = true;
          clearTimeout(timeout);
          console.log(`[SandboxTestRunner] Worker completed with ${message.results.length} test results`);
          resolve(message);
        }
      });

      // Handle worker errors
      worker.on('error', (error) => {
        if (!workerCompleted) {
          workerCompleted = true;
          clearTimeout(timeout);
          console.error('[SandboxTestRunner] Worker error:', error);
          reject(error);
        }
      });

      // Handle worker exit
      worker.on('exit', (code) => {
        if (!workerCompleted) {
          workerCompleted = true;
          clearTimeout(timeout);
          
          if (code !== 0) {
            console.error(`[SandboxTestRunner] Worker exited with code ${code}`);
            reject(new Error(`Worker exited with code ${code}`));
          } else {
            // Worker exited cleanly but didn't send message
            resolve({
              success: false,
              results: [],
              stdout: [],
              stderr: [`Worker exited without sending results (code ${code})`],
              error: 'Worker exited prematurely',
            });
          }
        }
      });

      console.log('[SandboxTestRunner] Worker thread started');
    });
  }

  /**
   * Create temporary directory for testing
   */
  private async createTempDirectory(): Promise<string> {
    const tempDir = path.join(
      os.tmpdir(),
      `sandbox-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );
    await fs.promises.mkdir(tempDir, { recursive: true });
    return tempDir;
  }

  /**
   * Write generated files to temp directory
   */
  private async writeFilesToTempDir(files: Record<string, string>): Promise<void> {
    if (!this.tempDir) {
      throw new Error('Temp directory not initialized');
    }

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(this.tempDir, filePath);
      const dir = path.dirname(fullPath);

      // Create directory if it doesn't exist
      await fs.promises.mkdir(dir, { recursive: true });

      // Write file
      await fs.promises.writeFile(fullPath, content, 'utf-8');
      console.log(`[SandboxTestRunner] Written file: ${filePath}`);
    }
  }

  /**
   * Cleanup temporary directory
   */
  private async cleanupTempDirectory(): Promise<void> {
    if (!this.tempDir) {
      return;
    }

    try {
      await fs.promises.rm(this.tempDir, { recursive: true, force: true });
      console.log(`[SandboxTestRunner] Cleaned up temp directory`);
    } catch (error: any) {
      console.warn(`[SandboxTestRunner] Failed to cleanup temp directory: ${error.message}`);
    }
  }
}

export const sandboxTestRunner = new SandboxTestRunner();
