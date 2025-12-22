// Sprint 1 - Task 1.3: Batch Generate Entity Embeddings
// Script para gerar embeddings de suppliers, invoices e projects existentes

import { embeddingService } from '../services/embedding.service';
import { db } from '../db';
import { tenants } from '../../../shared/schema';

async function batchGenerateAllEmbeddings() {
  console.log('🚀 Starting batch embedding generation...\n');
  
  try {
    // 1. Get all tenants
    const allTenants = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
    
    console.log(`📊 Found ${allTenants.length} tenants\n`);
    
    // 2. Process each tenant
    for (const tenant of allTenants) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📦 Processing tenant: ${tenant.name} (${tenant.id})`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      
      // 3. Generate supplier embeddings
      console.log(`🏢 Generating supplier embeddings...`);
      const supplierCount = await embeddingService.batchGenerateSupplierEmbeddings(tenant.id);
      console.log(`✅ Supplier embeddings: ${supplierCount} successful\n`);
      
      // 4. Generate invoice embeddings
      console.log(`📄 Generating invoice embeddings...`);
      const invoiceCount = await embeddingService.batchGenerateInvoiceEmbeddings(tenant.id);
      console.log(`✅ Invoice embeddings: ${invoiceCount} successful\n`);
      
      // 5. Generate project embeddings
      console.log(`📋 Generating project embeddings...`);
      const projectCount = await embeddingService.batchGenerateProjectEmbeddings(tenant.id);
      console.log(`✅ Project embeddings: ${projectCount} successful\n`);
      
      console.log(`📊 Tenant summary: ${supplierCount} suppliers + ${invoiceCount} invoices + ${projectCount} projects`);
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Batch generation complete!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Error in batch generation:`, error);
    process.exit(1);
  }
}

// Execute
batchGenerateAllEmbeddings();
