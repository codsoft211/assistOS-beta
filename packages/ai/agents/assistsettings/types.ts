import type { ToolManifest } from '../../tools/kernel';

export interface OrchestratorConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  tools: ToolManifest[];
}

export interface TenantContext {
  tenantId: string;
  userId: string;
  environment: 'sandbox' | 'production';
  selectedMenu?: 'perfil' | 'preferencias' | 'organizacao' | 'comunicacao' | 'conectores' | 'team' | 'studio';
}

export interface UserContext extends TenantContext {
  userEmail?: string;
  userName?: string;
  userRole?: string;
  isPlatformAdmin?: boolean;
}
