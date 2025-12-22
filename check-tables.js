#!/usr/bin/env node

import { pool } from './apps/worker/db.js';

async function checkTables() {
  try {
    const tenantId = 'ab29c3c4-85e0-41f6-8200-fe696d39584e';
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    
    console.log(`Checking tables in schema: ${schemaName}`);
    
    // Check if schema exists
    const schemaResult = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = $1
    `, [schemaName]);
    
    if (schemaResult.rows.length === 0) {
      console.log('❌ Schema does not exist');
      console.log('Available schemas:');
      const allSchemas = await pool.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        ORDER BY schema_name
      `);
      allSchemas.rows.forEach(row => console.log(`  - ${row.schema_name}`));
      return;
    }
    
    console.log('✅ Schema exists');
    
    // List all tables in the schema
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1 
      ORDER BY table_name
    `, [schemaName]);
    
    console.log(`\nTables in ${schemaName}:`);
    if (tablesResult.rows.length === 0) {
      console.log('  No tables found');
    } else {
      tablesResult.rows.forEach(row => console.log(`  - ${row.table_name}`));
    }
    
    // Also check public schema
    console.log('\nTables in public schema:');
    const publicTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    if (publicTables.rows.length === 0) {
      console.log('  No tables found');
    } else {
      publicTables.rows.forEach(row => console.log(`  - ${row.table_name}`));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkTables();