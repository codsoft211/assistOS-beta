import { Queue, Worker, Job } from "bullmq";
import { redisConnection, checkRedisConnection } from "../../worker/config/redis.js";

let importQueue: Queue | null = null;
let importWorker: Worker | null = null;

interface ImportJobData {
  importRunId: string;
  tenantId: string;
  environment: string;
  connectorType: string;
  connectorConfigId: number;
  entityTypes: string[];
  preferences?: {
    skipDuplicates?: boolean;
    updateExisting?: boolean;
    dryRun?: boolean;
  };
}

export function getImportQueue(): Queue | null {
  return importQueue;
}

export async function initImportQueue(): Promise<void> {
  const isRedisAvailable = await checkRedisConnection();
  
  if (!isRedisAvailable) {
    console.log("[Import Worker] Redis not available, queue disabled");
    return;
  }

  try {
    importQueue = new Queue("connector-imports", {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    importWorker = new Worker(
      "connector-imports",
      async (job: Job<ImportJobData>) => {
        console.log(`[Import Worker] Processing job ${job.id}`);
        
        const { processConnectorImport } = await import("../services/connector-import-service");
        
        await processConnectorImport(job.data);
        
        console.log(`[Import Worker] Completed job ${job.id}`);
      },
      {
        connection: redisConnection,
        concurrency: 2,
        limiter: {
          max: 5,
          duration: 60000,
        },
      }
    );

    importWorker.on("completed", (job) => {
      console.log(`[Import Worker] Job ${job.id} completed successfully`);
    });

    importWorker.on("failed", (job, error) => {
      console.error(`[Import Worker] Job ${job?.id} failed:`, error.message);
    });

    importWorker.on("error", (error) => {
      console.error("[Import Worker] Worker error:", error);
    });

    console.log("[Import Worker] Queue and worker initialized");
  } catch (error) {
    console.error("[Import Worker] Failed to initialize:", error);
    importQueue = null;
    importWorker = null;
  }
}

export async function shutdownImportQueue(): Promise<void> {
  if (importWorker) {
    await importWorker.close();
    importWorker = null;
  }
  
  if (importQueue) {
    await importQueue.close();
    importQueue = null;
  }
  
  console.log("[Import Worker] Queue shut down");
}
