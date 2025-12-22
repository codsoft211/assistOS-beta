#!/usr/bin/env tsx

/**
 * Migrate AI Chat Systems from Tenant-Scoped to User-Scoped
 * 
 * Changes:
 * - conversations: tenant_id + environment → user_id
 * - messages: tenant_id + environment → user_id (derived from conversation)
 * - conversation_insights: tenant_id + environment → user_id (derived from conversation)
 * - assistbuild_conversations: tenant_id + environment → user_id
 * - assistbuild_messages: tenant_id + environment → user_id (derived from conversation)
 * 
 * Usage: npm run migrate:ai-chat-to-user-scoped
 */
import '../../../load-env';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';

async function migrateAIChatToUserScoped() {
  console.log('🚀 Starting AI Chat Systems migration (tenant_id → user_id)...');
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // ==================== CONVERSATIONS TABLE ====================
    console.log('\n📝 Migrating conversations table...');
    
    // Step 1: Add user_id column
    await pool.query(`
      ALTER TABLE conversations 
      ADD COLUMN IF NOT EXISTS user_id VARCHAR REFERENCES users(id);
    `);
    console.log('  ✓ Added user_id column');

    // Step 2: Check if tenant_id column exists before migrating data
    const hasTenantId = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'conversations'
        AND column_name = 'tenant_id'
      );
    `);
    
    if (hasTenantId.rows[0]?.exists) {
      // Migrate data - assign to first user in tenant
      const conversationsResult = await pool.query(`
        UPDATE conversations c
        SET user_id = (
          SELECT ut.user_id 
          FROM user_tenants ut 
          WHERE ut.tenant_id = c.tenant_id 
          ORDER BY ut.joined_at ASC
          LIMIT 1
        )
        WHERE user_id IS NULL AND tenant_id IS NOT NULL;
      `);
      console.log(`  ✓ Migrated ${conversationsResult.rowCount || 0} conversations`);
    } else {
      console.log('  ⚠ tenant_id column does not exist, skipping data migration');
    }

    // Step 3: Check for any NULL user_id (shouldn't happen)
    const nullCheck = await pool.query(`
      SELECT COUNT(*) as count FROM conversations WHERE user_id IS NULL;
    `);
    const nullCount = parseInt(nullCheck.rows[0]?.count || '0');
    if (nullCount > 0) {
      console.warn(`  ⚠ Warning: ${nullCount} conversations have NULL user_id`);
    }

    // Step 4: Make user_id NOT NULL
    await pool.query(`
      ALTER TABLE conversations 
      ALTER COLUMN user_id SET NOT NULL;
    `);
    console.log('  ✓ Set user_id to NOT NULL');

    // Step 5: Remove tenant_id and environment
    await pool.query(`
      ALTER TABLE conversations DROP COLUMN IF EXISTS tenant_id;
      ALTER TABLE conversations DROP COLUMN IF EXISTS environment;
    `);
    console.log('  ✓ Removed tenant_id and environment columns');

    // Step 6: Update indexes
    await pool.query(`
      DROP INDEX IF EXISTS conversations_tenant_id_idx;
      DROP INDEX IF EXISTS conversations_tenant_env_idx;
      CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON conversations(created_at);
    `);
    console.log('  ✓ Updated indexes');

    // ==================== MESSAGES TABLE ====================
    console.log('\n📝 Migrating messages table...');
    
    // Step 1: Add user_id column
    await pool.query(`
      ALTER TABLE messages 
      ADD COLUMN IF NOT EXISTS user_id VARCHAR REFERENCES users(id);
    `);
    console.log('  ✓ Added user_id column');

    // Step 2: Migrate data - get user_id from conversation
    const messagesResult = await pool.query(`
      UPDATE messages m
      SET user_id = (
        SELECT c.user_id 
        FROM conversations c 
        WHERE c.id = m.conversation_id
      )
      WHERE user_id IS NULL;
    `);
    console.log(`  ✓ Migrated ${messagesResult.rowCount || 0} messages`);

    // Step 3: Make user_id NOT NULL
    await pool.query(`
      ALTER TABLE messages 
      ALTER COLUMN user_id SET NOT NULL;
    `);
    console.log('  ✓ Set user_id to NOT NULL');

    // Step 4: Remove tenant_id and environment
    await pool.query(`
      ALTER TABLE messages DROP COLUMN IF EXISTS tenant_id;
      ALTER TABLE messages DROP COLUMN IF EXISTS environment;
    `);
    console.log('  ✓ Removed tenant_id and environment columns');

    // Step 5: Update indexes
    await pool.query(`
      DROP INDEX IF EXISTS messages_tenant_id_idx;
      DROP INDEX IF EXISTS messages_tenant_env_idx;
      CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages(user_id);
      CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
    `);
    console.log('  ✓ Updated indexes');

    // ==================== CONVERSATION_INSIGHTS TABLE ====================
    console.log('\n📝 Migrating conversation_insights table...');
    
    // Check if table exists
    const insightsTableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'conversation_insights'
      );
    `);

    if (insightsTableExists.rows[0]?.exists) {
      // Step 1: Add conversation_id column if it doesn't exist
      const hasConversationId = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'conversation_insights'
          AND column_name = 'conversation_id'
        );
      `);
      
      if (!hasConversationId.rows[0]?.exists) {
        await pool.query(`
          ALTER TABLE conversation_insights 
          ADD COLUMN IF NOT EXISTS conversation_id VARCHAR REFERENCES conversations(id);
        `);
        console.log('  ✓ Added conversation_id column');
      }

      // Step 2: Add user_id column
      await pool.query(`
        ALTER TABLE conversation_insights 
        ADD COLUMN IF NOT EXISTS user_id VARCHAR REFERENCES users(id);
      `);
      console.log('  ✓ Added user_id column');

      // Step 3: Migrate data - get user_id from conversation
      const insightsResult = await pool.query(`
        UPDATE conversation_insights ci
        SET user_id = (
          SELECT c.user_id 
          FROM conversations c 
          WHERE c.id = ci.conversation_id
        )
        WHERE user_id IS NULL AND conversation_id IS NOT NULL;
      `);
      console.log(`  ✓ Migrated ${insightsResult.rowCount || 0} insights`);

      // Step 4: For insights without conversation_id, check if tenant_id exists and migrate
      const hasTenantId = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'conversation_insights'
          AND column_name = 'tenant_id'
        );
      `);
      
      if (hasTenantId.rows[0]?.exists) {
        const insightsResult2 = await pool.query(`
          UPDATE conversation_insights ci
          SET user_id = (
            SELECT ut.user_id 
            FROM user_tenants ut 
            WHERE ut.tenant_id = ci.tenant_id 
            ORDER BY ut.joined_at ASC
            LIMIT 1
          )
          WHERE user_id IS NULL AND tenant_id IS NOT NULL;
        `);
        if (insightsResult2.rowCount && insightsResult2.rowCount > 0) {
          console.log(`  ✓ Migrated ${insightsResult2.rowCount} additional insights (no conversation_id)`);
        }
      } else {
        console.log('  ⚠ tenant_id column does not exist, skipping additional migration');
      }

      // Step 5: Make user_id NOT NULL
      await pool.query(`
        ALTER TABLE conversation_insights 
        ALTER COLUMN user_id SET NOT NULL;
      `);
      console.log('  ✓ Set user_id to NOT NULL');

      // Step 6: Remove tenant_id and environment
      await pool.query(`
        ALTER TABLE conversation_insights DROP COLUMN IF EXISTS tenant_id;
        ALTER TABLE conversation_insights DROP COLUMN IF EXISTS environment;
      `);
      console.log('  ✓ Removed tenant_id and environment columns');

      // Step 7: Update indexes
      await pool.query(`
        DROP INDEX IF EXISTS conversation_insights_tenant_created_idx;
        CREATE INDEX IF NOT EXISTS conversation_insights_user_id_idx ON conversation_insights(user_id);
        CREATE INDEX IF NOT EXISTS conversation_insights_conversation_id_idx ON conversation_insights(conversation_id);
      `);
      console.log('  ✓ Updated indexes');
    } else {
      console.log('  ⚠ Table conversation_insights does not exist, skipping');
    }

    // ==================== ASSISTBUILD_CONVERSATIONS TABLE ====================
    console.log('\n📝 Migrating assistbuild_conversations table...');
    
    // Step 1: Add user_id column
    await pool.query(`
      ALTER TABLE assistbuild_conversations 
      ADD COLUMN IF NOT EXISTS user_id VARCHAR REFERENCES users(id);
    `);
    console.log('  ✓ Added user_id column');

    // Step 2: Check if tenant_id column exists before migrating data
    const hasTenantIdAbc = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'assistbuild_conversations'
        AND column_name = 'tenant_id'
      );
    `);
    
    if (hasTenantIdAbc.rows[0]?.exists) {
      const assistbuildConvResult = await pool.query(`
        UPDATE assistbuild_conversations abc
        SET user_id = (
          SELECT ut.user_id 
          FROM user_tenants ut 
          WHERE ut.tenant_id = abc.tenant_id 
          ORDER BY ut.joined_at ASC
          LIMIT 1
        )
        WHERE user_id IS NULL AND tenant_id IS NOT NULL;
      `);
      console.log(`  ✓ Migrated ${assistbuildConvResult.rowCount || 0} assistbuild conversations`);
    } else {
      console.log('  ⚠ tenant_id column does not exist, skipping data migration');
    }

    // Step 3: Make user_id NOT NULL
    await pool.query(`
      ALTER TABLE assistbuild_conversations 
      ALTER COLUMN user_id SET NOT NULL;
    `);
    console.log('  ✓ Set user_id to NOT NULL');

    // Step 4: Remove tenant_id and environment
    await pool.query(`
      ALTER TABLE assistbuild_conversations DROP COLUMN IF EXISTS tenant_id;
      ALTER TABLE assistbuild_conversations DROP COLUMN IF EXISTS environment;
    `);
    console.log('  ✓ Removed tenant_id and environment columns');

    // Step 5: Update indexes
    await pool.query(`
      DROP INDEX IF EXISTS assistbuild_conversations_tenant_idx;
      CREATE INDEX IF NOT EXISTS assistbuild_conversations_user_id_idx ON assistbuild_conversations(user_id);
    `);
    console.log('  ✓ Updated indexes');

    // ==================== ASSISTBUILD_MESSAGES TABLE ====================
    console.log('\n📝 Migrating assistbuild_messages table...');
    
    // Step 1: Add user_id column
    await pool.query(`
      ALTER TABLE assistbuild_messages 
      ADD COLUMN IF NOT EXISTS user_id VARCHAR REFERENCES users(id);
    `);
    console.log('  ✓ Added user_id column');

    // Step 2: Migrate data - get user_id from conversation
    const assistbuildMsgResult = await pool.query(`
      UPDATE assistbuild_messages abm
      SET user_id = (
        SELECT abc.user_id 
        FROM assistbuild_conversations abc 
        WHERE abc.id = abm.conversation_id
      )
      WHERE user_id IS NULL;
    `);
    console.log(`  ✓ Migrated ${assistbuildMsgResult.rowCount || 0} assistbuild messages`);

    // Step 3: Make user_id NOT NULL
    await pool.query(`
      ALTER TABLE assistbuild_messages 
      ALTER COLUMN user_id SET NOT NULL;
    `);
    console.log('  ✓ Set user_id to NOT NULL');

    // Note: assistbuild_messages doesn't have tenant_id/environment columns
    // (it's linked via conversation_id only)
    console.log('  ✓ No tenant_id/environment columns to remove');

    // Step 4: Update indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS assistbuild_messages_user_id_idx ON assistbuild_messages(user_id);
    `);
    console.log('  ✓ Updated indexes');

    console.log('\n✅ AI Chat Systems migration completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   - conversations: tenant_id → user_id');
    console.log('   - messages: tenant_id → user_id');
    console.log('   - conversation_insights: tenant_id → user_id');
    console.log('   - assistbuild_conversations: tenant_id → user_id');
    console.log('   - assistbuild_messages: added user_id');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('   Error details:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateAIChatToUserScoped();
}

export { migrateAIChatToUserScoped };

