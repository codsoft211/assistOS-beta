/**
 * Migration: Create subscription_plans table
 * 
 * This script creates the subscription_plans table in the public schema.
 * 
 * Usage:
 *   npx tsx migrations/create-subscription-plans.ts
 */

import '../load-env';
import { Pool } from 'pg';

async function createSubscriptionPlansTable(): Promise<void> {
  console.log('='.repeat(80));
  console.log('Migration: Create subscription_plans table');
  console.log('='.repeat(80));
  console.log();

  const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or SUPABASE_DATABASE_URL environment variable must be set');
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Check if subscription_plans table already exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'subscription_plans'
      ) as exists
    `);

    const tableExists = tableCheck.rows[0]?.exists || false;

    if (tableExists) {
      console.log('⏭️  subscription_plans table already exists in public schema');
      console.log('   Skipping migration.');
      return;
    }

    console.log('Creating subscription_plans table...');

    // Create the subscription_plans table
    await pool.query(`
      CREATE TABLE public.subscription_plans (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        price_monthly_euros NUMERIC(10, 2),
        price_model TEXT NOT NULL DEFAULT 'fixed',
        paying_users_included INTEGER,
        free_users_included INTEGER,
        credits_included INTEGER,
        price_per_paying_seat_euros NUMERIC(10, 2),
        credits_per_paying_user INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        metadata JSONB,
        is_enterprise BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT subscription_plans_fixed_plan_check CHECK (
          price_model != 'fixed'
          OR (
            price_monthly_euros IS NOT NULL
            AND paying_users_included IS NOT NULL
            AND free_users_included IS NOT NULL
            AND credits_included IS NOT NULL
          )
        )
      )
    `);

    console.log('✅ Created subscription_plans table');

    // Create unique index on name
    await pool.query(`
      CREATE UNIQUE INDEX subscription_plans_name_idx 
      ON public.subscription_plans(name)
    `);

    console.log('✅ Created unique index on name');

    console.log();
    console.log('='.repeat(80));
    console.log('Migration completed successfully!');
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration
createSubscriptionPlansTable()
  .then(() => {
    console.log('✅ Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration script failed:');
    console.error(error);
    process.exit(1);
  });

