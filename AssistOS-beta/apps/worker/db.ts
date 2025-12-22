import '../../load-env';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../shared/schema';

// Use SUPABASE_DATABASE_URL with priority to avoid Replit's automatic DATABASE_URL injection
const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL or SUPABASE_DATABASE_URL must be set. Did you forget to provision the database?');
}

const pool = new Pool({ 
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[Worker Database Pool] Unexpected error on idle client:', err.message);
  if (err.message?.includes('db_termination') || err.message?.includes('shutdown')) {
    console.log('[Worker Database Pool] Database connection terminated - pool will reconnect automatically');
  }
});

pool.on('connect', () => {
  console.log('[Worker Database Pool] New client connected');
});

export const db = drizzle({ client: pool, schema });
export { pool };
