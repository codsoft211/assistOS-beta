import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID!;

async function analyzePage() {
  console.log('🔍 Procurando página "assistStart"...\n');
  
  const response = await notion.dataSources.query({
    data_source_id: databaseId,
  });
  
  console.log(`📊 Total de páginas na database: ${response.results.length}\n`);
  
  // Procurar por "assistStart"
  for (const page of response.results) {
    if (page.object === 'page' && 'properties' in page) {
      const props = page.properties;
      
      const title = (props['Title'] as any)?.title?.[0]?.plain_text || '';
      const bugId = (props['Bug ID'] as any)?.rich_text?.[0]?.plain_text || '';
      
      // Procurar em todas as propriedades
      const allText = JSON.stringify(props).toLowerCase();
      
      if (allText.includes('assiststart') || title.toLowerCase().includes('assiststart') || bugId.toLowerCase().includes('assiststart')) {
        console.log('✅ ENCONTREI a página "assistStart"!\n');
        console.log('═══════════════════════════════════════\n');
        console.log(`📄 Título: ${title}`);
        console.log(`🔢 Bug ID: ${bugId}`);
        console.log(`🆔 Page ID: ${page.id}\n`);
        
        console.log('📋 TODAS AS PROPRIEDADES:\n');
        
        for (const [key, value] of Object.entries(props)) {
          console.log(`${key}:`);
          
          if ((value as any).type === 'title') {
            const text = (value as any).title?.[0]?.plain_text || '';
            console.log(`  ${text}\n`);
          } else if ((value as any).type === 'rich_text') {
            const text = (value as any).rich_text?.[0]?.plain_text || '';
            console.log(`  ${text}\n`);
          } else if ((value as any).type === 'select') {
            const select = (value as any).select?.name || '';
            console.log(`  ${select}\n`);
          } else if ((value as any).type === 'date') {
            const date = (value as any).date?.start || '';
            console.log(`  ${date}\n`);
          } else if ((value as any).type === 'files') {
            const files = (value as any).files || [];
            console.log(`  ${files.length} ficheiros`);
            files.forEach((f: any) => {
              console.log(`    - ${f.name}: ${f.external?.url || f.file?.url}`);
            });
            console.log('');
          } else {
            console.log(`  (${(value as any).type})\n`);
          }
        }
        
        console.log('═══════════════════════════════════════\n');
        return;
      }
    }
  }
  
  console.log('❌ Não encontrei nenhuma página com "assistStart"\n');
  console.log('📋 Páginas disponíveis:\n');
  
  for (const page of response.results.slice(0, 10)) {
    if (page.object === 'page' && 'properties' in page) {
      const title = (page.properties['Title'] as any)?.title?.[0]?.plain_text || 'Untitled';
      const bugId = (page.properties['Bug ID'] as any)?.rich_text?.[0]?.plain_text || '';
      console.log(`  - ${bugId}: ${title}`);
    }
  }
}

analyzePage().catch(console.error);
