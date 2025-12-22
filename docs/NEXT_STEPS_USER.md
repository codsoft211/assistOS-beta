# ✅ Próxima Ação: Executar SQL Manual

**Status:** 🔴 AGUARDANDO VOCÊ  
**Tempo:** 15 minutos  
**Prioridade:** P0 Critical

---

## 🎯 O Que Fazer AGORA

### 1️⃣ Abrir Replit Database

Clique no ícone "Database" → Selecione database desenvolvimento → SQL console

### 2️⃣ Copiar e Executar Este SQL

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

### 3️⃣ Validar (Opcional)

```sql
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE indexname LIKE '%embeddings_unique'
ORDER BY tablename;
```

**Esperado:** 5 linhas (1 por tabela)

### 4️⃣ Avisar o Agent

Escreva: **"SQL executado"** ou **"Feito"**

---

## 🤖 O Que o Agent Fará Automaticamente

1. ✅ Validar índices criados
2. ✅ Executar 30+ regression tests
3. ✅ Executar performance baselines
4. ✅ Avaliar se precisa otimizações (BUG #2)
5. ✅ Completar Sprint 1 Review

**Tempo estimado total:** 1-2 horas (100% automático após você executar SQL)

---

## 📁 Arquivos Criados Para Você

- `migrations/manual/001_add_embedding_unique_constraints.sql` - SQL completo
- `docs/SPRINT1_UNBLOCK_GUIDE.md` - Guia detalhado
- `scripts/validate-migration-001.ts` - Validação automática
- `scripts/run-sprint1-tests.sh` - Test runner completo

---

## 🔒 Segurança Garantida

- ✅ Idempotente (`IF NOT EXISTS`)
- ✅ Zero alteração de dados
- ✅ Zero downtime
- ✅ Rollback simples se necessário

---

**👉 AÇÃO IMEDIATA:** Execute os 5 comandos SQL acima e avise "Feito"
