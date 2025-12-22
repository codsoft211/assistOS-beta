/**
 * Catalog Synchronization Service
 * 
 * Auto-sync de módulos, agents e workflows do código para a base de dados.
 * Garante que o catálogo está sempre atualizado com os recursos disponíveis.
 * 
 * Executado no boot do servidor.
 */

import { db } from '../../../apps/api/db';
import { moduleTemplates, workflowTemplates } from '../../../shared/schema';
import { ModuleRegistryService } from '../../modules/base/module-registry.service';
import { eq } from 'drizzle-orm';

/**
 * Sync module catalog from ModuleRegistry to database
 * 
 * Single source of truth: Module code (IModule.metadata)
 * Target: module_templates table
 */
export async function syncModuleCatalog(): Promise<void> {
  console.log('[SyncCatalogs] 🔄 Syncing module catalog...');
  
  try {
    const registeredModules = ModuleRegistryService.moduleRegistry;
    let syncedCount = 0;
    
    for (const [moduleId, factory] of Array.from(registeredModules.entries())) {
      try {
        // Instantiate module to get metadata
        const module = factory();
        const metadata = module.metadata;
        
        // Extract features from metadata
        const features: string[] = [];
        
        // Add description as first feature if exists
        if (metadata.description) {
          features.push(metadata.description);
        }
        
        // Upsert to database
        const existing = await db
          .select()
          .from(moduleTemplates)
          .where(eq(moduleTemplates.slug, metadata.id))
          .limit(1);
        
        if (existing.length > 0) {
          // Update existing
          await db
            .update(moduleTemplates)
            .set({
              name: metadata.name,
              description: metadata.description,
              icon: metadata.icon,
              category: metadata.category,
              features: features,
              isActive: true,
            })
            .where(eq(moduleTemplates.slug, metadata.id));
        } else {
          // Insert new
          await db.insert(moduleTemplates).values({
            name: metadata.name,
            slug: metadata.id,
            description: metadata.description,
            icon: metadata.icon,
            category: metadata.category,
            features: features,
            isActive: true,
          });
        }
        
        syncedCount++;
        console.log(`[SyncCatalogs]   ✓ ${metadata.name} (${metadata.id})`);
      } catch (error) {
        console.error(`[SyncCatalogs]   ✗ Error syncing module ${moduleId}:`, error);
      }
    }
    
    console.log(`[SyncCatalogs] ✅ Synced ${syncedCount} modules to catalog`);
  } catch (error) {
    console.error('[SyncCatalogs] ❌ Failed to sync module catalog:', error);
    throw error;
  }
}

/**
 * Sync workflow templates from modules to database
 * 
 * Single source of truth: Module.workflows
 * Target: workflow_templates table
 */
export async function syncWorkflowTemplates(): Promise<void> {
  console.log('[SyncCatalogs] 🔄 Syncing workflow templates...');
  
  try {
    const registeredModules = ModuleRegistryService.moduleRegistry;
    let syncedCount = 0;
    
    for (const [moduleId, factory] of Array.from(registeredModules.entries())) {
      try {
        const module = factory();
        
        // Get workflows from module
        const workflows = module.workflows || [];
        
        for (const workflow of workflows) {
          // Generate unique code for workflow
          const workflowCode = `${moduleId}_${workflow.name}`;
          
          const existing = await db
            .select()
            .from(workflowTemplates)
            .where(eq(workflowTemplates.code, workflowCode))
            .limit(1);
          
          // Extract workflow data
          const workflowData = {
            name: (workflow as any).displayName || workflow.name,
            description: (workflow as any).description,
            category: module.metadata.category,
            moduleId: module.metadata.id,
            triggerType: 'event' as const, // Default, can be overridden
            steps: (workflow as any).steps || [],
            states: (workflow as any).states || [],
            automations: (workflow as any).automations || [],
            isSystem: true,
            isActive: true,
          };
          
          if (existing.length > 0) {
            // Update existing
            await db
              .update(workflowTemplates)
              .set(workflowData)
              .where(eq(workflowTemplates.code, workflowCode));
          } else {
            // Insert new
            await db.insert(workflowTemplates).values({
              code: workflowCode,
              ...workflowData,
            });
          }
          
          syncedCount++;
          console.log(`[SyncCatalogs]   ✓ ${workflowData.name} (${workflowCode})`);
        }
      } catch (error) {
        console.error(`[SyncCatalogs]   ✗ Error syncing workflows for module ${moduleId}:`, error);
      }
    }
    
    console.log(`[SyncCatalogs] ✅ Synced ${syncedCount} workflow templates to catalog`);
  } catch (error) {
    console.error('[SyncCatalogs] ❌ Failed to sync workflow templates:', error);
    throw error;
  }
}

/**
 * Sync all catalogs
 * Called on server startup
 */
export async function syncAllCatalogs(): Promise<void> {
  console.log('[SyncCatalogs] 🚀 Starting catalog synchronization...');
  
  const startTime = Date.now();
  
  try {
    await syncModuleCatalog();
    await syncWorkflowTemplates();
    
    const duration = Date.now() - startTime;
    console.log(`[SyncCatalogs] ✅ All catalogs synced successfully in ${duration}ms`);
  } catch (error) {
    console.error('[SyncCatalogs] ❌ Catalog sync failed:', error);
    throw error;
  }
}
