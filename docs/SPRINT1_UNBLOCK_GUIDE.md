# 🚀 Sprint 1 Unblock Guide - BUG #1 Resolution

**Status:** 🔴 BLOQUEADO - Aguardando ação do user  
**Prioridade:** P0 Critical  
**Tempo Estimado:** 15 minutos (user) + 1h (testes automáticos)  
**Data:** 2025-11-10

---

## 📋 TL;DR

Execute 5 comandos SQL simples via Replit Database tab para desbloquear 30+ testes e completar Sprint 1.

---

## 🎯 Problema

O comando `npm run db:push --force` está com timeout devido a latência alta no database Neon (~500ms). 

**Impacto:**
- ❌ 30+ regression tests bloqueados
- ❌ Baseline performance script bloqueado
- ❌ Sprint 1 validation bloqueada

---

## ✅ Solução (15 minutos)

### **Step 1: Abrir Replit Database Tab**

1. Clique no ícone "Database" na barra lateral esquerda
2. Selecione o database de desenvolvimento
3. Abra o SQL console

### **Step 2: Copiar e Colar SQL**

Execute este SQL (disponível em `migrations/manual/001_add_embedding_unique_constraints.sql`):

```sql
-- 1. SUPPLIER EMBEDDINGS
CREATE UNIQUE INDEX IF NOT EXISTS supplier_embeddings_unique 
ON supplier_embeddings(supplier_id, tenant_id, embedding_source, environment);

-- 2. INVOICE EMBEDDINGS
CREATE UNIQUE INDEX IF NOT EXISTS invoice_embeddings_unique 
ON invoice_embeddings(invoice_id, tenant_id, embedding_source, environment);

-- 3. PROJECT EMBEDDINGS
CREATE UNIQUE INDEX IF NOT EXISTS project_embeddings_unique 
ON project_embeddings(project_id, tenant_id, embedding_source, environment);

-- 4. CLIENT EMBEDDINGS
CREATE UNIQUE INDEX IF NOT EXISTS client_embeddings_unique 
ON client_embeddings(client_id, tenant_id, embedding_source, environment);

-- 5. PRODUCT EMBEDDINGS
CREATE UNIQUE INDEX IF NOT EXISTS product_embeddings_unique 
ON product_embeddings(product_id, tenant_id, embedding_source, environment);
```

### **Step 3: Validar (Opcional)**

Execute para confirmar:

```sql
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE indexname LIKE '%embeddings_unique'
ORDER BY tablename;
```

**Expected output:** 5 rows (1 por tabela)

---

## 🧪 Validação Automática (Após SQL)

### **Option A: Script Rápido (Recomendado)**

```bash
# Valida indices + executa todos os testes
bash scripts/run-sprint1-tests.sh
```

### **Option B: Passo-a-Passo**

```bash
# 1. Validar indices criados
tsx scripts/validate-migration-001.ts

# 2. Testes de isolamento de ambientes
npx vitest run apps/api/tests/integration/environment-isolation.test.ts

# 3. Testes de isolamento multi-tenant
npx vitest run apps/api/tests/integration/tenant-embeddings-isolation.test.ts

# 4. Testes de batch processing
npx vitest run apps/api/tests/integration/embedding-batch.service.test.ts
```

---

## 📊 Exit Criteria

**BUG #1 será considerado RESOLVIDO quando:**

✅ Todos os 5 índices criados (validação automática)  
✅ 30+ regression tests passando (coverage completo)  
✅ Zero falhas em tenant/environment isolation  
✅ Batch processing funcionando corretamente  

---

## 🎯 Próximos Passos (Após BUG #1)

1. **BUG #4:** Executar `tsx scripts/observability/perf-baseline.ts` (5 min)
2. **BUG #2:** Avaliar se SLOs < targets → Redis cache (6h) ou SKIP
3. **Sprint 1 Final:** Review completo + atualizar MASTER_BUGS tracker

---

## 🔒 Segurança

- ✅ **Safe:** `CREATE UNIQUE INDEX IF NOT EXISTS` é idempotente
- ✅ **Non-blocking:** Não altera dados existentes
- ✅ **Rollback:** Simples `DROP INDEX` se necessário
- ✅ **No downtime:** Database continua operacional

---

## 💡 Por Quê Manual?

**Problema Técnico:**
- Drizzle ORM + Neon database = timeout em migrations grandes
- Latência: ~500ms por query (vs <50ms local)
- Alternative: Drizzle-kit `db:push` requer TTY interativo (não automatizável)

**Solução Manual:**
- Execução direta via Replit Database UI
- Zero dependências de ferramentas externas
- 100% controle sobre timing

---

## 📞 Suporte

**Se algo der errado:**

1. Verifique logs: `tsx scripts/validate-migration-001.ts`
2. Rollback: `DROP INDEX <index_name>;` (se necessário)
3. Re-execute SQL completo

**Status atual:** Aguardando execução do SQL pelo user

---

**Última atualização:** 2025-11-10 13:45 UTC  
**Responsável:** User (SQL execution) + Agent (validation + tests)  
**Tracking:** BUG #1 em `docs/MASTER_BUGS_AND_ISSUES.md`
