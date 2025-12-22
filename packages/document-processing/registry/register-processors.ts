/**
 * Processor Registration
 * 
 * Registers all document processors in the ProcessorRegistry.
 * This file is called at boot of the application.
 */

import { processorRegistry } from './ProcessorRegistry';
import { OpenAIVisionProcessor } from '../processors/OpenAIVisionProcessor';
import { GoogleInvoiceProcessor } from '../processors/GoogleInvoiceProcessor';
import { GoogleContractProcessor } from '../processors/GoogleContractProcessor';

/**
 * Register all processors
 */
export function registerAllProcessors(): void {
  console.log('[ProcessorRegistry] 🚀 Starting processor registration...');
  
  try {
    // Register OpenAI Vision processor (fallback)
    processorRegistry.register(new OpenAIVisionProcessor());
    console.log('[ProcessorRegistry] ✅ Registered: openai-vision-generic');
  } catch (error) {
    console.error('[ProcessorRegistry] ❌ Failed to register OpenAI Vision processor:', error);
  }

  try {
    // Register Google Document AI processor (primary for invoices)
    processorRegistry.register(new GoogleInvoiceProcessor());
    console.log('[ProcessorRegistry] ✅ Registered: google-document-ai-invoice');
  } catch (error) {
    console.warn('[ProcessorRegistry] ⚠️  Google Document AI Invoice processor unavailable:', error);
  }

  try {
    // Register Google Document AI processor (primary for contracts)
    processorRegistry.register(new GoogleContractProcessor());
    console.log('[ProcessorRegistry] ✅ Registered: google-document-ai-contract');
  } catch (error) {
    console.warn('[ProcessorRegistry] ⚠️  Google Document AI Contract processor unavailable:', error);
  }

  const count = processorRegistry.getAll().length;
  console.log(`[ProcessorRegistry] 🎉 All processors registered! Total: ${count}`);
  console.log(`[ProcessorRegistry] Available processors: ${processorRegistry.getAll().map(p => p.name).join(', ')}`);
}

// Auto-register on import (for boot sequence)
console.log('[ProcessorRegistry] 📦 register-processors.ts loaded - calling registerAllProcessors()...');
registerAllProcessors();
