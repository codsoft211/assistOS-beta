const xlsx = require('xlsx');
const { Pool } = require('pg');

const TENANT_ID = '464d1492-ff64-4e11-814e-b4e416b9c250';
const USER_ID = '2a2d43b1-1baa-44bd-ac16-0bb546977835';
const ENV = 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function parseCurrency(val) {
  if (!val) return null;
  const str = String(val).replace(/[€\s]/g, '').trim();
  if (!str || str === '-') return null;
  const normalized = str.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalized);
  return isNaN(num) ? null : num;
}

function parseDate(val) {
  if (!val) return null;
  const str = String(val).trim();
  const ddmmyyyy = str.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeStatus(status) {
  const s = (status || '').toLowerCase().trim();
  if (s.includes('win')) return 'won';
  if (s.includes('lost') || s.includes('perdido')) return 'lost';
  if (s.includes('proposta') || s.includes('proposal') || s.includes('enviada')) return 'proposal_sent';
  if (s.includes('em negociação') || s.includes('negociação')) return 'negotiating';
  return 'new';
}

function escapeStr(val) {
  if (val === null || val === undefined) return null;
  return String(val).replace(/'/g, "''");
}

async function importData() {
  const client = await pool.connect();
  
  try {
    console.log('Reading CSVs...');
    
    const propostas = xlsx.readFile('attached_assets/Comercial - Propostas2025 (1)_1764023670455.csv');
    const propostasData = xlsx.utils.sheet_to_json(propostas.Sheets[propostas.SheetNames[0]]);
    console.log(`Propostas: ${propostasData.length} rows`);
    
    const eventos = xlsx.readFile('attached_assets/Comercial - Eventos Confirmados 2025_1764024100194.csv');
    const eventosData = xlsx.utils.sheet_to_json(eventos.Sheets[eventos.SheetNames[0]]);
    console.log(`Eventos: ${eventosData.length} rows`);
    
    await client.query('BEGIN');
    
    const seenPropostas = new Set();
    let leadsCreated = 0;
    let clientsCreated = 0;
    let projectsCreated = 0;
    let errors = [];
    
    console.log('\n--- Importing Commercial Leads from Propostas ---');
    
    for (const row of propostasData) {
      const numProp = row['NÂº Proposta'] || row['Nº Proposta'] || row['Numero Proposta'];
      if (!numProp || seenPropostas.has(numProp)) continue;
      seenPropostas.add(numProp);
      
      try {
        const description = row['Nome'] || row['DescriÃ§Ã£o'] || '';
        const contacto = row['Contacto'] || '';
        const hasEmail = contacto.includes('@');
        const contactEmail = hasEmail ? contacto : null;
        const contactPhone = !hasEmail && contacto ? contacto : null;
        const leadSource = row['LEAD'] || 'Direto';
        const status = row['ESTADO'] || 'Novo';
        const normalizedStatus = normalizeStatus(status);
        const isWin = normalizedStatus === 'won';
        const tipoEvento = row['Tipo Evento'] || 'Evento Catering';
        const localizacao = row['LocalizaÃ§Ã£o'] || row['Localização'] || '';
        const eventDate = parseDate(row['Data']);
        const ano = parseInt(row['Ano']) || (eventDate ? eventDate.getFullYear() : new Date().getFullYear());
        const numPax = parseInt(row['NÂº Pax'] || row['Nº Pax']) || null;
        const valorPax = parseCurrency(row['Valor Pax ']) || parseCurrency(row['Valor']) || null;
        const budgetTotal = numPax && valorPax ? numPax * valorPax : null;
        const owner = row['Owner'] || row['Onwer'] || null;
        
        const existingLead = await client.query(
          `SELECT id FROM commercial_leads WHERE tenant_id = $1 AND proposal_number = $2`,
          [TENANT_ID, numProp]
        );
        
        let leadId;
        let isNewLead = false;
        if (existingLead.rowCount > 0) {
          leadId = existingLead.rows[0].id;
        } else {
          const leadResult = await client.query(`
            INSERT INTO commercial_leads 
            (id, tenant_id, proposal_number, description, contact_name, contact_phone, contact_email, status, owner_id, lead_source, event_type, location, event_date, event_year, num_pax, value_per_pax, budget_total, created_at, updated_at)
            VALUES 
            (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
            RETURNING id
          `, [
            TENANT_ID, numProp, description, description, contactPhone, contactEmail, normalizedStatus, USER_ID, leadSource, tipoEvento, localizacao, eventDate, ano, numPax, valorPax, budgetTotal
          ]);
          leadId = leadResult.rows[0].id;
          leadsCreated++;
          isNewLead = true;
        }
        
        if (isNewLead && isWin && description) {
            const clientResult = await client.query(`
              INSERT INTO clients 
              (id, tenant_id, environment, name, email, phone, other_info, status, created_by, created_at)
              VALUES 
              (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, 'active', $7, NOW())
              RETURNING id
            `, [
              TENANT_ID, ENV, description, contactEmail, contactPhone, 
              JSON.stringify({ imported_from: 'propostas_csv', numero_proposta: numProp }),
              USER_ID
            ]);
            
            if (clientResult.rowCount > 0) {
              clientsCreated++;
              const clientId = clientResult.rows[0].id;
              
              const projectResult = await client.query(`
                INSERT INTO projects 
                (id, tenant_id, environment, name, client_id, lead_id, project_code, event_date, status, metadata, project_manager_id, created_by, created_at)
                VALUES 
                (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $10, NOW())
                RETURNING id
              `, [
                TENANT_ID, ENV, 
                `${tipoEvento} - ${description}`,
                clientId, leadId, numProp, eventDate,
                eventDate && eventDate < new Date() ? 'completed' : 'confirmed',
                JSON.stringify({ 
                  imported_from: 'propostas_csv',
                  tipo_evento: tipoEvento,
                  localizacao: localizacao,
                  num_pax: numPax,
                  valor_pax: valorPax,
                  budget_total: budgetTotal
                }),
                USER_ID
              ]);
              
              if (projectResult.rowCount > 0) {
                projectsCreated++;
                await client.query(
                  `UPDATE commercial_leads SET project_id = $1 WHERE id = $2`,
                  [projectResult.rows[0].id, leadId]
                );
              }
            }
        }
      } catch (err) {
        errors.push({ row: numProp, error: err.message });
      }
    }
    
    console.log(`Leads created: ${leadsCreated}`);
    console.log(`Clients created: ${clientsCreated}`);
    console.log(`Projects created: ${projectsCreated}`);
    
    console.log('\n--- Importing Projects from Eventos Confirmados ---');
    
    let eventosImported = 0;
    
    for (const row of eventosData) {
      const numProp = row['NÂº Proposta'] || row['Nº Proposta'] || null;
      const nome = row['Nome'] || row['Cliente'] || '';
      
      try {
        const tipoEvento = row['Tipo Evento'] || row['Tipo'] || 'Evento Catering';
        const eventDate = parseDate(row['Data'] || row['Data Evento']);
        const valor = parseCurrency(row['Margem']) || parseCurrency(row['Valor']);
        const localizacao = row['LocalizaÃ§Ã£o'] || row['Localização'] || '';
        const isCompleted = eventDate && eventDate < new Date();
        
        const projectCode = numProp || `EV-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        
        const existingProject = await client.query(
          `SELECT id FROM projects WHERE tenant_id = $1 AND project_code = $2`,
          [TENANT_ID, projectCode]
        );
        
        if (existingProject.rowCount === 0) {
          await client.query(`
            INSERT INTO projects 
            (id, tenant_id, environment, name, project_code, event_date, status, metadata, project_manager_id, created_by, created_at)
            VALUES 
            (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8, NOW())
          `, [
            TENANT_ID, ENV,
            `${tipoEvento} - ${nome || 'Evento Confirmado'}`,
            projectCode, eventDate,
            isCompleted ? 'completed' : 'confirmed',
            JSON.stringify({
              imported_from: 'eventos_confirmados_csv',
              tipo_evento: tipoEvento,
              localizacao: localizacao,
              lead_source: row['LEAD'] || null,
              margem: valor,
              cliente_nome: nome
            }),
            USER_ID
          ]);
          eventosImported++;
        }
      } catch (err) {
        errors.push({ row: numProp || nome, error: err.message });
      }
    }
    
    console.log(`Eventos imported as projects: ${eventosImported}`);
    
    await client.query('COMMIT');
    
    console.log('\n=== IMPORT SUMMARY ===');
    console.log(`Leads: ${leadsCreated}`);
    console.log(`Clients: ${clientsCreated}`);
    console.log(`Projects from WINs: ${projectsCreated}`);
    console.log(`Projects from Eventos: ${eventosImported}`);
    console.log(`Total Projects: ${projectsCreated + eventosImported}`);
    
    if (errors.length > 0) {
      console.log(`\nErrors (${errors.length}):`);
      errors.slice(0, 10).forEach(e => console.log(`  - ${e.row}: ${e.error}`));
    }
    
    console.log('\n--- Verification Queries ---');
    
    const leadCount = await client.query(
      `SELECT status, COUNT(*) FROM commercial_leads WHERE tenant_id = $1 GROUP BY status`,
      [TENANT_ID]
    );
    console.log('Commercial leads by status:', leadCount.rows);
    
    const projectCount = await client.query(
      `SELECT status, COUNT(*) FROM projects WHERE tenant_id = $1 GROUP BY status`,
      [TENANT_ID]
    );
    console.log('Projects by status:', projectCount.rows);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ROLLBACK - Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

importData().catch(console.error);
