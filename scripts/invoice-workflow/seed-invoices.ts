// Seed script to generate 1000 invoices for demo
// Run with: npx tsx scripts/invoice-workflow/seed-invoices.ts

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

// Load environment
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

// Helper to generate random data
function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Sample data
const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa', 'William', 'Jennifer', 'James', 'Maria', 'Christopher', 'Patricia', 'Daniel'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson'];
const companies = ['Acme Corp', 'TechStart Inc', 'Global Solutions', 'Innovation Labs', 'Digital Dynamics', 'CloudFirst', 'DataStream', 'NextGen Systems', 'Alpha Technologies', 'Beta Industries', 'Omega Enterprises', 'Prime Solutions', 'Elite Services', 'Master Tech', 'Apex Industries'];
const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'company.com', 'business.net', 'work.io', 'mail.com'];
const invoiceDescriptions = [
  'Professional consulting services',
  'Software development services',
  'Monthly maintenance and support',
  'Design and creative services',
  'Marketing campaign management',
  'Cloud infrastructure services',
  'Data analytics and reporting',
  'Training and workshop sessions',
  'Security audit and compliance',
  'Website development project'
];

const statuses = ['pending', 'sent', 'paid', 'overdue'];

async function seedDatabase() {
  console.log('🚀 Starting invoice seed script...\n');

  try {
    // First, run the schema creation
    console.log('📦 Creating schema if not exists...');
    await db.execute(sql`CREATE SCHEMA IF NOT EXISTS invoice_workflow_schema`);
    
    // Create tables
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invoice_workflow_schema.customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        company VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invoice_workflow_schema.invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number VARCHAR(50) NOT NULL UNIQUE,
        customer_id UUID NOT NULL REFERENCES invoice_workflow_schema.customers(id),
        amount DECIMAL(12, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        status VARCHAR(20) DEFAULT 'pending',
        due_date DATE NOT NULL,
        issued_date DATE DEFAULT CURRENT_DATE,
        description TEXT,
        line_items JSONB DEFAULT '[]',
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invoice_workflow_schema.scheduled_workflows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id UUID NOT NULL,
        tenant_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        schedule_type VARCHAR(20) NOT NULL,
        schedule_config JSONB NOT NULL,
        next_run_at TIMESTAMPTZ,
        last_run_at TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'active',
        run_count INTEGER DEFAULT 0,
        max_runs INTEGER,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invoice_workflow_schema.email_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_execution_id UUID,
        recipient_email VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        error_message TEXT,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log('✅ Schema and tables created\n');

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await db.execute(sql`TRUNCATE invoice_workflow_schema.invoices CASCADE`);
    await db.execute(sql`TRUNCATE invoice_workflow_schema.customers CASCADE`);
    console.log('✅ Data cleared\n');

    // Generate customers
    console.log('👥 Generating 100 customers...');
    const customers: { id: string; email: string }[] = [];
    
    for (let i = 0; i < 100; i++) {
      const firstName = randomItem(firstNames);
      const lastName = randomItem(lastNames);
      const company = randomItem(companies);
      const domain = randomItem(domains);
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@${domain}`;
      
      const result = await db.execute(sql`
        INSERT INTO invoice_workflow_schema.customers (name, email, company, phone, address)
        VALUES (
          ${firstName + ' ' + lastName},
          ${email},
          ${company},
          ${'+1-' + randomBetween(200, 999) + '-' + randomBetween(100, 999) + '-' + randomBetween(1000, 9999)},
          ${randomBetween(100, 9999) + ' ' + randomItem(['Main St', 'Oak Ave', 'Park Blvd', 'First Ave', 'Second St']) + ', ' + randomItem(['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix']) + ', USA'}
        )
        RETURNING id, email
      `);
      
      customers.push({ id: (result.rows[0] as any).id, email: (result.rows[0] as any).email });
      
      if ((i + 1) % 20 === 0) {
        console.log(`  Created ${i + 1} customers...`);
      }
    }
    console.log('✅ 100 customers created\n');

    // Generate invoices
    console.log('📄 Generating 1000 invoices...');
    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const threeMonthsAhead = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    
    for (let i = 0; i < 1000; i++) {
      const customer = randomItem(customers);
      const invoiceNumber = `INV-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}-${String(i + 1).padStart(5, '0')}`;
      const amount = (randomBetween(100, 50000) + Math.random()).toFixed(2);
      const issuedDate = randomDate(threeMonthsAgo, now);
      const dueDate = new Date(issuedDate.getTime() + randomBetween(7, 60) * 24 * 60 * 60 * 1000);
      
      // Determine status based on dates
      let status = randomItem(statuses);
      if (dueDate < now && status === 'pending') {
        status = 'overdue';
      }
      
      const paidAt = status === 'paid' 
        ? new Date(issuedDate.getTime() + randomBetween(1, 30) * 24 * 60 * 60 * 1000)
        : null;
      
      const lineItems = JSON.stringify([
        { description: randomItem(invoiceDescriptions), quantity: randomBetween(1, 10), unitPrice: parseFloat(amount) / randomBetween(1, 5) },
        ...(Math.random() > 0.5 ? [{ description: randomItem(invoiceDescriptions), quantity: randomBetween(1, 5), unitPrice: randomBetween(50, 500) }] : [])
      ]);
      
      await db.execute(sql`
        INSERT INTO invoice_workflow_schema.invoices 
        (invoice_number, customer_id, amount, status, due_date, issued_date, description, line_items, paid_at)
        VALUES (
          ${invoiceNumber},
          ${customer.id}::uuid,
          ${parseFloat(amount)},
          ${status},
          ${dueDate.toISOString().split('T')[0]},
          ${issuedDate.toISOString().split('T')[0]},
          ${randomItem(invoiceDescriptions)},
          ${lineItems}::jsonb,
          ${paidAt ? paidAt.toISOString() : null}
        )
      `);
      
      if ((i + 1) % 100 === 0) {
        console.log(`  Created ${i + 1} invoices...`);
      }
    }
    console.log('✅ 1000 invoices created\n');

    // Print summary
    const stats = await db.execute(sql`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM invoice_workflow_schema.invoices
      GROUP BY status
      ORDER BY count DESC
    `);
    
    console.log('📊 Invoice Summary:');
    console.log('─'.repeat(50));
    for (const row of stats.rows as any[]) {
      console.log(`  ${row.status.padEnd(10)}: ${String(row.count).padStart(5)} invoices ($${parseFloat(row.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })})`);
    }
    console.log('─'.repeat(50));
    
    // Count overdue invoices
    const overdueCount = await db.execute(sql`
      SELECT COUNT(*) as count, SUM(amount) as total
      FROM invoice_workflow_schema.invoices
      WHERE status IN ('pending', 'overdue') AND due_date < CURRENT_DATE
    `);
    
    const overdue = (overdueCount.rows[0] as any);
    console.log(`\n⚠️  Overdue invoices needing attention: ${overdue.count} ($${parseFloat(overdue.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })})`);
    
    console.log('\n🎉 Seed complete! Database is ready for demo.\n');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seedDatabase();
