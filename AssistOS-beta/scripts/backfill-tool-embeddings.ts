/**
 * Backfill Tool Embeddings Script
 * 
 * Generates AI embeddings for all 153 AssistME tools and stores them in the database.
 * This enables semantic tool selection powered by OpenAI embeddings + pgvector.
 * 
 * Usage:
 *   npm run tsx scripts/backfill-tool-embeddings.ts
 * 
 * Cost estimate:
 *   ~153 tools × ~50 tokens each = 7,650 tokens
 *   text-embedding-3-small: $0.00002 per 1K tokens
 *   Total cost: ~$0.00015 (negligible)
 * 
 * Performance:
 *   ~10-15 seconds for batch embedding generation
 */

import { toolRegistry } from '../packages/ai/tools/kernel/registry';
import { toolEmbeddingService } from '../packages/ai/services/tool-embedding.service';

// Import all AssistME tools to auto-register them
import '../packages/ai/agents/assistme/index';

async function backfillToolEmbeddings() {
  console.log('[Backfill] Starting tool embeddings generation...\n');
  
  const startTime = Date.now();
  
  try {
    // Get all tool manifests from registry
    const allManifests = toolRegistry.getAllManifests();
    console.log(`[Backfill] Found ${allManifests.length} tools in registry\n`);
    
    if (allManifests.length === 0) {
      console.error('[Backfill] ❌ No tools found in registry. Make sure tools are imported.');
      process.exit(1);
    }
    
    // Group tools by category for better logging
    const toolsByCategory = allManifests.reduce((acc, manifest) => {
      if (!acc[manifest.category]) {
        acc[manifest.category] = [];
      }
      acc[manifest.category].push(manifest);
      return acc;
    }, {} as Record<string, typeof allManifests>);
    
    console.log('Tools by category:');
    for (const [category, tools] of Object.entries(toolsByCategory)) {
      console.log(`  - ${category}: ${tools.length} tools`);
    }
    console.log('');
    
    // Generate embeddings in batches of 50 (OpenAI batch limit: 100)
    const batchSize = 50;
    let processed = 0;
    let errors = 0;
    
    for (let i = 0; i < allManifests.length; i += batchSize) {
      const batch = allManifests.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allManifests.length / batchSize);
      
      console.log(`[Backfill] Processing batch ${batchNum}/${totalBatches} (${batch.length} tools)...`);
      
      try {
        // Generate embeddings for batch
        const embeddings = await toolEmbeddingService.generateToolEmbeddingsBatch(batch);
        
        // Store each embedding in database
        for (const manifest of batch) {
          try {
            const embedding = embeddings.get(manifest.name);
            if (!embedding) {
              console.warn(`  ⚠️  No embedding generated for ${manifest.name}`);
              errors++;
              continue;
            }
            
            await toolEmbeddingService.storeToolEmbedding(
              manifest.name,
              manifest.category,
              manifest.description,
              embedding,
              {
                scope: manifest.scope === 'unknown' ? undefined : manifest.scope,
                requiresAuth: manifest.requiresAuth,
                estimatedDuration: manifest.estimatedDuration,
              }
            );
            
            processed++;
            
            // Log progress every 10 tools
            if (processed % 10 === 0) {
              console.log(`  ✅ Processed ${processed}/${allManifests.length} tools...`);
            }
          } catch (error) {
            console.error(`  ❌ Error storing ${manifest.name}:`, error);
            errors++;
          }
        }
      } catch (error) {
        console.error(`  ❌ Batch ${batchNum} failed:`, error);
        errors += batch.length;
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(60));
    console.log('Backfill Complete!');
    console.log('='.repeat(60));
    console.log(`✅ Successfully processed: ${processed}/${allManifests.length} tools`);
    if (errors > 0) {
      console.log(`❌ Errors: ${errors} tools`);
    }
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`💰 Estimated cost: ~$0.00015 (negligible)`);
    console.log('='.repeat(60) + '\n');
    
    // Get and display statistics
    const stats = await toolEmbeddingService.getToolStats();
    console.log('Tool Statistics:');
    console.log(`  Total tools with embeddings: ${stats.totalTools}`);
    console.log(`  Ready for semantic search: ✅`);
    console.log('');
    
    if (errors > 0) {
      console.warn('\n⚠️  Some tools failed to process. Review errors above.');
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error during backfill:', error);
    process.exit(1);
  }
}

// Run the backfill
backfillToolEmbeddings();
