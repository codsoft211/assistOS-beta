import type { Client } from 'whatsapp-web.js';

export type SessionStatus = 
  | 'connecting' 
  | 'qr_ready' 
  | 'authenticated' 
  | 'ready' 
  | 'disconnected' 
  | 'error';

export interface SessionInfo {
  accountId: string;
  userId: string;
  tenantId: string;
  environment: string;
  status: SessionStatus;
  phoneNumber?: string;
  qrCode?: string;
  client?: Client;
  sessionData?: object;
  connectedAt?: Date;
  lastSeenAt?: Date;
  errorMessage?: string;
  clientInfo?: {
    platform?: string;
    phoneModel?: string;
    osVersion?: string;
  };
}

export interface CreateSessionOptions {
  accountId: string;
  userId: string;
  tenantId: string;
  environment: string;
}

export interface SessionEventEmitter {
  on(event: 'qr', listener: (accountId: string, qr: string) => void): void;
  on(event: 'authenticated', listener: (accountId: string, session: object) => void): void;
  on(event: 'ready', listener: (accountId: string, phoneNumber: string) => void): void;
  on(event: 'disconnected', listener: (accountId: string, reason?: string) => void): void;
  on(event: 'error', listener: (accountId: string, error: Error) => void): void;
  on(event: 'message', listener: (accountId: string, message: any) => void): void;
}
