import xlsx from 'xlsx';
import { db } from '../apps/api/db';
import { commercialLeads } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as iconv from 'iconv-lite';

const TENANT_ID = '464d1492-ff64-4e11-814e-b4e416b9c250';
const OWNER_MAP: Record<string, string> = {
  'Ana': 'a732bfb7-80c9-4613-b64b-311f920acd1a',
  'Miguel': 'fd7c0264-a350-45cc-ac40-eeb307bd09bb',
};
const DEFAULT_OWNER = '2a2d43b1-1baa-44bd-ac16-0bb546977835';

const MONTH_MAP: Record<string, number> = {
  'janeiro': 1, 'jan': 1, 'jan.': 1,
  'fevereiro': 2, 'fev': 2, 'fev.': 2,
  'março': 3, 'mar': 3, 'mar.': 3, 'marco': 3,
  'abril': 4, 'abr': 4, 'abr.': 4,
  'maio': 5, 'mai': 5, 'mai.': 5,
  'junho': 6, 'jun': 6, 'jun.': 6,
  'julho': 7, 'jul': 7, 'jul.': 7, 'julh': 7,
  'agosto': 8, 'ago': 8, 'ago.': 8,
  'setembro': 9, 'set': 9, 'set.': 9, 'setembrro': 9, 'sete': 9,
  'outubro': 10, 'out': 10, 'out.': 10, 'outu': 10,
  'novembro': 11, 'nov': 11, 'nov.': 11,
  'dezembro': 12, 'dez': 12, 'dez.': 12,
};

const STATUS_MAP: Record<string, string> = {
  'Proposta Enviada': 'new',
  'WIN': 'won', 'win': 'won',
  'LOST': 'lost', 'lost': 'lost',
  'Cancelado': 'lost', 'cancelado': 'lost',
};

function parseEventDate(dataCol: string | undefined, yearCol: number | string | undefined): Date | null {
  if (!dataCol) return null;
  
  const data = String(dataCol).trim().toLowerCase();
  let year = typeof yearCol === 'number' ? yearCol : parseInt(String(yearCol || ''));
  
  if (isNaN(year) || year < 2020 || year > 2030) return null;
  
  const match = data.match(/^(\d{1,2})\s+(.+)$/);
  if (!match) return null;
  
  const day = parseInt(match[1]);
  const monthText = match[2].trim().replace(/\.$/, '').toLowerCase();
  const month = MONTH_MAP[monthText];
  
  if (!month || isNaN(day) || day < 1 || day > 31) return null;
  
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (isNaN(date.getTime())) return null;
  
  return date;
}

function parseNumPax(value: string | number | undefined): number | null {
  if (!value) return null;
  const str = String(value).trim();
  const match = str.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function parseValue(value: string | number | undefined): number | null {
  if (!value) return null;
  const str = String(value).replace(/[€\s]/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function getCol(row: any, ...patterns: string[]): string | undefined {
  for (const key of Object.keys(row)) {
    const keyLower = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const pattern of patterns) {
      const patternNorm = pattern.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (keyLower.includes(patternNorm)) {
        const val = row[key];
        return val !== undefined && val !== null ? String(val).trim() : undefined;
      }
    }
  }
  return undefined;
}

async function importLeads() {
  console.log('Starting import with UTF-8 encoding...');
  
  await db.delete(commercialLeads).where(eq(commercialLeads.tenantId, TENANT_ID));
  console.log('Deleted existing leads');
  
  const csvPath = 'attached_assets/Comercial - Propostas2025 (2)_1764074293047.csv';
  
  // Read with proper encoding
  const workbook = xlsx.readFile(csvPath, { codepage: 65001 });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const records = xlsx.utils.sheet_to_json(sheet, { raw: false, defval: '' }) as any[];
  
  console.log(`Found ${records.length} records in CSV`);
  
  const leadsToInsert: any[] = [];
  let skipped = 0;
  let withDates = 0;
  let withBudget = 0;
  
  for (const row of records) {
    const proposalNumber = getCol(row, 'proposta');
    if (!proposalNumber || proposalNumber === '' || proposalNumber.toLowerCase() === 'n/a') {
      skipped++;
      continue;
    }
    
    const ownerName = getCol(row, 'onwer', 'owner');
    const ownerId = OWNER_MAP[ownerName || ''] || DEFAULT_OWNER;
    
    const dataCol = row['Data'];
    const yearCol = row['Ano'];
    const eventDate = parseEventDate(dataCol, yearCol);
    if (eventDate) withDates++;
    
    const eventYear = typeof yearCol === 'number' ? yearCol : (yearCol ? parseInt(String(yearCol)) : null);
    
    const estado = getCol(row, 'estado');
    const status = STATUS_MAP[estado || ''] || 'new';
    
    const numPax = parseNumPax(getCol(row, 'pax'));
    const valuePerPax = parseValue(getCol(row, 'valor pax'));
    
    let budgetTotal: string | null = null;
    if (numPax && valuePerPax) {
      budgetTotal = (numPax * valuePerPax).toFixed(2);
      withBudget++;
    }
    
    const leadBase = {
      tenantId: TENANT_ID,
      proposalNumber: proposalNumber,
      description: getCol(row, 'descri'),
      contactName: getCol(row, 'descri') || getCol(row, 'nome'),
      status,
      ownerId,
      leadSource: getCol(row, 'lead'),
      eventType: getCol(row, 'tipo evento', 'tipo'),
      location: getCol(row, 'localiza'),
      eventDate,
      eventYear: !isNaN(eventYear as number) ? eventYear : null,
      numPax,
      valuePerPax: valuePerPax?.toFixed(2) || null,
      budgetTotal,
      comments: getCol(row, 'coment'),
    };
    
    leadsToInsert.push({ ...leadBase, environment: 'production' });
    leadsToInsert.push({ ...leadBase, environment: 'sandbox' });
  }
  
  console.log(`Prepared ${leadsToInsert.length} records (${leadsToInsert.length/2} leads x 2 environments)`);
  console.log(`With dates: ${withDates}, With budget: ${withBudget}, Skipped: ${skipped}`);
  
  const BATCH_SIZE = 100;
  for (let i = 0; i < leadsToInsert.length; i += BATCH_SIZE) {
    const batch = leadsToInsert.slice(i, i + BATCH_SIZE);
    await db.insert(commercialLeads).values(batch);
  }
  
  console.log(`Inserted ${leadsToInsert.length} leads`);
  
  // Sample check
  const sampleRes = await db.execute(sql`
    SELECT proposal_number, contact_name, description, event_date
    FROM commercial_leads 
    WHERE tenant_id = ${TENANT_ID} AND environment = 'production'
    LIMIT 5
  `);
  console.log('Sample:', sampleRes.rows);
  
  process.exit(0);
}

importLeads().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
