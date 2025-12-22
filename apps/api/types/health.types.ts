/**
 * Health Check Types
 * 
 * Define tipos para verificação de saúde do sistema,
 * validando componentes críticos do fluxo de faturas.
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  status: HealthStatus;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

export interface DatabaseHealth extends ComponentHealth {
  connected: boolean;
  responseTimeMs?: number;
}

export interface RedisHealth extends ComponentHealth {
  connected: boolean;
  responseTimeMs?: number;
  percentiles?: {
    p75: number;
    p95: number;
  };
}

export interface SecretHealth extends ComponentHealth {
  configured: boolean;
  secretName: string;
}

export interface ProcessorHealth extends ComponentHealth {
  processorName: string;
  available: boolean;
  priority: number;
}

export interface ModuleHealth extends ComponentHealth {
  moduleId: string;
  registered: boolean;
  active?: boolean;
}

export interface InvoiceFlowHealth extends ComponentHealth {
  steps: {
    upload: boolean;
    ocr: boolean;
    validation: boolean;
    supplierCreation: boolean;
    invoiceCreation: boolean;
  };
}

export interface BackupHealth extends ComponentHealth {
  isConfigured: boolean;
  recommendedRetentionDays: number;
}

export interface QueueHealth extends ComponentHealth {
  queuesMonitored: number;
  queues?: Array<{
    queueName: string;
    totalDepth: number;
    status: 'healthy' | 'warning' | 'critical';
    waiting: number;
    active: number;
    delayed: number;
  }>;
  dlqDepth?: number;
}

export interface SystemHealth {
  overall: HealthStatus;
  timestamp: string;
  version: string;
  components: {
    database: DatabaseHealth;
    redis: RedisHealth;
    secrets: {
      openai: SecretHealth;
      anthropic: SecretHealth;
      googleDocAI: SecretHealth;
    };
    processors: ProcessorHealth[];
    modules: ModuleHealth[];
    invoiceFlow: InvoiceFlowHealth;
    backup: BackupHealth;
    queues: QueueHealth;
  };
}

export interface BasicHealth {
  status: HealthStatus;
  timestamp: string;
  message: string;
}
