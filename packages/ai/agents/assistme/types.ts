/**
 * AssistME Hybrid Intelligence Engine - Type Definitions
 * 
 * Defines the 4-tier routing system for optimizing latency and cost:
 * - TRIVIAL: Cache + FAQ, no LLM (<1s) - Target: 80% of queries
 * - SIMPLE: Single tool, template-based (1-2s) - Target: 15% of queries
 * - MODERATE: Multi-tool, lightweight LLM (2-4s) - Target: 4% of queries
 * - COMPLEX: Full orchestration (4-8s) - Target: 1% of queries
 */

export enum HybridMode {
  TRIVIAL = 'trivial',    // 80% - <1s - Cache + FAQ, no LLM
  SIMPLE = 'simple',      // 15% - 1-2s - Single tool, minimal LLM
  MODERATE = 'moderate',  // 4% - 2-4s - Multi-tool, lightweight LLM
  COMPLEX = 'complex'     // 1% - 4-8s - Full orchestration
}

export interface ClassificationResult {
  mode: HybridMode;
  confidence: number; // 0-1, how confident we are in this classification
  metadata?: {
    matchedPattern?: string;    // Which pattern triggered this classification
    requiredTools?: string[];   // Tools that will likely be needed
    complexity?: number;         // Complexity score (0-100)
    detectedIntent?: string;    // Detected user intent
    cacheHit?: boolean;         // Whether this can be served from cache
  };
}

export interface HybridResponse {
  content: string;
  mode: HybridMode;
  duration_ms: number;
  tools_used?: string[];
  cost_usd?: number;
  cached?: boolean;
  metadata?: {
    classification_confidence?: number;
    fallback_from_mode?: HybridMode; // If we had to fallback
    error?: string;
  };
}

export interface TenantContext {
  tenantId: string;
  userId: string;
  conversationId?: string;
  userRole?: string;
  environment?: 'sandbox' | 'production';
}

/**
 * Extended context with attachment support
 */
export interface HybridContext extends TenantContext {
  attachments?: Array<{
    id: string;
    type: string;
    url: string;
    originalName?: string;
    mimeType?: string;
    size?: number;
    metadata?: any;
  }>;
}

/**
 * Enhanced streaming callbacks for real-time progress tracking
 * Supports granular events for better UX and debugging
 */
export interface StreamCallbacks {
  // Simple progress messages (backward compatible - handlers use this with 1 arg)
  onProgress?: (message: string) => void;
  
  // Structured progress with stage + message (orchestrator uses this with 2 args)
  onStageProgress?: (stage: string, message: string) => void;
  
  // Tool execution tracking
  onToolStart?: (toolName: string, params: any) => void;
  onToolProgress?: (toolName: string, progress: { percentage: number; message: string }) => void;
  onToolComplete?: (toolName: string, result: any) => void;
  
  // Content streaming (choose onToken for word-by-word OR onStreamChunk for sentence-by-sentence)
  onToken?: (token: string) => void;         // Word-by-word streaming (smoother but more events)
  onStreamChunk?: (chunk: string) => void;   // Sentence-by-sentence streaming (current)
  
  // Completion and error handling
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export interface HandlerOptions extends StreamCallbacks {
  context: TenantContext;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  attachments?: any[]; // File attachments (documents, invoices, images, etc.)
}

/**
 * FAQ Entry structure for Trivial mode
 */
export interface FAQEntry {
  id: string;
  question: string;
  answer: string;
  patterns: string[];           // Regex patterns or keywords to match
  category?: string;
  locale?: 'pt-PT' | 'pt-BR' | 'en';
  confidence_threshold?: number; // Min confidence to match (0-1)
}

/**
 * Simple mode intent mapping
 */
export interface SimpleIntent {
  intent: string;               // e.g., "list_invoices", "create_task"
  tool: string;                 // Tool name to execute
  parameterExtractor?: string;  // Optional: regex to extract params
  responseTemplate: string;     // Template for formatting response
}

/**
 * Telemetry event for tracking metrics
 */
export interface TelemetryEvent {
  timestamp: Date;
  tenantId: string;
  userId: string;
  mode: HybridMode;
  duration_ms: number;
  success: boolean;
  tools_used?: string[];
  cost_usd?: number;
  error?: string;
  query_length: number;
  classification_confidence: number;
}

/**
 * Cache entry structure
 */
export interface CacheEntry {
  key: string;
  value: string;
  mode: HybridMode;
  timestamp: Date;
  ttl_seconds: number;
  tenantId: string;
}
