#!/usr/bin/env node

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  const apiKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_DATABASE_ID;

  console.log('🔑 API Key (first 10):', apiKey?.substring(0, 10) + '...');
  console.log('🗄️  Database ID:', dbId);
  console.log('');

  const notion = new Client({ auth: apiKey });

  console.log('📋 Testing Database API...\n');

  // Test 1: Try databases.retrieve
  try {
    console.log('Test 1: notion.databases.retrieve()...');
    const db = await notion.databases.retrieve({ database_id: dbId! });
    console.log('✅ Database found via databases.retrieve():');
    console.log('   Title:', (db as any).title?.[0]?.plain_text || 'N/A');
    
    // Check if it has data_sources
    if ('data_sources' in db && Array.isArray((db as any).data_sources)) {
      console.log('   Data Sources:', (db as any).data_sources.length);
      const dataSourceId = (db as any).data_sources[0]?.id;
      console.log('   Data Source ID:', dataSourceId);
      
      if (dataSourceId) {
        console.log('\n💡 Use this ID for syncing:');
        console.log(`   NOTION_DATABASE_ID=${dataSourceId}`);
      }
    }
  } catch (error: any) {
    console.error('❌ databases.retrieve() failed:', error.message);
  }

  console.log('\n');

  // Test 2: Try dataSources.query directly
  try {
    console.log('Test 2: notion.dataSources.query()...');
    const response = await notion.dataSources.query({
      data_source_id: dbId!,
    });
    console.log('✅ DataSource query succeeded!');
    console.log(`   Found ${response.results.length} pages`);
  } catch (error: any) {
    console.error('❌ dataSources.query() failed:', error.message);
  }

  console.log('\n');

  // Test 3: Search for data sources (new API)
  try {
    console.log('Test 3: Searching for all accessible data sources...');
    const search = await notion.search({
      filter: { property: 'object', value: 'data_source' },
    });
    
    console.log(`✅ Found ${search.results.length} accessible data sources:\n`);
    
    for (const result of search.results) {
      console.log(`   📊 Data Source`);
      console.log(`      ID: ${result.id}`);
      console.log(`      Object: ${(result as any).object}`);
      
      if ('name' in result) {
        console.log(`      Name: ${(result as any).name}`);
      }
      
      console.log('');
    }
    
    if (search.results.length === 0) {
      console.log('⚠️  No data sources found. This means:');
      console.log('   1. The integration token is wrong, OR');
      console.log('   2. No databases are shared with this integration');
      console.log('\n💡 Solution:');
      console.log('   - Verify NOTION_API_KEY is from "assistOS_GO_LIVE" integration');
      console.log('   - Make sure database is shared with the integration');
    }
  } catch (error: any) {
    console.error('❌ Search failed:', error.message);
  }
  
  // Test 4: Search for pages
  try {
    console.log('\nTest 4: Searching for all accessible pages...');
    const search = await notion.search({
      filter: { property: 'object', value: 'page' },
    });
    
    console.log(`✅ Found ${search.results.length} accessible pages\n`);
    
    for (const result of search.results.slice(0, 5)) {
      if ('properties' in result) {
        const title = (result as any).properties?.title?.title?.[0]?.plain_text || 'Untitled';
        console.log(`   📄 ${title}`);
        console.log(`      ID: ${result.id}`);
        console.log('');
      }
    }
  } catch (error: any) {
    console.error('❌ Search pages failed:', error.message);
  }
}

testConnection();
