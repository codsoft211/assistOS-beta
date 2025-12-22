import { db } from '../apps/api/db';
import { projects, clients, projectsConfig } from '../shared/schema';
import { eq, and } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface ProjectRow {
  name: string;
  clientName: string | null;
  status: string | null;
  lead: string | null;
  eventType: string | null;
  location: string | null;
  date: string | null;
  year: string | null;
  hours: string | null;
  numberOfPeople: string | null;
  pricePerPerson: string | null;
  totalValue: string | null;
  margin: string | null;
  payment1: string | null;
  payment2: string | null;
  payment3: string | null;
  staffCount: string | null;
  staffRoom: string | null;
  staffKitchen: string | null;
  contact: string | null;
  email: string | null;
  comments: string | null;
  proposalNumber: string | null;
  serviceType: string | null;
}

function parseDatePortuguese(dateStr: string, year: number): Date | null {
  const months: Record<string, number> = {
    "janeiro": 0, "jan": 0,
    "fevereiro": 1, "fev": 1,
    "março": 2, "marco": 2, "mar": 2,
    "abril": 3, "abr": 3,
    "maio": 4, "mai": 4, "may": 4,
    "junho": 5, "jun": 5, "june": 5,
    "julho": 6, "jul": 6,
    "agosto": 7, "ago": 7,
    "setembro": 8, "set": 8,
    "outubro": 9, "out": 9,
    "novembro": 10, "nov": 10,
    "dezembro": 11, "dez": 11,
  };

  const normalized = dateStr.toLowerCase().replace(/[\/\-\.]/g, " ").trim();
  const match = normalized.match(/(\d{1,2})\s*(\w+)/);
  if (match) {
    const day = parseInt(match[1]);
    const monthStr = match[2].toLowerCase();
    const month = months[monthStr];
    if (month !== undefined && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }
  return null;
}

function mapStatus(csvStatus: string | null): string {
  if (!csvStatus) return "planning";
  const status = csvStatus.toString().toUpperCase().trim();
  switch (status) {
    case "WIN": return "confirmed";
    case "PROPOSTA ENVIADA": return "proposal_sent";
    case "LOST": return "cancelled";
    default: return "planning";
  }
}

function parseMoneyValue(val: string | null): string | null {
  if (!val || val === "#VALUE!") return null;
  const str = val.replace(/[€\s]/g, "").replace(",", ".");
  const parts = str.split(".");
  if (parts.length > 2) {
    const last = parts.pop();
    const num = parseFloat(parts.join("") + "." + last);
    return isNaN(num) ? null : num.toFixed(2);
  }
  const num = parseFloat(str);
  return isNaN(num) ? null : num.toFixed(2);
}

function parseCSV(csvContent: string): ProjectRow[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const rows: ProjectRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const row: ProjectRow = {
      name: values[1] || '',
      clientName: values[2] || null,
      proposalNumber: values[3] || null,
      status: values[4] || null,
      lead: values[5] || null,
      eventType: values[6] || null,
      location: values[7] || null,
      date: values[8] || null,
      year: values[9] || null,
      hours: values[10] || null,
      numberOfPeople: values[11] || null,
      pricePerPerson: values[12] || null,
      totalValue: values[13] || null,
      margin: values[14] || null,
      payment1: values[15] || null,
      payment2: values[17] || null,
      payment3: values[19] || null,
      staffCount: values[21] || null,
      staffRoom: values[22] || null,
      staffKitchen: values[23] || null,
      serviceType: values[25] || null,
      contact: values[26] || null,
      email: values[27] || null,
      comments: values[28] || null,
    };
    
    if (row.name?.trim()) {
      rows.push(row);
    }
  }

  return rows;
}

async function importProjects() {
  const tenantId = "47e5b460-bfe9-4e7f-8db7-1d0a2bebaa5a";
  const environment = "sandbox";
  const userId = "bb398b79-0539-41b3-958f-52e994ca0451";

  const csvPath = path.join(process.cwd(), 'attached_assets/Comercial - Eventos Confirmados 2025 (1)_1764243964349.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  console.log(`Importing ${rows.length} projects...`);

  let [config] = await db
    .select()
    .from(projectsConfig)
    .where(and(
      eq(projectsConfig.tenantId, tenantId),
      eq(projectsConfig.environment, environment)
    ));

  if (!config) {
    [config] = await db
      .insert(projectsConfig)
      .values({
        tenantId,
        environment,
        dateType: "single",
        codePattern: "EV-{YYYY}-{###}",
        codeCounter: 0,
        statusValues: [
          { value: "planning", label: "Planeamento", color: "blue" },
          { value: "proposal_sent", label: "Proposta Enviada", color: "yellow" },
          { value: "confirmed", label: "Confirmado", color: "green" },
          { value: "completed", label: "Concluído", color: "gray" },
          { value: "cancelled", label: "Cancelado", color: "red" },
        ],
        tags: [],
      })
      .returning();
  }

  const clientCache: Record<string, string> = {};
  const existingClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(
      eq(clients.tenantId, tenantId),
      eq(clients.environment, environment)
    ));

  for (const c of existingClients) {
    if (c.name) clientCache[c.name.toLowerCase().trim()] = c.id;
  }

  let imported = 0;
  let clientsCreated = 0;
  let codeCounter = config.codeCounter || 0;

  for (const row of rows) {
    try {
      if (!row.name?.trim()) continue;

      const clientName = (row.clientName || row.name || "Cliente Genérico").trim();
      const clientKey = clientName.toLowerCase();
      let clientId: string;

      if (clientCache[clientKey]) {
        clientId = clientCache[clientKey];
      } else {
        const [newClient] = await db
          .insert(clients)
          .values({
            tenantId,
            environment,
            name: clientName,
            status: "Ativo",
          })
          .returning();
        clientId = newClient.id;
        clientCache[clientKey] = clientId;
        clientsCreated++;
      }

      codeCounter++;
      const year = row.year ? parseInt(row.year) : 2025;
      const projectCode = `EV-${year}-${String(codeCounter).padStart(3, '0')}`;

      let eventDate: Date | null = null;
      if (row.date) {
        eventDate = parseDatePortuguese(row.date, year);
      }

      const parseIntSafe = (val: string | null): number | null => {
        if (!val) return null;
        const num = parseInt(val.replace(/[^\d-]/g, ''));
        return isNaN(num) ? null : num;
      };

      await db
        .insert(projects)
        .values({
          tenantId,
          environment,
          projectCode,
          name: row.name.trim(),
          clientId,
          clientName,
          description: row.comments || null,
          status: mapStatus(row.status),
          tags: row.eventType ? [row.eventType] : [],
          eventDate,
          date: eventDate,
          numberOfPeople: parseIntSafe(row.numberOfPeople),
          pricePerPerson: parseMoneyValue(row.pricePerPerson),
          plannedBudget: parseMoneyValue(row.totalValue),
          projectType: row.eventType || null,
          priority: "Medium",
          progress: row.status === "WIN" ? 100 : 0,
          notes: row.comments || null,
          metadata: {
            lead: row.lead || null,
            location: row.location || null,
            proposalNumber: row.proposalNumber || null,
            margin: row.margin || null,
            payments: {
              first: row.payment1 || null,
              second: row.payment2 || null,
              third: row.payment3 || null,
            },
            staff: {
              total: row.staffCount || null,
              room: row.staffRoom || null,
              kitchen: row.staffKitchen || null,
            },
            contact: row.contact || null,
            email: row.email || null,
            hours: row.hours || null,
            serviceType: row.serviceType || null,
          },
          createdBy: userId,
        });

      imported++;
      if (imported % 20 === 0) {
        console.log(`Imported ${imported} projects...`);
      }
    } catch (error: any) {
      console.error(`Error importing "${row.name}":`, error.message);
    }
  }

  await db
    .update(projectsConfig)
    .set({ codeCounter })
    .where(and(
      eq(projectsConfig.tenantId, tenantId),
      eq(projectsConfig.environment, environment)
    ));

  console.log(`\nDone! Imported ${imported} projects, created ${clientsCreated} clients`);
  process.exit(0);
}

importProjects().catch(console.error);
