/**
 * Shared validation schemas and helpers for Financeiro module
 * Extracted from original financeiro.ts (lines 48-84)
 */

import { z } from "zod";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export const faturaSchema = z.object({
  clienteId: z.string().uuid(),
  dataEmissao: z.string(),
  dataVencimento: z.string(),
  linhas: z.array(z.object({
    descricao: z.string(),
    quantidade: z.number().positive(),
    precoUnitario: z.number().min(0),
    taxaIVA: z.number().min(0).max(100),
  })).min(1),
  notas: z.string().optional(),
});

export const recebimentoSchema = z.object({
  clienteId: z.string().uuid().optional(),
  faturaId: z.string().uuid().optional(),
  dataRecebimento: z.string(),
  valor: z.number().positive(),
  metodoPagamento: z.enum(["MB", "Transferência", "Cheque", "Dinheiro", "MB Way"]),
  referencia: z.string().optional(),
  notas: z.string().optional(),
});

export const contaBancariaSchema = z.object({
  nomeConta: z.string(),
  nomeBanco: z.string(),
  numeroConta: z.string(),
  iban: z.string().regex(/^PT50[0-9]{21}$/),
  swift: z.string().optional(),
  moeda: z.string().default("EUR"),
  tipoConta: z.enum(["Ordem", "Poupança"]),
  saldoInicial: z.number().min(0),
  ativa: z.boolean().default(true),
});
