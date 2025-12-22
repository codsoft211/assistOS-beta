#!/usr/bin/env tsx
/**
 * Validation Script: Post-Migration 001
 * 
 * Verifica se os índices únicos foram criados corretamente
 * nas 5 tabelas de embeddings após execução manual do SQL.
 * 
 * Usage:
 *   tsx scripts/validate-migration-001.ts
 * 
 * Exit codes:
 *   0 - Todos os índices criados com sucesso
 *   1 - Um ou mais índices faltando
 */

import { db } from '../apps/api/db.js';
import { sql } from 'drizzle-orm';

const REQUIRED_INDEXES = [
  'supplier_embeddings_unique',
  'invoice_embeddings_unique',
  'project_embeddings_unique',
  'client_embeddings_unique',
  'product_embeddings_unique',
];

async function validateIndexes() {
  console.log('🔍 Validando índices de embeddings...\n');

  try {
    // Query para verificar índices existentes
    const result = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        indexname
      FROM pg_indexes
      WHERE indexname IN ('supplier_embeddings_unique', 'invoice_embeddings_unique', 'project_embeddings_unique', 'client_embeddings_unique', 'product_embeddings_unique')
      ORDER BY tablename;
    `);

    const foundIndexes = result.rows.map((row: any) => row.indexname);
    
    console.log('📊 Resultados:');
    console.log('─'.repeat(60));
    
    let allFound = true;
    
    for (const requiredIndex of REQUIRED_INDEXES) {
      const found = foundIndexes.includes(requiredIndex);
      const status = found ? '✅' : '❌';
      const tableName = requiredIndex.replace('_unique', '');
      
      console.log(`${status} ${tableName}`);
      
      if (!found) {
        allFound = false;
      }
    }
    
    console.log('─'.repeat(60));
    console.log(`\n📈 Total: ${foundIndexes.length}/${REQUIRED_INDEXES.length} índices criados`);
    
    if (allFound) {
      console.log('\n✅ SUCESSO: Todos os índices foram criados corretamente!');
      console.log('\n🎯 Próximos passos:');
      console.log('   1. Executar regression tests: npx vitest run apps/api/tests/integration/');
      console.log('   2. Executar baseline script: tsx scripts/observability/perf-baseline.ts');
      console.log('   3. Validar SLOs e decidir sobre BUG #2 (performance)\n');
      process.exit(0);
    } else {
      console.log('\n❌ ERRO: Alguns índices não foram criados.');
      console.log('\n🔧 Solução:');
      console.log('   Execute o SQL em migrations/manual/001_add_embedding_unique_constraints.sql');
      console.log('   via Replit Database tab.\n');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 Erro ao validar índices:', error);
    process.exit(1);
  }
}

// Execute
validateIndexes().catch(console.error);
