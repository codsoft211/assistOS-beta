#!/usr/bin/env node

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config();

async function discoverProperties() {
  const apiKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_DATABASE_ID;

  const notion = new Client({ auth: apiKey });

  console.log('🔍 Discovering Notion database properties...\n');

  // Fetch first page to see properties
  const response = await notion.dataSources.query({
    data_source_id: dbId!,
    page_size: 1,
  });

  if (response.results.length === 0) {
    console.log('❌ No pages found in database');
    return;
  }

  const page = response.results[0];
  
  if ('properties' in page) {
    console.log('📊 Available Properties:\n');
    
    const props = page.properties;
    const propertyNames = Object.keys(props);
    
    propertyNames.forEach((name, index) => {
      const prop = props[name];
      console.log(`${index + 1}. "${name}"`);
      console.log(`   Type: ${(prop as any).type}`);
      console.log('');
    });

    console.log('\n✅ Copy these exact names for your code:');
    propertyNames.forEach(name => {
      console.log(`   "${name}"`);
    });
  }
}

discoverProperties();
