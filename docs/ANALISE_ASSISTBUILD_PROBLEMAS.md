# 🔍 Análise AssistBuild: Possíveis Problemas

**Data:** 2025-11-17  
**Objetivo:** Identificar o que pode estar a quebrar o AssistBuild

---

## 📋 RESUMO EXECUTIVO

**Status do Código:**
- ✅ Backend implementado (rotas, orchestrator, middleware)
- ✅ Frontend implementado (página `/studio`, SSE streaming)
- ⚠️ **Possíveis problemas identificados:** 5 áreas críticas

---

## 🔴 PROBLEMA 1: Permissões (CRÍTICO)

### **O Que Pode Estar Errado:**

**Middleware `requireConfigurator` bloqueia acesso:**
```typescript
// apps/api/middleware/require-configurator.ts linha 46
if (!['owner', 'config'].includes(userRole)) {
  return res.status(403).json({
    error: 'Insufficient permissions',
    message: 'Only organization owners and configurators can access AssistBuild',
  });
}
```

**Possíveis Causas:**
1. User não tem role `owner` ou `config`
2. `getUserRoleInTenant()` retorna `null` ou role incorreta
3. Role não está definida na base de dados

**Como Verificar:**
```bash
# Verificar role do user no tenant
SELECT * FROM tenant_user_roles WHERE user_id = 'USER_ID' AND tenant_id = 'TENANT_ID';
```

**Solução:**
- Garantir que user tem role `owner` ou `config`
- Verificar se `getUserRoleInTenant()` funciona corretamente
- Adicionar logging para debug

---

## 🔴 PROBLEMA 2: OPENAI_API_KEY (CRÍTICO)

### **O Que Pode Estar Errado:**

**Orchestrator precisa de API key:**
```typescript
// packages/ai/agents/assistbuild/orchestrator.ts linha 14
this.openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
```

**Possíveis Causas:**
1. `OPENAI_API_KEY` não está definida no `.env`
2. API key inválida ou expirada
3. Rate limit atingido

**Como Verificar:**
```bash
# Verificar se variável existe
echo $OPENAI_API_KEY

# Testar API key diretamente
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Solução:**
- Verificar `.env` tem `OPENAI_API_KEY=sk-...`
- Testar API key diretamente
- Verificar logs para erros de autenticação

---

## 🔴 PROBLEMA 3: Tools Não Disponíveis (ALTO)

### **O Que Pode Estar Errado:**

**AssistBuild precisa de tools com categorias específicas:**
```typescript
// packages/ai/tools/kernel/tool-allowlists.ts
export const ASSISTBUILD_CONFIGURATION_CATEGORIES = [
  'discovery',
  'configuration',
  'Configuration',
  'validation',
  'creation',
  // ... mais categorias
];
```

**Possíveis Causas:**
1. Nenhuma tool registada com essas categorias
2. Tools não estão carregadas no `toolRegistry`
3. Categoria está escrita diferente (case-sensitive)

**Como Verificar:**
```typescript
// Verificar quantas tools AssistBuild tem
const allManifests = toolRegistry.getAllManifests();
const configTools = filterAssistBuildTools(allManifests);
console.log(`AssistBuild tools: ${configTools.length}`);
```

**Solução:**
- Verificar se tools estão registadas
- Verificar se categorias estão corretas
- Adicionar logging para ver quantas tools estão disponíveis

---

## 🟡 PROBLEMA 4: buildAssistBuildTenantContext (MÉDIO)

### **O Que Pode Estar Errado:**

**Context service pode falhar:**
```typescript
// apps/api/routes/assistbuild-conversations.ts linha 351
const tenantContext = await buildAssistBuildTenantContext(
  tenantId,
  userId,
  environment
);
```

**Possíveis Causas:**
1. Função não existe ou tem erro
2. Retorna dados incorretos
3. Timeout ou erro de database

**Como Verificar:**
- Verificar se `assistbuild-context.service.ts` existe
- Verificar logs para erros nesta função
- Testar função isoladamente

**Solução:**
- Verificar implementação da função
- Adicionar error handling
- Adicionar logging

---

## 🟡 PROBLEMA 5: Frontend Não Conecta (MÉDIO)

### **O Que Pode Estar Errado:**

**Frontend pode não estar a chamar rota correta:**
```typescript
// client/src/pages/studio.tsx linha 281
const response = await fetch(`/api/assistbuild/conversations/${conversationId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: userMessage }),
});
```

**Possíveis Causas:**
1. `conversationId` é `null` ou inválido
2. Rota não está registada
3. CORS ou autenticação falha
4. SSE não funciona no browser

**Como Verificar:**
- Verificar console do browser para erros
- Verificar Network tab para ver requests
- Verificar se `conversationId` existe antes de enviar

**Solução:**
- Verificar se conversa é criada antes de enviar mensagem
- Verificar se rota está registada em `apps/api/routes.ts`
- Adicionar error handling no frontend

---

## 🟢 PROBLEMA 6: Database Schema (BAIXO)

### **O Que Pode Estar Errado:**

**Tabelas podem não existir:**
- `assistbuild_conversations`
- `assistbuild_messages`
- `assistbuild_snapshots`
- `assistbuild_workflow_instances`

**Como Verificar:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name LIKE 'assistbuild%';
```

**Solução:**
- Executar migrations
- Verificar se schema está atualizado

---

## 📋 CHECKLIST DE DIAGNÓSTICO

### **Passo 1: Verificar Permissões**
- [ ] User tem role `owner` ou `config`?
- [ ] `getUserRoleInTenant()` retorna role correta?
- [ ] Logs mostram erro 403?

### **Passo 2: Verificar API Key**
- [ ] `OPENAI_API_KEY` está definida?
- [ ] API key é válida?
- [ ] Logs mostram erro de autenticação?

### **Passo 3: Verificar Tools**
- [ ] Quantas tools AssistBuild tem disponíveis?
- [ ] Tools têm categorias corretas?
- [ ] `toolRegistry` está carregado?

### **Passo 4: Verificar Context**
- [ ] `buildAssistBuildTenantContext()` existe?
- [ ] Função retorna dados corretos?
- [ ] Logs mostram erro nesta função?

### **Passo 5: Verificar Frontend**
- [ ] `conversationId` existe antes de enviar?
- [ ] Rota está registada?
- [ ] Console do browser mostra erros?

### **Passo 6: Verificar Database**
- [ ] Tabelas existem?
- [ ] Migrations executadas?

---

## 🛠️ SCRIPT DE TESTE

```bash
# 1. Verificar API key
echo "OPENAI_API_KEY: ${OPENAI_API_KEY:0:10}..."

# 2. Testar rota (substituir com credenciais reais)
curl -X GET http://localhost:5000/api/assistbuild/conversations \
  -H "Cookie: session=..." \
  -v

# 3. Verificar logs
tail -f logs/app.log | grep AssistBuild
```

---

## 🎯 PRÓXIMOS PASSOS

1. **Executar checklist de diagnóstico**
2. **Verificar logs do servidor** para erros específicos
3. **Testar rota diretamente** com curl/Postman
4. **Verificar console do browser** para erros frontend
5. **Adicionar logging** em pontos críticos

---

**Última atualização:** 2025-11-17  
**Status:** 🔍 ANÁLISE COMPLETA - Aguardando diagnóstico real

