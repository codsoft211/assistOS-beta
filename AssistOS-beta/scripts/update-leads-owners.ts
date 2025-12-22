import xlsx from 'xlsx';
import { db } from '../apps/api/db';
import { commercialLeads } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

const TENANT_ID = '464d1492-ff64-4e11-814e-b4e416b9c250';
const OWNER_MAP: Record<string, string> = {
  'Ana': 'a732bfb7-80c9-4613-b64b-311f920acd1a',
  'Miguel': 'fd7c0264-a350-45cc-ac40-eeb307bd09bb',
  'default': '2a2d43b1-1baa-44bd-ac16-0bb546977835',
};

const MONTH_MAP: Record<string, string> = {
  'janeiro': '01', 'jan': '01', 'jan.': '01',
  'fevereiro': '02', 'fev': '02', 'fev.': '02',
  'março': '03', 'mar': '03', 'mar.': '03',
  'abril': '04', 'abr': '04', 'abr.': '04',
  'maio': '05', 'mai': '05', 'mai.': '05',
  'junho': '06', 'jun': '06', 'jun.': '06',
  'julho': '07', 'jul': '07', 'jul.': '07',
  'agosto': '08', 'ago': '08', 'ago.': '08',
  'setembro': '09', 'set': '09', 'set.': '09', 'setembrro': '09',
  'outubro': '10', 'out': '10', 'out.': '10',
  'novembro': '11', 'nov': '11', 'nov.': '11',
  'dezembro': '12', 'dez': '12', 'dez.': '12',
};

function parseEventDate(dataCol: string, yearCol: string | number): Date | null {
  if (!dataCol || !yearCol) return null;
  
  const data = String(dataCol).trim().toLowerCase();
  const year = typeof yearCol === 'number' ? yearCol : parseInt(String(yearCol));
  if (isNaN(year)) return null;
  
  const match = data.match(/^(\d{1,2})\s+(.+)$/);
  if (!match) return null;
  
  const day = parseInt(match[1]);
  const monthText = match[2].trim();
  const month = MONTH_MAP[monthText];
  
  if (!month || isNaN(day)) return null;
  
  try {
    return new Date(`${year}-${month}-${day.toString().padStart(2, '0')}T00:00:00Z`);
  } catch {
    return null;
  }
}

function findColumn(row: any, patterns: string[]): string | undefined {
  for (const key of Object.keys(row)) {
    for (const pattern of patterns) {
      if (key.includes(pattern) || key.toLowerCase().includes(pattern.toLowerCase())) {
        return row[key]?.toString()?.trim();
      }
    }
  }
  return undefined;
}

async function updateLeads() {
  const csvPath = 'attached_assets/Comercial - Propostas2025 (2)_1764074293047.csv';
  const workbook = xlsx.readFile(csvPath);
  const sheetName = workbook.SheetNames[0];
  const records = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]) as any[];

  console.log(`Processing ${records.length} records...`);
  
  let updated = 0;
  let errors = 0;
  let dateUpdates = 0;
  
  for (const row of records) {
    // Use fuzzy column matching for encoding issues
    const proposalNumber = findColumn(row, ['Proposta', 'proposta']);
    const ownerName = findColumn(row, ['Onwer', 'Owner', 'owner']);
    const dataCol = row['Data']?.toString()?.trim();
    const yearCol = row['Ano'];
    
    if (!proposalNumber) continue;
    
    const ownerId = OWNER_MAP[ownerName || ''] || OWNER_MAP['default'];
    const eventDate = parseEventDate(dataCol, yearCol);
    if (eventDate) dateUpdates++;
    
    try {
      for (const env of ['production', 'sandbox']) {
        await db.update(commercialLeads)
          .set({
            ownerId,
            eventDate,
          })
          .where(
            and(
              eq(commercialLeads.tenantId, TENANT_ID),
              eq(commercialLeads.proposalNumber, proposalNumber),
              eq(commercialLeads.environment, env)
            )
          );
      }
      updated++;
    } catch (err) {
      console.error(`Error updating ${proposalNumber}:`, err);
      errors++;
    }
  }
  
  console.log(`Updated ${updated} leads, ${dateUpdates} with dates, ${errors} errors`);
  
  // Verify by checking distinct owners
  const ownerStats = await db.select({
    ownerId: commercialLeads.ownerId,
    count: db.$count(commercialLeads.id),
  })
  .from(commercialLeads)
  .where(eq(commercialLeads.tenantId, TENANT_ID))
  .groupBy(commercialLeads.ownerId);
  
  console.log('Owner distribution:', JSON.stringify(ownerStats, null, 2));
  
  // Check sample leads with dates
  const sampleWithDates = await db.select({
    proposalNumber: commercialLeads.proposalNumber,
    ownerId: commercialLeads.ownerId,
    eventDate: commercialLeads.eventDate,
    eventYear: commercialLeads.eventYear,
  })
  .from(commercialLeads)
  .where(and(
    eq(commercialLeads.tenantId, TENANT_ID),
    eq(commercialLeads.environment, 'production')
  ))
  .limit(5);
  
  console.log('Sample leads:', JSON.stringify(sampleWithDates, null, 2));
  
  process.exit(0);
}

updateLeads();
