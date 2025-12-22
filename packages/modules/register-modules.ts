/**
 * Module Registration
 * 
 * Regista todos os módulos migrados no ModuleRegistry.
 * Este ficheiro é chamado no boot da aplicação.
 */

import { ModuleRegistryService } from './base/module-registry.service.js';
import { createComercialModule } from './comercial/index.js';
import { createFinanceiroModule } from './financeiro/index.js';
import { createLogisticaModule } from './logistica/index.js';
import { createProjetosModule } from './projetos/index.js';
import { createComprasModule } from './compras/index.js';
import { createAngariacaoModule } from './angariacao/index.js';
import { createHRModule } from './hr/index.js';
import { createProductionModule } from './production/index.js';
import { createAccountingModule } from './accounting/index.js';
import { createInventarioModule } from './inventario/index.js';

/**
 * Register all migrated modules
 */
export function registerAllModules(): void {
  console.log('[ModuleRegistry] 🚀 Starting module registration...');
  
  // PHASE 2 - CRM Module (POC - COMPLETE)
  ModuleRegistryService.registerModule('crm', () => createComercialModule());
  console.log('[ModuleRegistry] ✅ Registered: crm');
  
  // PHASE 2B - Financial Module (POC - COMPLETE)
  ModuleRegistryService.registerModule('financeiro', () => createFinanceiroModule());
  console.log('[ModuleRegistry] ✅ Registered: financeiro');
  
  // PHASE 2C - Logistics Module (EXPANDED - COMPLETE)
  ModuleRegistryService.registerModule('logistics', () => createLogisticaModule());
  console.log('[ModuleRegistry] ✅ Registered: logistics');
  
  // PHASE 3 - Projects Module (CONFIGURABLE - COMPLETE)
  ModuleRegistryService.registerModule('projects', () => createProjetosModule());
  console.log('[ModuleRegistry] ✅ Registered: projects');
  
  // PHASE 4 - Purchasing Module (AI-FIRST - COMPLETE)
  ModuleRegistryService.registerModule('purchasing', () => createComprasModule());
  console.log('[ModuleRegistry] ✅ Registered: purchasing');
  
  // PHASE 5 - Lead Generation Module (COMPLETE)
  ModuleRegistryService.registerModule('lead-generation', () => createAngariacaoModule());
  console.log('[ModuleRegistry] ✅ Registered: lead-generation');
  
  // PHASE 6 - HR Module (COMPLETE)
  ModuleRegistryService.registerModule('hr', () => createHRModule());
  console.log('[ModuleRegistry] ✅ Registered: hr');
  
  // PHASE 6 - Production Module (COMPLETE)
  ModuleRegistryService.registerModule('production', () => createProductionModule());
  console.log('[ModuleRegistry] ✅ Registered: production');
  
  // PHASE 6 - Accounting Module (COMPLETE)
  ModuleRegistryService.registerModule('accounting', () => createAccountingModule());
  console.log('[ModuleRegistry] ✅ Registered: accounting');
  
  // PHASE 7 - Inventory Module (Central Item Master)
  ModuleRegistryService.registerModule('inventory', () => createInventarioModule());
  console.log('[ModuleRegistry] ✅ Registered: inventory');
  
  const count = ModuleRegistryService.moduleRegistry.size;
  console.log(`[ModuleRegistry] 🎉 All ${count} modules registered successfully!`);
  console.log(`[ModuleRegistry] Available modules: ${Array.from(ModuleRegistryService.moduleRegistry.keys()).join(', ')}`);
}

// Auto-register on import (for boot sequence)
console.log('[ModuleRegistry] 📦 register-modules.ts loaded - calling registerAllModules()...');
registerAllModules();

// ==============================
// PROCESSOR REGISTRATION
// ==============================

import { processorRegistry } from '../document-processing/registry/ProcessorRegistry.js';
import { OpenAIVisionProcessor } from '../document-processing/processors/OpenAIVisionProcessor.js';
import { GoogleInvoiceProcessor } from '../document-processing/processors/GoogleInvoiceProcessor.js';

console.log('[ProcessorRegistry] 📦 Starting processor registration...');

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

const processorCount = processorRegistry.getAll().length;
console.log(`[ProcessorRegistry] 🎉 All processors registered! Total: ${processorCount}`);
console.log(`[ProcessorRegistry] Available processors: ${processorRegistry.getAll().map(p => p.name).join(', ')}`);
