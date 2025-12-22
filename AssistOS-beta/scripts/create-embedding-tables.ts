#!/usr/bin/env npx tsx

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function createEmbeddingTables() {
  console.log('🚀 Creating embedding tables...\n');

  try {
    // 1. Document Embeddings
    console.log('📄 Creating document_embeddings...');
    await sql`
      CREATE TABLE IF NOT EXISTS document_embeddings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR NOT NULL,
        document_id VARCHAR NOT NULL,
        embedding_source TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        environment TEXT NOT NULL DEFAULT 'production',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS document_embeddings_unique 
      ON document_embeddings(document_id, tenant_id, embedding_source, environment)
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS document_embeddings_document_idx ON document_embeddings(document_id)`;
    await sql`CREATE INDEX IF NOT EXISTS document_embeddings_tenant_idx ON document_embeddings(tenant_id)`;
    console.log('✅ document_embeddings created\n');

    // 2. Supplier Embeddings
    console.log('🏢 Creating supplier_embeddings...');
    await sql`
      CREATE TABLE IF NOT EXISTS supplier_embeddings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR NOT NULL,
        supplier_id VARCHAR NOT NULL,
        embedding_source TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        environment TEXT NOT NULL DEFAULT 'production',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS supplier_embeddings_unique 
      ON supplier_embeddings(supplier_id, tenant_id, embedding_source, environment)
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS supplier_embeddings_supplier_idx ON supplier_embeddings(supplier_id)`;
    await sql`CREATE INDEX IF NOT EXISTS supplier_embeddings_tenant_idx ON supplier_embeddings(tenant_id)`;
    console.log('✅ supplier_embeddings created\n');

    // 3. Invoice Embeddings
    console.log('🧾 Creating invoice_embeddings...');
    await sql`
      CREATE TABLE IF NOT EXISTS invoice_embeddings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR NOT NULL,
        invoice_id VARCHAR NOT NULL,
        embedding_source TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        environment TEXT NOT NULL DEFAULT 'production',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS invoice_embeddings_unique 
      ON invoice_embeddings(invoice_id, tenant_id, embedding_source, environment)
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS invoice_embeddings_invoice_idx ON invoice_embeddings(invoice_id)`;
    await sql`CREATE INDEX IF NOT EXISTS invoice_embeddings_tenant_idx ON invoice_embeddings(tenant_id)`;
    console.log('✅ invoice_embeddings created\n');

    // 4. Project Embeddings
    console.log('📊 Creating project_embeddings...');
    await sql`
      CREATE TABLE IF NOT EXISTS project_embeddings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR NOT NULL,
        project_id VARCHAR NOT NULL,
        embedding_source TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        environment TEXT NOT NULL DEFAULT 'production',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS project_embeddings_unique 
      ON project_embeddings(project_id, tenant_id, embedding_source, environment)
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS project_embeddings_project_idx ON project_embeddings(project_id)`;
    await sql`CREATE INDEX IF NOT EXISTS project_embeddings_tenant_idx ON project_embeddings(tenant_id)`;
    console.log('✅ project_embeddings created\n');

    // 5. Client Embeddings
    console.log('👤 Creating client_embeddings...');
    await sql`
      CREATE TABLE IF NOT EXISTS client_embeddings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR NOT NULL,
        client_id VARCHAR NOT NULL,
        embedding_source TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        environment TEXT NOT NULL DEFAULT 'production',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS client_embeddings_unique 
      ON client_embeddings(client_id, tenant_id, embedding_source, environment)
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS client_embeddings_client_idx ON client_embeddings(client_id)`;
    await sql`CREATE INDEX IF NOT EXISTS client_embeddings_tenant_idx ON client_embeddings(tenant_id)`;
    console.log('✅ client_embeddings created\n');

    // 6. Product Embeddings
    console.log('📦 Creating product_embeddings...');
    await sql`
      CREATE TABLE IF NOT EXISTS product_embeddings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR NOT NULL,
        product_id VARCHAR NOT NULL,
        embedding_source TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        environment TEXT NOT NULL DEFAULT 'production',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS product_embeddings_unique 
      ON product_embeddings(product_id, tenant_id, embedding_source, environment)
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS product_embeddings_product_idx ON product_embeddings(product_id)`;
    await sql`CREATE INDEX IF NOT EXISTS product_embeddings_tenant_idx ON product_embeddings(tenant_id)`;
    console.log('✅ product_embeddings created\n');

    // Verify all tables were created
    console.log('🔍 Verifying tables...');
    const result = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE '%_embeddings'
      ORDER BY table_name
    `;

    console.log('\n✅ Created tables:');
    result.forEach((row: any) => console.log(`  - ${row.table_name}`));
    console.log(`\n🎉 Total: ${result.length} embedding tables`);

  } catch (error) {
    console.error('❌ Error creating tables:', error);
    process.exit(1);
  }
}

createEmbeddingTables();
