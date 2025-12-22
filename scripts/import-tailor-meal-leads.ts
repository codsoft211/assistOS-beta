/**
 * Script to import Tailor Meal leads from CSV
 * Run with: tsx scripts/import-tailor-meal-leads.ts
 */

import { db } from '../apps/api/db';
import { angariacaoLeads } from '../shared/schema';
import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';

const TENANT_ID = '464d1492-ff64-4e11-814e-b4e416b9c250'; // Tailor Meal
const USER_ID = '2a2d43b1-1baa-44bd-ac16-0bb546977835'; // geral@tailormeal.pt
const CSV_PATH = path.join(process.cwd(), 'attached_assets', 'Comercial - Propostas2025 (1)_1764023670455.csv');

// Helper to clean currency values
function parseCurrency(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const cleaned = value.replace(/[€\s]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Helper to parse PAX (number of people)
function parsePax(value: string | undefined): string | null {
  if (!value || value.trim() === '') return null;
  return value.trim();
}

// Map CSV row to lead data
function mapRowToLead(row: any, index: number) {
  const status = row['ESTADO']?.trim() || 'Novo';
  const leadSource = row['LEAD']?.trim() || 'Direto';
  const owner = row['Onwer']?.trim() || row['Owner']?.trim() || 'Ana';
  
  // Build custom fields with all event-specific data
  const customFields: any = {
    numero_proposta: row['Nº Proposta']?.trim() || null,
    tipo_evento: row['Tipo Evento']?.trim() || null,
    localizacao: row['Localização']?.trim() || row['Localizacao']?.trim() || null,
    data_evento: row['Data']?.trim() || null,
    ano: row['Ano']?.trim() || null,
    num_pax: parsePax(row['Nº Pax']),
    valor_pax: parseCurrency(row['Valor Pax ']),
    budget_total: parseCurrency(row['Budget Total']) || row['Budget Total']?.trim() || null,
    comentarios: row['Comentários']?.trim() || row['Comentarios']?.trim() || null,
    data_resposta: row['Data Resposta']?.trim() || null,
    owner: owner
  };

  // Clean up null values
  Object.keys(customFields).forEach(key => {
    if (customFields[key] === null || customFields[key] === '') {
      delete customFields[key];
    }
  });

  const description = row['Descrição']?.trim() || row['Descricao']?.trim() || `Lead ${index + 1}`;
  const name = row['Nome']?.trim() || description;
  const contact = row['Contacto']?.trim() || null;

  return {
    tenantId: TENANT_ID,
    email: contact && contact.includes('@') ? contact : `lead${index + 1}@example.com`,
    firstName: name.split(' ')[0] || name,
    lastName: name.split(' ').slice(1).join(' ') || null,
    phone: contact && !contact.includes('@') ? contact : null,
    company: null,
    nif: null,
    leadSource: leadSource,
    status: status,
    score: status === 'WIN' ? 100 : status === 'Proposta Enviada' ? 50 : 0,
    customFields: customFields,
    assignedToUserId: USER_ID,
    campaign: null
  };
}

async function importLeads() {
  console.log('📥 Starting Tailor Meal leads import...');
  console.log(`📄 Reading CSV from: ${CSV_PATH}`);

  // Read CSV using xlsx library (handles CSV properly)
  const workbook = xlsx.readFile(CSV_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(worksheet);

  console.log(`📋 Found ${rows.length} rows in CSV\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  // Process rows in batches
  const batchSize = 100;
  const leadsToImport: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as any;

    try {
      // Skip if no proposal number (key identifier)
      if (!row['Nº Proposta'] || !String(row['Nº Proposta']).trim()) {
        skipped++;
        continue;
      }

      const leadData = mapRowToLead(row, i);
      leadsToImport.push(leadData);
    } catch (error: any) {
      console.error(`❌ Error preparing row ${i + 1}:`, error.message);
      errors++;
    }
  }

  console.log(`📦 Prepared ${leadsToImport.length} leads for import`);
  console.log(`🚀 Importing in batches of ${batchSize}...\n`);

  // Insert in batches
  for (let i = 0; i < leadsToImport.length; i += batchSize) {
    const batch = leadsToImport.slice(i, i + batchSize);
    try {
      await db.insert(angariacaoLeads).values(batch);
      imported += batch.length;
      console.log(`✅ Imported ${imported}/${leadsToImport.length} leads...`);
    } catch (error: any) {
      console.error(`❌ Error importing batch at index ${i}:`, error.message);
      errors += batch.length;
    }
  }

  console.log('\n📊 Import Summary:');
  console.log(`✅ Imported: ${imported} leads`);
  console.log(`⏭️  Skipped: ${skipped} rows (empty or missing proposal number)`);
  console.log(`❌ Errors: ${errors} rows`);
  console.log('\n✨ Import complete!');
}

importLeads()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
