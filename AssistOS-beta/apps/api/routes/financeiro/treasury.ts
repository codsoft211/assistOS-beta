/**
 * Treasury Module Routes
 * Bank accounts and reconciliation management
 * Extracted from financeiro.ts (lines 1125-1400)
 */

import { Router } from "express";
import { requirePermission } from "../../middleware/permissions.middleware";
import { db } from "../../db";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { bankAccounts, bankReconciliations, invoices, purchasingInvoices } from "../../../../shared/schema";
import { contaBancariaSchema } from "./shared";

export function createTreasuryRouter(): Router {
  const router = Router();

  // ============================================================================
  // CONTAS BANCÁRIAS (BANK ACCOUNTS)
  // ============================================================================

  // GET /contas-bancarias - List bank accounts with pagination and summary
  // GET /accounts - English alias
  router.get(["/contas-bancarias", "/accounts"], requirePermission('financeiro.contas.view'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { page = 1, limit = 50, currency, status } = req.query;

      // Build filter conditions
      let conditions = [eq(bankAccounts.tenantId, tenantId)];
      
      if (currency) {
        conditions.push(eq(bankAccounts.currency, currency as string));
      }
      
      if (status === 'active') {
        conditions.push(eq(bankAccounts.isActive, true));
      } else if (status === 'inactive') {
        conditions.push(eq(bankAccounts.isActive, false));
      }

      // Get paginated accounts
      const accounts = await db
        .select({
          id: bankAccounts.id,
          accountName: bankAccounts.accountName,
          accountNumber: bankAccounts.accountNumber,
          bankName: bankAccounts.bankName,
          currency: bankAccounts.currency,
          currentBalance: bankAccounts.currentBalance,
          iban: bankAccounts.iban,
          isActive: bankAccounts.isActive,
          accountType: bankAccounts.accountType,
          updatedAt: bankAccounts.updatedAt,
        })
        .from(bankAccounts)
        .where(and(...conditions))
        .orderBy(desc(bankAccounts.isDefault), bankAccounts.accountName)
        .limit(Number(limit))
        .offset((Number(page) - 1) * Number(limit));

      // Get total count
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(bankAccounts)
        .where(and(...conditions));

      // Calculate summary
      const allAccounts = await db
        .select({
          currentBalance: bankAccounts.currentBalance,
          currency: bankAccounts.currency,
        })
        .from(bankAccounts)
        .where(eq(bankAccounts.tenantId, tenantId));

      const totalBalance = allAccounts.reduce((sum, acc) => sum + parseFloat(acc.currentBalance || '0'), 0);
      const currencies = Array.from(new Set(allAccounts.map(acc => acc.currency)));
      
      // Transform accounts with recent transactions placeholder
      const transformedAccounts = accounts.map(acc => ({
        id: acc.id,
        accountName: acc.accountName,
        accountNumber: acc.accountNumber,
        bankName: acc.bankName,
        currency: acc.currency,
        currentBalance: parseFloat(acc.currentBalance || '0'),
        lastStatementDate: null, // TODO: Implement when bank_statement_lines table added
        recentTransactions: 0, // TODO: Count from bank_statement_lines (last 30 days)
        status: acc.isActive ? 'active' : 'inactive',
      }));

      res.json({
        accounts: transformedAccounts,
        total: Number(count),
        page: Number(page),
        limit: Number(limit),
        summary: {
          totalBalance,
          accountsCount: allAccounts.length,
          currencies,
        }
      });

      console.log(`[Financeiro Treasury] ✅ Listadas ${transformedAccounts.length} contas bancárias (saldo total: €${totalBalance.toFixed(2)})`);
    } catch (error: any) {
      console.error("[Financeiro Treasury] ❌ Erro ao listar contas bancárias:", error);
      res.status(500).json({ error: "Failed to list bank accounts" });
    }
  });

  // POST /contas-bancarias - Create bank account
  router.post("/contas-bancarias", requirePermission('financeiro.contas.manage'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const validatedData = contaBancariaSchema.parse(req.body);

      const [newAccount] = await db.insert(bankAccounts).values({
        tenantId,
        bankName: validatedData.nomeBanco,
        accountName: validatedData.nomeConta,
        accountNumber: validatedData.numeroConta,
        iban: validatedData.iban,
        swift: validatedData.swift,
        currency: validatedData.moeda,
        accountType: validatedData.tipoConta === 'Ordem' ? 'checking' : 'savings',
        currentBalance: validatedData.saldoInicial.toFixed(2),
        isActive: validatedData.ativa,
      }).returning();

      res.status(201).json(newAccount);
    } catch (error: any) {
      console.error("[Financeiro API] Error creating bank account:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create bank account" });
    }
  });

  // PATCH /contas-bancarias/:id - Update bank account
  router.patch("/contas-bancarias/:id", requirePermission('financeiro.contas.manage'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const validatedData = contaBancariaSchema.partial().parse(req.body);

      const updateData: any = {};
      if (validatedData.nomeConta) updateData.accountName = validatedData.nomeConta;
      if (validatedData.nomeBanco) updateData.bankName = validatedData.nomeBanco;
      if (validatedData.numeroConta) updateData.accountNumber = validatedData.numeroConta;
      if (validatedData.iban) updateData.iban = validatedData.iban;
      if (validatedData.swift) updateData.swift = validatedData.swift;
      if (validatedData.moeda) updateData.currency = validatedData.moeda;
      if (validatedData.tipoConta) updateData.accountType = validatedData.tipoConta === 'Ordem' ? 'checking' : 'savings';
      if (validatedData.ativa !== undefined) updateData.isActive = validatedData.ativa;

      updateData.updatedAt = new Date();

      const [updatedAccount] = await db
        .update(bankAccounts)
        .set(updateData)
        .where(and(
          eq(bankAccounts.id, req.params.id),
          eq(bankAccounts.tenantId, tenantId)
        ))
        .returning();

      if (!updatedAccount) {
        return res.status(404).json({ error: "Bank account not found" });
      }

      res.json(updatedAccount);
    } catch (error: any) {
      console.error("[Financeiro API] Error updating bank account:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update bank account" });
    }
  });

  // PATCH /contas-bancarias/:id/toggle - Toggle active status
  router.patch("/contas-bancarias/:id/toggle", requirePermission('financeiro.contas.manage'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { ativa } = req.body;

      await db
        .update(bankAccounts)
        .set({
          isActive: ativa,
          updatedAt: new Date(),
        })
        .where(and(
          eq(bankAccounts.id, req.params.id),
          eq(bankAccounts.tenantId, tenantId)
        ));

      res.json({ message: "Bank account status updated" });
    } catch (error: any) {
      console.error("[Financeiro API] Error toggling bank account:", error);
      res.status(500).json({ error: "Failed to toggle bank account" });
    }
  });

  // DELETE /contas-bancarias/:id - Delete bank account
  router.delete("/contas-bancarias/:id", requirePermission('financeiro.contas.manage'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await db
        .delete(bankAccounts)
        .where(and(
          eq(bankAccounts.id, req.params.id),
          eq(bankAccounts.tenantId, tenantId)
        ));

      res.json({ message: "Bank account deleted successfully" });
    } catch (error: any) {
      console.error("[Financeiro API] Error deleting bank account:", error);
      res.status(500).json({ error: "Failed to delete bank account" });
    }
  });

  // ============================================================================
  // RECONCILIAÇÕES (BANK RECONCILIATIONS)
  // ============================================================================

  // GET /reconciliacoes/transacoes - Get bank transactions
  router.get("/reconciliacoes/transacoes", requirePermission('financeiro.reconciliacao'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { contaId } = req.query;

      // Return empty for now - would show bank statement transactions
      res.json([]);
    } catch (error: any) {
      console.error("[Financeiro API] Error getting transactions:", error);
      res.status(500).json({ error: "Failed to get transactions" });
    }
  });

  // GET /reconciliacoes/historico - Get reconciliation history
  router.get("/reconciliacoes/historico", requirePermission('financeiro.reconciliacao'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const reconciliations = await db
        .select()
        .from(bankReconciliations)
        .where(eq(bankReconciliations.tenantId, tenantId))
        .orderBy(desc(bankReconciliations.statementDate))
        .limit(20);

      res.json(reconciliations.map(r => ({
        id: r.id,
        data: r.statementDate?.toISOString() || '',
        conta: `${r.bankName} - ${r.accountNumber}`,
        transacoesReconciliadas: 0, // Would count from reconciled_transactions
        saldoFinal: parseFloat(r.closingBalance || '0'),
      })));
    } catch (error: any) {
      console.error("[Financeiro API] Error getting reconciliation history:", error);
      res.status(500).json({ error: "Failed to get reconciliation history" });
    }
  });

  // POST /reconciliacoes/upload - Upload bank statement
  router.post("/reconciliacoes/upload", requirePermission('financeiro.reconciliacao'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // TODO: Implement file upload and parsing
      res.json({ message: "Bank statement uploaded successfully" });
    } catch (error: any) {
      console.error("[Financeiro API] Error uploading statement:", error);
      res.status(500).json({ error: "Failed to upload statement" });
    }
  });

  // POST /reconciliacoes/matching-automatico - Auto-match transactions
  router.post("/reconciliacoes/matching-automatico", requirePermission('financeiro.reconciliacao'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // TODO: Implement automatic matching algorithm
      res.json({ message: "Automatic matching completed" });
    } catch (error: any) {
      console.error("[Financeiro API] Error in automatic matching:", error);
      res.status(500).json({ error: "Failed to complete automatic matching" });
    }
  });

  // POST /reconciliacoes/associar - Manually associate transaction with payment
  router.post("/reconciliacoes/associar", requirePermission('financeiro.reconciliacao'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { transacaoId, recebimentoId } = req.body;

      // TODO: Associate bank transaction with payment
      res.json({ message: "Transaction associated successfully" });
    } catch (error: any) {
      console.error("[Financeiro API] Error associating transaction:", error);
      res.status(500).json({ error: "Failed to associate transaction" });
    }
  });

  // POST /reconciliacoes/confirmar - Confirm reconciliation
  router.post("/reconciliacoes/confirmar", requirePermission('financeiro.reconciliacao'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // TODO: Finalize and lock reconciliation
      res.json({ message: "Reconciliation confirmed successfully" });
    } catch (error: any) {
      console.error("[Financeiro API] Error confirming reconciliation:", error);
      res.status(500).json({ error: "Failed to confirm reconciliation" });
    }
  });

  // ============================================================================
  // CASHFLOW FORECAST (TREASURY FORECASTING)
  // ============================================================================

  // GET /forecast - Cashflow forecast (AR + AP combined)
  // GET /previsao-tesouraria - Portuguese alias
  router.get(["/forecast", "/previsao-tesouraria"], requirePermission('financial.read'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Parse query params
      const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 365); // 1-365 days, default 90
      const includeConfirmed = req.query.includeConfirmed !== 'false'; // default true
      const includePending = req.query.includePending !== 'false'; // default true

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const forecastEndDate = new Date(today);
      forecastEndDate.setDate(forecastEndDate.getDate() + days);

      // Build status filters
      const invoiceStatuses: string[] = [];
      const purchasingStatuses: string[] = [];
      
      if (includeConfirmed) {
        invoiceStatuses.push('confirmed', 'sent', 'overdue');
        purchasingStatuses.push('confirmed', 'approved', 'overdue');
      }
      if (includePending) {
        invoiceStatuses.push('pending', 'draft');
        purchasingStatuses.push('pending', 'draft');
      }

      // Get starting balance from bank accounts
      const bankAccountsData = await db
        .select({
          currentBalance: bankAccounts.currentBalance,
        })
        .from(bankAccounts)
        .where(and(
          eq(bankAccounts.tenantId, tenantId),
          eq(bankAccounts.isActive, true)
        ));

      const startingBalance = bankAccountsData.reduce((sum, acc) => sum + Number(acc.currentBalance || '0'), 0);

      // Fetch AR (receivables) - group by dueDate
      const arData = await db
        .select({
          date: invoices.dueDate,
          amount: invoices.totalAmount,
        })
        .from(invoices)
        .where(and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'receivable'),
          gte(invoices.dueDate, today),
          lte(invoices.dueDate, forecastEndDate),
          invoiceStatuses.length > 0 ? sql`${invoices.status} = ANY(${invoiceStatuses})` : sql`1=1`
        ));

      // Fetch AP (payables) - group by invoiceDate
      const apData = await db
        .select({
          date: purchasingInvoices.invoiceDate,
          amount: purchasingInvoices.totalAmount,
        })
        .from(purchasingInvoices)
        .where(and(
          eq(purchasingInvoices.tenantId, tenantId),
          sql`${purchasingInvoices.invoiceDate} >= ${today.toISOString().split('T')[0]}`,
          sql`${purchasingInvoices.invoiceDate} <= ${forecastEndDate.toISOString().split('T')[0]}`,
          purchasingStatuses.length > 0 ? sql`${purchasingInvoices.status} = ANY(${purchasingStatuses})` : sql`1=1`
        ));

      // Group inflows by date
      const inflowsByDate = new Map<string, number>();
      arData.forEach(item => {
        if (item.date) {
          const dateKey = item.date.toISOString().split('T')[0];
          const amount = Number(item.amount || '0');
          inflowsByDate.set(dateKey, (inflowsByDate.get(dateKey) || 0) + amount);
        }
      });

      // Group outflows by date
      const outflowsByDate = new Map<string, number>();
      apData.forEach(item => {
        if (item.date) {
          const dateKey = new Date(item.date).toISOString().split('T')[0];
          const amount = Number(item.amount || '0');
          outflowsByDate.set(dateKey, (outflowsByDate.get(dateKey) || 0) + amount);
        }
      });

      // Generate daily forecast
      const forecast = [];
      let cumulativeBalance = startingBalance;
      let totalInflows = 0;
      let totalOutflows = 0;

      for (let i = 0; i < days; i++) {
        const currentDate = new Date(today);
        currentDate.setDate(currentDate.getDate() + i);
        const dateKey = currentDate.toISOString().split('T')[0];

        const inflows = inflowsByDate.get(dateKey) || 0;
        const outflows = outflowsByDate.get(dateKey) || 0;
        const netFlow = inflows - outflows;
        cumulativeBalance += netFlow;

        totalInflows += inflows;
        totalOutflows += outflows;

        forecast.push({
          date: dateKey,
          inflows,
          outflows,
          netFlow,
          cumulativeBalance,
        });
      }

      res.json({
        forecast,
        summary: {
          totalInflows,
          totalOutflows,
          netPosition: totalInflows - totalOutflows,
          startingBalance,
          projectedBalance: cumulativeBalance,
        }
      });

      console.log(`[Financeiro Treasury] ✅ Previsão de tesouraria gerada: ${days} dias`);
    } catch (error: any) {
      console.error("[Financeiro Treasury] ❌ Erro ao gerar previsão de tesouraria:", error);
      res.status(500).json({ error: "Failed to generate cashflow forecast" });
    }
  });

  // ============================================================================
  // BANK STATEMENT UPLOAD (CSV RECONCILIATION)
  // ============================================================================

  // POST /bank-statements - Upload bank statement CSV
  // POST /extratos-bancarios - Portuguese alias
  router.post(["/bank-statements", "/extratos-bancarios"], requirePermission('financial.write'), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { bankAccountId, statementDate, openingBalance, closingBalance } = req.body;

      // Validate required fields
      if (!bankAccountId) {
        return res.status(400).json({ error: "bankAccountId is required" });
      }
      if (!statementDate) {
        return res.status(400).json({ error: "statementDate is required" });
      }
      if (openingBalance === undefined || closingBalance === undefined) {
        return res.status(400).json({ error: "openingBalance and closingBalance are required" });
      }

      // Validate bank account exists and belongs to tenant
      const [account] = await db
        .select()
        .from(bankAccounts)
        .where(and(
          eq(bankAccounts.id, bankAccountId),
          eq(bankAccounts.tenantId, tenantId)
        ))
        .limit(1);

      if (!account) {
        return res.status(404).json({ error: "Bank account not found" });
      }

      // TODO: Implement when bank_statement_lines table is added to schema
      // For now, return placeholder response
      // This would:
      // 1. Use multer middleware to handle file upload
      // 2. Parse CSV file (validate columns: date, description, amount, balance)
      // 3. Create bank_statement_lines records in transaction
      // 4. Update bank account balance
      // 5. Return count of created lines

      res.status(501).json({ 
        error: "Bank statement upload not yet implemented",
        message: "TODO: Implement when bank_statement_lines table is added to schema",
        placeholder: {
          success: false,
          linesCreated: 0,
          statementId: null,
          note: "Schema table 'bank_statement_lines' does not exist yet"
        }
      });

      console.log(`[Financeiro Treasury] ⚠️ Tentativa de importação de extrato (não implementado ainda)`);
    } catch (error: any) {
      console.error("[Financeiro Treasury] ❌ Erro ao processar extrato bancário:", error);
      res.status(500).json({ error: "Failed to upload bank statement" });
    }
  });

  return router;
}
