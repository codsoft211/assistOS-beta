/**
 * Accounting Module - AI Tools
 * 
 * Comprehensive accounting tools for:
 * - Chart of accounts management
 * - Journal entries
 * - Account balances
 * - Financial reporting
 */

import { z } from 'zod';
import type { ModuleTool } from '../../base/module.interface';
import { db } from '../../../../apps/api/db';
import { sql, eq, and, desc } from 'drizzle-orm';
import { AccountingQueryBuilder } from '../query-builder';

// ==================== ZOD VALIDATION SCHEMAS ====================

const createAccountSchema = z.object({
  code: z.string().min(1, 'Account code is required'),
  name: z.string().min(1, 'Account name is required'),
  accountType: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parentAccountId: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const createJournalEntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  description: z.string().min(1, 'Description is required'),
  lines: z.array(z.object({
    accountId: z.string().min(1, 'Account ID is required'),
    debit: z.number().min(0).optional(),
    credit: z.number().min(0).optional(),
    description: z.string().optional(),
  })).min(2, 'At least two lines required'),
  reference: z.string().optional(),
});

const getAccountBalanceSchema = z.object({
  accountId: z.string().min(1, 'Account ID is required'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
});

const getTrialBalanceSchema = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
  periodId: z.string().optional(),
});

export const accountingTools: ModuleTool[] = [
  // ==================== CHART OF ACCOUNTS TOOLS ====================
  
  {
    name: 'list_accounts',
    description: 'Lists chart of accounts with optional filters',
    parameters: [
      { name: 'accountType', type: 'string', description: 'Filter by type (asset, liability, equity, revenue, expense)', required: false },
      { name: 'isActive', type: 'boolean', description: 'Filter by active status', required: false },
      { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 100 },
    ],
    execute: async (params: any, context) => {
      const { accountType, isActive, limit = 100 } = params;
      
      try {
        const queryBuilder = new AccountingQueryBuilder(context.tenantId);
        let query = queryBuilder.select('chart_of_accounts');
        
        const filters: any[] = [];
        if (accountType) filters.push({ field: 'account_type', operator: 'eq' as const, value: accountType });
        if (isActive !== undefined) filters.push({ field: 'is_active', operator: 'eq' as const, value: isActive });
        
        if (filters.length > 0) query = query.where(filters);
        
        const accounts = await query.orderBy('code', 'asc').limit(limit).execute();
        
        return { success: true, accounts, total: accounts.length };
      } catch (error: any) {
        return { success: false, error: `Error listing accounts: ${error.message}` };
      }
    }
  },
  
  {
    name: 'create_account',
    description: 'Creates a new account in the chart of accounts',
    parameters: [
      { name: 'code', type: 'string', description: 'Account code (e.g., 1000, 2100)', required: true },
      { name: 'name', type: 'string', description: 'Account name', required: true },
      { name: 'accountType', type: 'string', description: 'Type: asset, liability, equity, revenue, expense', required: true },
      { name: 'parentAccountId', type: 'string', description: 'Parent account ID', required: false },
      { name: 'description', type: 'string', description: 'Account description', required: false },
      { name: 'isActive', type: 'boolean', description: 'Whether account is active', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = createAccountSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { code, name, accountType, parentAccountId, description, isActive = true } = validation.data;
      
      try {
        const result = await db.execute(sql.raw(`
          INSERT INTO chart_of_accounts (
            tenant_id, code, name, account_type, parent_account_id, description, is_active, created_at
          ) VALUES (
            '${context.tenantId}',
            '${code}',
            '${name.replace(/'/g, "''")}',
            '${accountType}',
            ${parentAccountId ? `'${parentAccountId}'` : 'NULL'},
            ${description ? `'${description.replace(/'/g, "''")}'` : 'NULL'},
            ${isActive},
            NOW()
          ) RETURNING *
        `));
        
        const account = result.rows[0];
        
        return {
          success: true,
          data: {
            accountId: account.id,
            code: account.code,
            name: account.name,
            accountType: account.account_type,
            message: 'Account created successfully',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error creating account: ${error.message}` };
      }
    }
  },
  
  {
    name: 'get_account',
    description: 'Gets detailed information about an account',
    parameters: [
      { name: 'accountId', type: 'string', description: 'Account ID', required: true },
    ],
    execute: async (params: any, context) => {
      const { accountId } = params;
      
      if (!accountId) {
        return { success: false, error: 'Account ID is required' };
      }
      
      try {
        const queryBuilder = new AccountingQueryBuilder(context.tenantId);
        const accounts = await queryBuilder
          .select('chart_of_accounts')
          .where([{ field: 'id', operator: 'eq', value: accountId }])
          .execute();
        
        if (accounts.length === 0) {
          return { success: false, error: 'Account not found' };
        }
        
        return { success: true, account: accounts[0] };
      } catch (error: any) {
        return { success: false, error: `Error fetching account: ${error.message}` };
      }
    }
  },
  
  // ==================== JOURNAL ENTRY TOOLS ====================
  
  {
    name: 'list_journal_entries',
    description: 'Lists journal entries with optional filters',
    parameters: [
      { name: 'status', type: 'string', description: 'Filter by status (draft, posted, reversed)', required: false },
      { name: 'startDate', type: 'string', description: 'Filter from date (YYYY-MM-DD)', required: false },
      { name: 'endDate', type: 'string', description: 'Filter to date (YYYY-MM-DD)', required: false },
      { name: 'limit', type: 'number', description: 'Maximum results', required: false },
    ],
    execute: async (params: any, context) => {
      const { status, startDate, endDate, limit = 50 } = params;
      
      try {
        const queryBuilder = new AccountingQueryBuilder(context.tenantId);
        let query = queryBuilder.select('journal_entries');
        
        const filters: any[] = [];
        if (status) filters.push({ field: 'status', operator: 'eq' as const, value: status });
        if (startDate) filters.push({ field: 'entry_date', operator: 'gte' as const, value: startDate });
        if (endDate) filters.push({ field: 'entry_date', operator: 'lte' as const, value: endDate });
        
        if (filters.length > 0) query = query.where(filters);
        
        const entries = await query.orderBy('entry_date', 'desc').limit(limit).execute();
        
        return { success: true, journalEntries: entries, total: entries.length };
      } catch (error: any) {
        return { success: false, error: `Error listing journal entries: ${error.message}` };
      }
    }
  },
  
  {
    name: 'create_journal_entry',
    description: 'Creates a new journal entry with lines',
    parameters: [
      { name: 'entryDate', type: 'string', description: 'Entry date (YYYY-MM-DD)', required: true },
      { name: 'description', type: 'string', description: 'Entry description', required: true },
      { name: 'lines', type: 'array', description: 'Entry lines with accountId, debit, credit', required: true },
      { name: 'reference', type: 'string', description: 'Reference number', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = createJournalEntrySchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { entryDate, description, lines, reference } = validation.data;
      
      // Validate debits = credits
      const totalDebit = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
      const totalCredit = lines.reduce((sum, l) => sum + (l.credit || 0), 0);
      
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return {
          success: false,
          error: `Debits (${totalDebit}) must equal credits (${totalCredit})`,
        };
      }
      
      try {
        // Generate entry number
        const lastEntry = await db.execute(sql.raw(`
          SELECT entry_number FROM journal_entries 
          WHERE tenant_id = '${context.tenantId}' 
          ORDER BY created_at DESC LIMIT 1
        `));
        
        const lastNumber = lastEntry.rows[0]?.entry_number?.match(/\d+$/)?.[0] || '0';
        const entryNumber = `JE-${String(parseInt(lastNumber) + 1).padStart(6, '0')}`;
        
        // Create journal entry
        const entryResult = await db.execute(sql.raw(`
          INSERT INTO journal_entries (
            tenant_id, entry_number, entry_date, description, reference, status, created_at
          ) VALUES (
            '${context.tenantId}',
            '${entryNumber}',
            '${entryDate}',
            '${description.replace(/'/g, "''")}',
            ${reference ? `'${reference}'` : 'NULL'},
            'draft',
            NOW()
          ) RETURNING *
        `));
        
        const entry = entryResult.rows[0];
        
        // Create lines
        for (const line of lines) {
          await db.execute(sql.raw(`
            INSERT INTO journal_entry_lines (
              tenant_id, journal_entry_id, account_id, debit, credit, description, created_at
            ) VALUES (
              '${context.tenantId}',
              '${entry.id}',
              '${line.accountId}',
              ${line.debit || 0},
              ${line.credit || 0},
              ${line.description ? `'${line.description.replace(/'/g, "''")}'` : 'NULL'},
              NOW()
            )
          `));
        }
        
        return {
          success: true,
          data: {
            journalEntryId: entry.id,
            entryNumber: entry.entry_number,
            status: 'draft',
            totalDebit,
            totalCredit,
            message: 'Journal entry created successfully',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error creating journal entry: ${error.message}` };
      }
    }
  },
  
  {
    name: 'post_journal_entry',
    description: 'Posts a draft journal entry (makes it permanent)',
    parameters: [
      { name: 'journalEntryId', type: 'string', description: 'Journal entry ID', required: true },
    ],
    execute: async (params: any, context) => {
      const { journalEntryId } = params;
      
      if (!journalEntryId) {
        return { success: false, error: 'Journal entry ID is required' };
      }
      
      try {
        const result = await db.execute(sql.raw(`
          UPDATE journal_entries
          SET status = 'posted', posted_at = NOW(), updated_at = NOW()
          WHERE tenant_id = '${context.tenantId}'
            AND id = '${journalEntryId}'
            AND status = 'draft'
          RETURNING *
        `));
        
        if (result.rows.length === 0) {
          return { success: false, error: 'Journal entry not found or cannot be posted' };
        }
        
        return {
          success: true,
          data: {
            journalEntryId,
            status: 'posted',
            message: 'Journal entry posted successfully',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error posting journal entry: ${error.message}` };
      }
    }
  },
  
  {
    name: 'reverse_journal_entry',
    description: 'Creates a reversal entry for a posted journal entry',
    parameters: [
      { name: 'journalEntryId', type: 'string', description: 'Journal entry ID to reverse', required: true },
      { name: 'reversalDate', type: 'string', description: 'Date for reversal entry (YYYY-MM-DD)', required: false },
    ],
    execute: async (params: any, context) => {
      const { journalEntryId, reversalDate } = params;
      
      if (!journalEntryId) {
        return { success: false, error: 'Journal entry ID is required' };
      }
      
      try {
        // Get original entry
        const queryBuilder = new AccountingQueryBuilder(context.tenantId);
        const entries = await queryBuilder
          .select('journal_entries')
          .where([{ field: 'id', operator: 'eq', value: journalEntryId }])
          .execute();
        
        if (entries.length === 0 || entries[0].status !== 'posted') {
          return { success: false, error: 'Journal entry not found or not posted' };
        }
        
        // Mark original as reversed
        await db.execute(sql.raw(`
          UPDATE journal_entries
          SET status = 'reversed', updated_at = NOW()
          WHERE tenant_id = '${context.tenantId}'
            AND id = '${journalEntryId}'
        `));
        
        return {
          success: true,
          data: {
            originalEntryId: journalEntryId,
            status: 'reversed',
            message: 'Journal entry reversed successfully',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error reversing journal entry: ${error.message}` };
      }
    }
  },
  
  // ==================== BALANCE & REPORTING TOOLS ====================
  
  {
    name: 'get_account_balance',
    description: 'Gets the balance of an account for a date range',
    parameters: [
      { name: 'accountId', type: 'string', description: 'Account ID', required: true },
      { name: 'startDate', type: 'string', description: 'Start date (YYYY-MM-DD)', required: false },
      { name: 'endDate', type: 'string', description: 'End date (YYYY-MM-DD)', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = getAccountBalanceSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { accountId, startDate, endDate } = validation.data;
      
      try {
        let dateFilter = '';
        if (startDate && endDate) {
          dateFilter = `AND je.entry_date BETWEEN '${startDate}' AND '${endDate}'`;
        } else if (endDate) {
          dateFilter = `AND je.entry_date <= '${endDate}'`;
        }
        
        const result = await db.execute(sql.raw(`
          SELECT 
            COALESCE(SUM(jel.debit), 0) as total_debit,
            COALESCE(SUM(jel.credit), 0) as total_credit,
            COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0) as balance
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE jel.tenant_id = '${context.tenantId}'
            AND jel.account_id = '${accountId}'
            AND je.status = 'posted'
            ${dateFilter}
        `));
        
        return {
          success: true,
          data: {
            accountId,
            totalDebit: Number(result.rows[0]?.total_debit || 0),
            totalCredit: Number(result.rows[0]?.total_credit || 0),
            balance: Number(result.rows[0]?.balance || 0),
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error getting account balance: ${error.message}` };
      }
    }
  },
  
  {
    name: 'get_trial_balance',
    description: 'Gets trial balance report',
    parameters: [
      { name: 'asOfDate', type: 'string', description: 'As of date (YYYY-MM-DD)', required: false },
      { name: 'periodId', type: 'string', description: 'Financial period ID', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = getTrialBalanceSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { asOfDate } = validation.data;
      
      try {
        let dateFilter = '';
        if (asOfDate) {
          dateFilter = `AND je.entry_date <= '${asOfDate}'`;
        }
        
        const result = await db.execute(sql.raw(`
          SELECT 
            coa.id,
            coa.code,
            coa.name,
            coa.account_type,
            COALESCE(SUM(jel.debit), 0) as debit,
            COALESCE(SUM(jel.credit), 0) as credit,
            COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0) as balance
          FROM chart_of_accounts coa
          LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id AND jel.tenant_id = coa.tenant_id
          LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'posted' ${dateFilter}
          WHERE coa.tenant_id = '${context.tenantId}'
            AND coa.is_active = true
          GROUP BY coa.id, coa.code, coa.name, coa.account_type
          ORDER BY coa.code
        `));
        
        const accounts = result.rows;
        const totalDebit = accounts.reduce((sum: number, a: any) => sum + Number(a.debit || 0), 0);
        const totalCredit = accounts.reduce((sum: number, a: any) => sum + Number(a.credit || 0), 0);
        
        return {
          success: true,
          data: {
            asOfDate: asOfDate || new Date().toISOString().split('T')[0],
            accounts,
            summary: {
              totalDebit,
              totalCredit,
              difference: totalDebit - totalCredit,
              isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
            },
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error getting trial balance: ${error.message}` };
      }
    }
  },
  
  // ==================== ANALYTICS TOOLS ====================
  
  {
    name: 'get_accounting_summary',
    description: 'Gets accounting summary statistics',
    parameters: [],
    execute: async (params: any, context) => {
      try {
        const accountsResult = await db.execute(sql.raw(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE is_active = true) as active
          FROM chart_of_accounts
          WHERE tenant_id = '${context.tenantId}'
        `));
        
        const entriesResult = await db.execute(sql.raw(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'draft') as draft,
            COUNT(*) FILTER (WHERE status = 'posted') as posted,
            COUNT(*) FILTER (WHERE status = 'reversed') as reversed
          FROM journal_entries
          WHERE tenant_id = '${context.tenantId}'
        `));
        
        return {
          success: true,
          data: {
            accounts: accountsResult.rows[0],
            journalEntries: entriesResult.rows[0],
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error getting accounting summary: ${error.message}` };
      }
    }
  },
];

