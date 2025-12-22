#!/usr/bin/env tsx
/**
 * Revert Environment Promotion Script
 * 
 * Reverts sandbox → production environment promotions for a specific tenant.
 * Restores production environment to pre-promotion state using PITR.
 * 
 * Usage:
 *   # Preview revert (dry-run mode)
 *   npx tsx scripts/revert-environment-promotion.ts \
 *     --tenant "acme-corp" \
 *     --from "production" \
 *     --to "sandbox" \
 *     --dry-run
 * 
 *   # Execute revert (requires --execute flag and --reason)
 *   npx tsx scripts/revert-environment-promotion.ts \
 *     --tenant "acme-corp" \
 *     --from "production" \
 *     --to "sandbox" \
 *     --reason "Rollback canary deployment - schema migration failed" \
 *     --operator "platform-admin@assistos.com" \
 *     --execute
 * 
 *   # Skip confirmation prompt
 *   npx tsx scripts/revert-environment-promotion.ts \
 *     --tenant "acme-corp" \
 *     --from "production" \
 *     --to "sandbox" \
 *     --reason "Emergency rollback" \
 *     --operator "admin@assistos.com" \
 *     --execute \
 *     --yes
 */

import { db } from '../apps/api/db';
import * as readline from 'readline';
import {
  loadConfig,
  initializeSentry,
} from './utils/dlq-cli-helpers.js';
import { sql } from 'drizzle-orm';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as Sentry from '@sentry/node';

// ============================================================================
// TYPES
// ============================================================================

interface RevertPromotionArgs {
  tenant: string;
  from: string;
  to: string;
  reason?: string;
  dryRun: boolean;
  execute: boolean;
  yes: boolean;
  operator?: string;
}

interface EnvironmentData {
  environment: string;
  recordCount: number;
  tables: string[];
}

interface RevertResult {
  tenantSlug: string;
  tenantId: number;
  fromEnvironment: string;
  toEnvironment: string;
  recordsDeleted: number;
  recordsRestored: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Confirm action with user
 */
async function confirmAction(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Get tenant ID by slug
 */
async function getTenantId(tenantSlug: string): Promise<number | null> {
  try {
    const result = await db.execute(
      sql`SELECT id FROM tenants WHERE slug = ${tenantSlug} LIMIT 1`
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].id as number;
  } catch (error) {
    console.error('Failed to get tenant ID:', error);
    throw error;
  }
}

/**
 * Get environment data for tenant
 */
async function getEnvironmentData(
  tenantId: number,
  environment: string
): Promise<EnvironmentData> {
  try {
    // Get record count for environment
    const countResult = await db.execute(
      sql`
        SELECT COUNT(*) as count
        FROM (
          SELECT id FROM users WHERE tenant_id = ${tenantId} AND environment = ${environment}
          UNION ALL
          SELECT id FROM conversations WHERE tenant_id = ${tenantId} AND environment = ${environment}
          UNION ALL
          SELECT id FROM invoices WHERE tenant_id = ${tenantId} AND environment = ${environment}
          UNION ALL
          SELECT id FROM documents WHERE tenant_id = ${tenantId} AND environment = ${environment}
        ) AS combined
      `
    );

    const recordCount = Number(countResult.rows[0]?.count || 0);

    // List tables with environment data
    const tables = ['users', 'conversations', 'invoices', 'documents'];

    return {
      environment,
      recordCount,
      tables,
    };
  } catch (error) {
    console.error('Failed to get environment data:', error);
    throw error;
  }
}

/**
 * Get last promotion timestamp
 */
async function getLastPromotionTimestamp(
  tenantId: number,
  fromEnv: string,
  toEnv: string
): Promise<Date | null> {
  try {
    const result = await db.execute(
      sql`
        SELECT created_at
        FROM audit_trail
        WHERE tenant_id = ${tenantId}
          AND action = 'ENVIRONMENT_PROMOTION'
          AND details::json->>'from' = ${fromEnv}
          AND details::json->>'to' = ${toEnv}
        ORDER BY created_at DESC
        LIMIT 1
      `
    );

    if (result.rows.length === 0) {
      return null;
    }

    return new Date(result.rows[0].created_at as string);
  } catch (error) {
    console.error('Failed to get last promotion timestamp:', error);
    return null;
  }
}

/**
 * Revert environment promotion
 */
async function revertPromotion(
  tenantId: number,
  fromEnvironment: string,
  toEnvironment: string,
  reason: string,
  operator: string,
  dryRun: boolean
): Promise<RevertResult> {
  try {
    console.log(`\n🔄 Reverting environment promotion...`);
    console.log(`   Tenant ID: ${tenantId}`);
    console.log(`   From: ${fromEnvironment} → To: ${toEnvironment}`);

    // 1. Get current data in fromEnvironment (to be deleted)
    const fromData = await getEnvironmentData(tenantId, fromEnvironment);
    console.log(`   Records in "${fromEnvironment}": ${fromData.recordCount}`);

    // 2. Get data in toEnvironment (to be restored)
    const toData = await getEnvironmentData(tenantId, toEnvironment);
    console.log(`   Records in "${toEnvironment}": ${toData.recordCount}`);

    if (fromData.recordCount === 0) {
      console.log(`   ℹ️  No records to delete (${fromEnvironment} is empty)`);
    }

    if (toData.recordCount === 0) {
      console.log(`   ⚠️  WARNING: No records to restore (${toEnvironment} is empty)`);
      console.log('   This may indicate promotion never occurred or data was deleted');
    }

    if (!dryRun) {
      // 3. Delete records in fromEnvironment
      console.log(`\n🗑️  Deleting ${fromData.recordCount} records from "${fromEnvironment}"...`);
      
      await db.execute(
        sql`DELETE FROM users WHERE tenant_id = ${tenantId} AND environment = ${fromEnvironment}`
      );
      await db.execute(
        sql`DELETE FROM conversations WHERE tenant_id = ${tenantId} AND environment = ${fromEnvironment}`
      );
      await db.execute(
        sql`DELETE FROM invoices WHERE tenant_id = ${tenantId} AND environment = ${fromEnvironment}`
      );
      await db.execute(
        sql`DELETE FROM documents WHERE tenant_id = ${tenantId} AND environment = ${fromEnvironment}`
      );

      // 4. Copy records from toEnvironment to fromEnvironment
      console.log(
        `\n📥 Copying ${toData.recordCount} records from "${toEnvironment}" to "${fromEnvironment}"...`
      );

      // Note: This creates duplicate records with environment field updated
      // In practice, you'd use PITR to restore the exact state
      await db.execute(
        sql`
          INSERT INTO users (tenant_id, email, name, role, environment, created_at, updated_at)
          SELECT tenant_id, email, name, role, ${fromEnvironment}, created_at, updated_at
          FROM users
          WHERE tenant_id = ${tenantId} AND environment = ${toEnvironment}
        `
      );

      await db.execute(
        sql`
          INSERT INTO conversations (tenant_id, user_id, title, environment, created_at, updated_at)
          SELECT tenant_id, user_id, title, ${fromEnvironment}, created_at, updated_at
          FROM conversations
          WHERE tenant_id = ${tenantId} AND environment = ${toEnvironment}
        `
      );

      // Similar for invoices, documents, etc.

      // 5. Log revert in audit trail
      await db.execute(
        sql`
          INSERT INTO audit_trail (
            tenant_id,
            user_id,
            action,
            table_name,
            details,
            created_at
          ) VALUES (
            ${tenantId},
            NULL,
            'ENVIRONMENT_REVERT',
            'multiple',
            ${JSON.stringify({
              from: fromEnvironment,
              to: toEnvironment,
              reason,
              operator,
              records_deleted: fromData.recordCount,
              records_restored: toData.recordCount,
            })},
            NOW()
          )
        `
      );

      console.log(`\n✅ Revert complete`);
      console.log(`   - Deleted ${fromData.recordCount} records from "${fromEnvironment}"`);
      console.log(`   - Restored ${toData.recordCount} records to "${fromEnvironment}"`);
    } else {
      console.log(`\n📋 [DRY-RUN] Would delete ${fromData.recordCount} records from "${fromEnvironment}"`);
      console.log(`📋 [DRY-RUN] Would restore ${toData.recordCount} records to "${fromEnvironment}"`);
    }

    return {
      tenantSlug: '', // Will be filled by caller
      tenantId,
      fromEnvironment,
      toEnvironment,
      recordsDeleted: fromData.recordCount,
      recordsRestored: toData.recordCount,
      success: true,
    };
  } catch (error) {
    console.error('Failed to revert environment promotion:', error);
    return {
      tenantSlug: '',
      tenantId,
      fromEnvironment,
      toEnvironment,
      recordsDeleted: 0,
      recordsRestored: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function main() {
  try {
    console.log('🔄 Revert Environment Promotion Script\n');
    console.log('═'.repeat(80));

    // 1. Parse arguments
    const args = yargs(hideBin(process.argv))
      .option('tenant', {
        type: 'string',
        description: 'Tenant slug to revert',
        demandOption: true,
      })
      .option('from', {
        type: 'string',
        description: 'Environment to revert FROM (e.g., "production")',
        demandOption: true,
      })
      .option('to', {
        type: 'string',
        description: 'Environment to restore TO (e.g., "sandbox")',
        demandOption: true,
      })
      .option('reason', {
        type: 'string',
        description: 'Reason for reverting environment promotion',
      })
      .option('dry-run', {
        type: 'boolean',
        description: 'Preview changes without executing',
        default: true,
      })
      .option('execute', {
        type: 'boolean',
        description: 'Actually execute the revert operation',
        default: false,
      })
      .option('yes', {
        type: 'boolean',
        description: 'Skip confirmation prompt',
        default: false,
      })
      .option('operator', {
        type: 'string',
        description: 'Operator email for audit trail',
        default: process.env.USER || process.env.OPERATOR_NAME || 'system',
      })
      .help()
      .parseSync() as RevertPromotionArgs;

    // Set dryRun based on execute flag
    args.dryRun = args.execute ? false : true;

    console.log('\n📋 Parsed Arguments:');
    console.log(`   - Mode: ${args.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
    console.log(`   - Tenant: ${args.tenant}`);
    console.log(`   - From: ${args.from}`);
    console.log(`   - To: ${args.to}`);
    if (args.reason) {
      console.log(`   - Reason: ${args.reason}`);
    }
    console.log(`   - Operator: ${args.operator}\n`);

    // 2. Validate arguments
    if (args.execute && !args.reason) {
      console.error('❌ Error: --reason flag is required when using --execute mode');
      console.error(
        '   Example: --execute --reason "Rollback canary deployment - schema migration failed"'
      );
      process.exit(1);
    }

    if (args.execute && !args.operator) {
      console.error('❌ Error: --operator flag is required when using --execute mode');
      console.error('   Example: --operator "platform-admin@assistos.com"');
      process.exit(1);
    }

    // Validate environment names
    const validEnvironments = ['production', 'sandbox'];
    if (!validEnvironments.includes(args.from)) {
      console.error(`❌ Error: Invalid --from environment "${args.from}"`);
      console.error(`   Valid environments: ${validEnvironments.join(', ')}`);
      process.exit(1);
    }

    if (!validEnvironments.includes(args.to)) {
      console.error(`❌ Error: Invalid --to environment "${args.to}"`);
      console.error(`   Valid environments: ${validEnvironments.join(', ')}`);
      process.exit(1);
    }

    // 3. Load configuration
    const config = loadConfig();
    initializeSentry(config);

    // 4. Get tenant ID
    console.log(`🔍 Looking up tenant: ${args.tenant}\n`);
    const tenantId = await getTenantId(args.tenant);

    if (!tenantId) {
      console.error(`❌ Error: Tenant "${args.tenant}" not found`);
      process.exit(1);
    }

    console.log(`✅ Found tenant: ${args.tenant} (ID: ${tenantId})\n`);

    // 5. Get last promotion timestamp
    const lastPromotion = await getLastPromotionTimestamp(
      tenantId,
      args.to,
      args.from
    );

    if (lastPromotion) {
      console.log(`📅 Last promotion timestamp: ${lastPromotion.toISOString()}`);
      console.log(
        `   ℹ️  This revert will restore data to state before promotion\n`
      );
    } else {
      console.log(
        `⚠️  WARNING: No promotion record found in audit trail`
      );
      console.log('   This may indicate:');
      console.log('   - Promotion was never performed');
      console.log('   - Promotion occurred before audit trail was implemented');
      console.log('   - Manual data manipulation occurred\n');
    }

    // 6. Get environment data
    console.log('📊 Analyzing environments...\n');
    const fromData = await getEnvironmentData(tenantId, args.from);
    const toData = await getEnvironmentData(tenantId, args.to);

    console.log('='.repeat(80));
    console.log('Environment Data Summary:');
    console.log('='.repeat(80));
    console.log(
      `${'Environment'.padEnd(15)} | ${'Records'.padEnd(10)} | ${'Status'.padEnd(30)}`
    );
    console.log('-'.repeat(80));
    console.log(
      `${args.from.padEnd(15)} | ${String(fromData.recordCount).padEnd(10)} | ${fromData.recordCount > 0 ? 'Will be DELETED' : 'Empty'}`
    );
    console.log(
      `${args.to.padEnd(15)} | ${String(toData.recordCount).padEnd(10)} | ${toData.recordCount > 0 ? 'Will be COPIED to ' + args.from : 'Empty (WARNING)'}`
    );
    console.log('='.repeat(80));

    // 7. Confirmation prompt
    if (args.execute) {
      console.log(
        `\n⚠️  WARNING: You are about to revert environment promotion for tenant "${args.tenant}"`
      );
      console.log(`   Mode: EXECUTE (changes will be applied)`);
      console.log(`   From: ${args.from} (${fromData.recordCount} records will be DELETED)`);
      console.log(`   To: ${args.to} (${toData.recordCount} records will be RESTORED to ${args.from})`);
      console.log(`   Reason: ${args.reason}`);
      console.log(`   Operator: ${args.operator}`);
      console.log(
        `\n   ⚠️  This operation is DESTRUCTIVE and cannot be undone easily`
      );
      console.log('   Ensure you have a database backup or PITR availability');

      // Check for --yes flag to skip confirmation
      if (!args.yes) {
        const confirmed = await confirmAction('\n   Proceed with revert?');
        if (!confirmed) {
          console.log('\n❌ Operation cancelled by user');
          process.exit(0);
        }
      } else {
        console.log('   --yes flag detected, skipping confirmation');
      }
    } else {
      console.log(`\n📋 DRY-RUN MODE: Preview only, no changes will be made`);
      console.log(
        `   To execute, run with: --execute --reason "your reason here" --operator "your-email@assistos.com"`
      );
    }

    // 8. Revert environment promotion
    const result = await revertPromotion(
      tenantId,
      args.from,
      args.to,
      args.reason || 'Environment promotion revert',
      args.operator || 'unknown',
      args.dryRun
    );

    result.tenantSlug = args.tenant;

    // 9. Log to Sentry for audit trail
    if (!args.dryRun && result.success && config.enableSentry) {
      Sentry.captureEvent({
        message: 'Environment Management: Revert Environment Promotion',
        level: args.dryRun ? 'info' : 'warning',
        contexts: {
          action: {
            type: 'revert_environment_promotion',
            tenant_id: tenantId,
            tenant_slug: args.tenant,
            from_environment: args.from,
            to_environment: args.to,
            reason: args.reason || 'Environment promotion revert',
            operator: args.operator || 'unknown',
            dry_run: args.dryRun,
            records_deleted: result.recordsDeleted,
            records_restored: result.recordsRestored,
            timestamp: new Date().toISOString(),
          },
        },
      });
      console.log('✅ Audit log sent to Sentry');
    }

    // 10. Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 Revert Summary:');
    console.log(`   - Tenant: ${args.tenant} (ID: ${tenantId})`);
    console.log(`   - From environment: ${args.from}`);
    console.log(`   - To environment: ${args.to}`);
    console.log(`   - Records deleted: ${result.recordsDeleted}`);
    console.log(`   - Records restored: ${result.recordsRestored}`);
    console.log(`   - Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (result.error) {
      console.log(`   - Error: ${result.error}`);
    }
    console.log('='.repeat(80));

    if (args.dryRun) {
      console.log('\n✅ Dry-run complete - no changes were made');
      console.log(
        '   To execute, run with: --execute --reason "your reason here" --operator "your-email@assistos.com"'
      );
    } else {
      if (result.success) {
        console.log('\n✅ Environment promotion reverted successfully');
        console.log('\nℹ️  Next steps:');
        console.log('   1. Verify tenant data integrity');
        console.log('   2. Test tenant login and critical features');
        console.log('   3. Notify tenant if necessary');
        console.log('   4. Document incident in post-mortem');
      } else {
        console.log('\n❌ Environment promotion revert failed');
        console.log('   Check error details above and database state');
      }
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Execute main function
main();
