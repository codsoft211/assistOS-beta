# 🚀 Plano: Live para Quarta-Feira - Tenant End-to-End

**Data:** 2025-11-17  
**Deadline:** Quarta-feira, 2025-11-19 (2 dias)  
**Objetivo:** Ter projeto funcional com 1 tenant de teste completo

---

## 🎯 OBJETIVO FINAL

**Ter um tenant funcional onde podemos:**
1. ✅ Criar conta e fazer login
2. ✅ Criar/processar faturas
3. ✅ Criar budgets
4. ✅ Usar AssistME para operações básicas
5. ✅ Ver dados em dashboards básicos

---

## 📋 CHECKLIST PRÉ-PRODUÇÃO (Prioridade)

### **Fase 1: Infraestrutura Crítica (Dia 1 - Manhã) - 2h**

#### ✅ 1.1 Verificar Secrets Críticos (30 min)
```bash
# Verificar se todos os secrets estão configurados no Replit
echo "Verificando secrets críticos..."
[ -z "$DATABASE_URL" ] && echo "❌ DATABASE_URL missing"
[ -z "$REDIS_URL" ] && echo "❌ REDIS_URL missing"
[ -z "$OPENAI_API_KEY" ] && echo "❌ OPENAI_API_KEY missing"
[ -z "$ANTHROPIC_API_KEY" ] && echo "❌ ANTHROPIC_API_KEY missing"
[ -z "$SESSION_SECRET" ] && echo "❌ SESSION_SECRET missing"
```

**Ação:** 
- Abrir Replit Secrets
- Verificar cada secret
- Criar os que faltam

#### ✅ 1.2 Configurar Connection Pooling Neon (30 min)
```bash
# 1. Aceder Neon Dashboard: https://console.neon.tech/
# 2. Ir para Settings > Connection Pooling
# 3. Enable pgBouncer (Session mode)
# 4. Copiar nova DATABASE_URL (tem "pooler.neon.tech" no hostname)
# 5. Atualizar Replit Secret: DATABASE_URL
```

**Ação:** Ativar pooler e atualizar connection string

#### ✅ 1.3 Verificar Health Checks (15 min)
```bash
# Testar health endpoint
curl http://localhost:5000/api/health
# Deve retornar: {"status": "healthy", ...}
```

**Ação:** Garantir que health endpoint funciona

#### ✅ 1.4 Verificar Servidor Inicia (15 min)
```bash
# Reiniciar servidor
npm run dev
# Verificar logs - não deve ter erros críticos
```

**Ação:** Confirmar que servidor inicia sem erros

---

### **Fase 2: Mitigação de Riscos Críticos (Dia 1 - Tarde) - 3h**

#### ✅ 2.1 Desabilitar Módulos Não Funcionais (30 min)

**Arquivos a modificar:**
- `packages/modules/hr/index.ts`
- `packages/modules/production/index.ts`
- `packages/modules/accounting/index.ts`

**Ação:** Modificar para retornar erro claro:
```typescript
async executeInternal(...) {
  throw new Error('Módulo HR ainda não está disponível. Em breve!');
}
```

#### ✅ 2.2 Adicionar Retry Logic Básico (1h)

**Arquivo:** `apps/api/services/openai.service.ts`

**Ação:** Adicionar wrapper com retry:
```typescript
async function callOpenAIWithRetry(fn: () => Promise<any>, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (i === retries - 1) throw error;
      if (error.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
}
```

#### ✅ 2.3 Verificar Multi-Tenant Security (30 min)

**Ação:** 
- Revisar `apps/api/middleware/hard-tenant-guard.ts`
- Garantir que rotas críticas usam `hardTenantGuard`
- Testar isolamento básico

#### ✅ 2.4 Melhorar Error Handling (1h)

**Ação:** Adicionar wrapper básico para rotas:
```typescript
function safeRoute(handler: Function) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.error('[Route Error]', error);
      res.status(500).json({ 
        error: 'Algo correu mal. Por favor, tente novamente.',
        requestId: req.id 
      });
    }
  };
}
```

---

### **Fase 3: Setup Tenant de Teste (Dia 2 - Manhã) - 2h**

#### ✅ 3.1 Criar Script de Provisionamento (30 min)

**Criar:** `scripts/create-test-tenant.ts`

```typescript
import { db } from '../apps/api/db';
import { tenants, users, userTenants } from '../shared/schema';
import bcrypt from 'bcrypt';

async function createTestTenant() {
  const tenantId = 'test-tenant-001';
  const userId = 'test-user-001';
  const password = 'Teste123!';
  
  // Criar tenant
  await db.insert(tenants).values({
    id: tenantId,
    name: 'Empresa Teste',
    slug: 'empresa-teste',
    status: 'active',
    tier: 'premium',
    country: 'PT',
    currency: 'EUR',
    timezone: 'Europe/Lisbon',
  }).onConflictDoNothing();
  
  // Criar usuário
  const hashedPassword = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    id: userId,
    email: 'admin@teste.com',
    firstName: 'Admin',
    lastName: 'Teste',
    password: hashedPassword,
    isActive: true,
  }).onConflictDoNothing();
  
  // Associar usuário ao tenant
  await db.insert(userTenants).values({
    userId,
    tenantId,
    role: 'owner',
    permissions: { all: true },
    activeEnvironment: 'production',
  }).onConflictDoNothing();
  
  console.log('✅ Tenant de teste criado!');
  console.log(`   Email: admin@teste.com`);
  console.log(`   Password: ${password}`);
  console.log(`   Tenant: empresa-teste`);
}

createTestTenant();
```

**Ação:** Criar script e executar: `npx tsx scripts/create-test-tenant.ts`

#### ✅ 3.2 Seed Data Básico (30 min)

**Criar:** `scripts/seed-test-data.ts`

```typescript
import { db } from '../apps/api/db';
import { suppliers, clients, budgets } from '../shared/schema';

async function seedTestData(tenantId: string) {
  // Fornecedor
  await db.insert(suppliers).values({
    tenantId,
    name: 'Fornecedor Teste',
    email: 'fornecedor@teste.com',
    taxId: '123456789',
  }).onConflictDoNothing();
  
  // Cliente
  await db.insert(clients).values({
    tenantId,
    name: 'Cliente Teste',
    email: 'cliente@teste.com',
    taxId: '987654321',
  }).onConflictDoNothing();
  
  // Budget
  await db.insert(budgets).values({
    tenantId,
    name: 'Marketing - Novembro 2025',
    period: 'monthly',
    amount: '10000',
    category: 'marketing',
  }).onConflictDoNothing();
  
  console.log('✅ Dados de teste criados!');
}

seedTestData('test-tenant-001');
```

**Ação:** Executar: `npx tsx scripts/seed-test-data.ts`

#### ✅ 3.3 Ativar Módulos Essenciais (30 min)

**Módulos necessários:**
- ✅ Financeiro (faturas, fornecedores, clientes)
- ✅ Documentos (upload, processamento)
- ✅ AssistME (conversational AI)

**Ação:** Verificar que módulos estão ativos (devem estar por padrão)

#### ✅ 3.4 Testar Login (30 min)

**Ação:**
1. Acessar `/login`
2. Login com `admin@teste.com` / `Teste123!`
3. Verificar redirecionamento
4. Verificar tenant context carregado

---

### **Fase 4: Testes End-to-End (Dia 2 - Tarde) - 3h**

#### ✅ 4.1 Fluxo de Login (15 min)
```
1. Acessar /login
2. Fazer login com admin@teste.com
3. Verificar redirecionamento para dashboard
4. Verificar tenant context carregado
```

#### ✅ 4.2 Fluxo de Fatura (30 min)
```
1. Upload de fatura (PDF de teste)
2. Processamento automático (OCR)
3. Criação de fatura no sistema
4. Verificação de dados extraídos
```

#### ✅ 4.3 Fluxo de Budget (30 min)
```
1. AssistME: "Cria um budget de marketing de €10,000"
2. Verificar criação no database
3. AssistME: "Como está o budget de marketing?"
4. Verificar resposta do AssistME
```

#### ✅ 4.4 Fluxo AssistME Básico (45 min)
```
1. Abrir AssistME
2. "Lista os fornecedores" → Deve listar "Fornecedor Teste"
3. "Lista os clientes" → Deve listar "Cliente Teste"
4. "Cria uma fatura para o fornecedor Teste de €500" → Deve criar
5. "Mostra-me as faturas" → Deve mostrar fatura criada
```

#### ✅ 4.5 Testes de Isolamento (30 min)
```
1. Criar segundo tenant (se possível)
2. Verificar que dados não se misturam
3. Verificar que usuário não acessa tenant sem permissão
```

#### ✅ 4.6 Documentação Rápida (30 min)
```
1. Documentar credenciais de teste
2. Documentar fluxos testados
3. Listar bugs encontrados
4. Criar lista de "sabemos que não funciona"
```

---

## 🛠️ SCRIPTS PRONTOS

### **Script 1: Verificar Pronto para Produção**

```bash
#!/bin/bash
# scripts/check-production-ready.sh

echo "🔍 Verificando se está pronto para produção..."

# Secrets
echo "📋 Verificando secrets..."
[ -z "$DATABASE_URL" ] && echo "❌ DATABASE_URL" || echo "✅ DATABASE_URL"
[ -z "$REDIS_URL" ] && echo "❌ REDIS_URL" || echo "✅ REDIS_URL"
[ -z "$OPENAI_API_KEY" ] && echo "❌ OPENAI_API_KEY" || echo "✅ OPENAI_API_KEY"
[ -z "$ANTHROPIC_API_KEY" ] && echo "❌ ANTHROPIC_API_KEY" || echo "✅ ANTHROPIC_API_KEY"
[ -z "$SESSION_SECRET" ] && echo "❌ SESSION_SECRET" || echo "✅ SESSION_SECRET"

# Health checks
echo "📋 Verificando health..."
curl -f http://localhost:5000/api/health > /dev/null 2>&1
[ $? -eq 0 ] && echo "✅ Health endpoint" || echo "❌ Health endpoint"

echo ""
echo "✅ Verificação completa!"
```

### **Script 2: Criar Tenant de Teste**

Ver código completo na Fase 3.1 acima.

### **Script 3: Seed Data**

Ver código completo na Fase 3.2 acima.

---

## 📝 CHECKLIST FINAL (Quarta-feira de Manhã)

### **Antes de Ir Live:**

- [ ] Todos os secrets configurados no Replit
- [ ] Connection pooling ativo (Neon)
- [ ] Health checks funcionando (`/api/health`)
- [ ] Servidor inicia sem erros
- [ ] Tenant de teste criado
- [ ] Dados de seed criados
- [ ] Login funciona (admin@teste.com)
- [ ] AssistME responde
- [ ] Upload de fatura funciona
- [ ] Criação de budget funciona
- [ ] Módulos stub desabilitados (HR, Production, Accounting)
- [ ] Retry logic básico implementado
- [ ] Error handling básico implementado

### **Testes Básicos (Todos devem passar):**

- [ ] Login → Dashboard
- [ ] Upload fatura → Processamento
- [ ] AssistME: "Lista fornecedores"
- [ ] AssistME: "Cria budget de marketing €10k"
- [ ] AssistME: "Como está o budget?"
- [ ] Criar fatura manualmente
- [ ] Ver lista de faturas

---

## 🎯 PRIORIZAÇÃO (O que fazer primeiro)

### **Dia 1 (Segunda-feira):**

**Manhã (2h):**
1. ✅ Verificar secrets (30 min)
2. ✅ Configurar connection pooling (30 min)
3. ✅ Verificar health checks (15 min)
4. ✅ Testar servidor (15 min)

**Tarde (3h):**
1. ✅ Desabilitar módulos stub (30 min)
2. ✅ Adicionar retry logic (1h)
3. ✅ Verificar segurança (30 min)
4. ✅ Melhorar error handling (1h)

### **Dia 2 (Terça-feira):**

**Manhã (2h):**
1. ✅ Criar script de tenant (30 min)
2. ✅ Seed data (30 min)
3. ✅ Ativar módulos (30 min)
4. ✅ Testar login (30 min)

**Tarde (3h):**
1. ✅ Testes E2E completos (2h)
2. ✅ Corrigir bugs encontrados (1h)
3. ✅ Documentação rápida (30 min)

---

## 🚨 MITIGAÇÕES RÁPIDAS (Implementar Hoje)

### **1. Retry Logic Básico (30 min)**
```typescript
// apps/api/services/openai.service.ts
async function callOpenAIWithRetry(fn: () => Promise<any>, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (i === retries - 1) throw error;
      if (error.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
}
```

### **2. Desabilitar Módulos Stub (15 min)**
```typescript
// packages/modules/hr/index.ts (e production, accounting)
async executeInternal(...) {
  throw new Error('Módulo HR ainda não está disponível. Em breve!');
}
```

### **3. Health Check Melhorado (20 min)**
```typescript
// apps/api/routes/health.ts
router.get('/ready', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    openai: getOpenAIStatus(),
  };
  
  const allHealthy = Object.values(checks).every(c => c.status === 'healthy');
  res.status(allHealthy ? 200 : 503).json(checks);
});
```

---

## 📚 CREDENCIAIS DE TESTE

**Após executar scripts:**

- **Email:** `admin@teste.com`
- **Password:** `Teste123!`
- **Tenant Slug:** `empresa-teste`
- **Tenant ID:** `test-tenant-001`

---

## ⚠️ O QUE NÃO FAZER (Por Agora)

- ❌ Não implementar módulos stub (HR, Production, Accounting)
- ❌ Não fazer refatorações grandes
- ❌ Não adicionar features novas
- ❌ Não otimizar performance (a menos que bloqueie)
- ❌ Não fazer migrations grandes

**Foco:** Funcionalidade básica funcionando, não perfeição.

---

## 🎉 RESULTADO ESPERADO

**Quarta-feira de manhã:**
- ✅ Sistema rodando
- ✅ Tenant de teste criado e funcional
- ✅ Login funcionando
- ✅ AssistME respondendo
- ✅ Fluxos básicos testados
- ✅ Pronto para primeiros testes com usuários reais

**Próximos passos (após quarta):**
- Coletar feedback dos primeiros testes
- Corrigir bugs encontrados
- Melhorar UX baseado em feedback
- Adicionar features que faltam

---

## 🆘 PLANO B (Se Algo Falhar)

**Se database falhar:**
- Usar backup do Neon (PITR)
- Restaurar para estado anterior

**Se API externa falhar:**
- Retry logic deve ajudar
- Se persistir, mostrar mensagem clara ao usuário

**Se tenant não funcionar:**
- Criar novo tenant manualmente via SQL
- Verificar logs para identificar problema

**Se login não funcionar:**
- Verificar password hash
- Verificar userTenants table
- Verificar session middleware

---

## 📋 RESUMO EXECUTIVO

**Tempo Total Estimado:** ~10 horas (2 dias)

**Dia 1:** Infraestrutura + Mitigação de Riscos (5h)  
**Dia 2:** Setup Tenant + Testes E2E (5h)

**Riscos Mitigados:**
- ✅ Dependências externas (retry logic)
- ✅ Código não funcional (módulos desabilitados)
- ✅ Error handling (wrapper básico)
- ✅ Health checks (endpoint melhorado)

**Pronto para:**
- ✅ Primeiros testes com usuários
- ✅ Demo básica
- ✅ Feedback collection

---

**Última atualização:** 2025-11-17  
**Status:** 🟢 PRONTO PARA EXECUTAR

