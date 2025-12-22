# 🔍 Debug AssistBuild - Passo a Passo

**Data:** 2025-11-17  
**Problema:** AssistBuild fica preso em "Initializing..."

---

## 🎯 PROBLEMA IDENTIFICADO

O frontend mostra "Initializing..." quando `!conversationId` e a query não completa.

**Causas Possíveis:**
1. ✅ **Permissões** - User tem role correta (confirmado)
2. ⚠️ **isSandbox = false** - User não está em modo sandbox
3. ⚠️ **Formato de resposta** - API retorna `{ conversations: [...] }` mas frontend espera array
4. ⚠️ **Query nunca completa** - Erro silencioso ou timeout

---

## 🔧 CORREÇÕES APLICADAS

### **1. Formato de Resposta**
A API retorna `{ conversations: [...], total: X }` mas o frontend pode esperar array direto.

**Correção:**
```typescript
queryFn: async () => {
  const result = await assistbuildConversationApi.fetchConversations();
  // API returns { conversations: [...], total: X } or just array
  return Array.isArray(result) ? result : (result.conversations || []);
}
```

### **2. Logging no Backend**
Adicionado logging em:
- `requireConfigurator` - Mostra motivo do bloqueio
- Rota `/conversations` - Mostra quantas conversas encontrou

---

## 📋 CHECKLIST DE DEBUG

### **Passo 1: Verificar Console do Browser**

1. Abrir DevTools (F12)
2. Ir ao tab "Console"
3. Procurar por:
   - `[Studio] Debug state:` - Mostra estado completo
   - Erros de fetch
   - Erros de permissões

**O que procurar:**
```javascript
[Studio] Debug state: {
  isLoading: false,
  hasUser: true,
  hasActiveTenant: true,
  environment: "sandbox",  // ← DEVE SER "sandbox"
  isSandbox: true,          // ← DEVE SER true
  loadingConversations: false,  // ← Se true, query não completou
  conversationsError: undefined  // ← Se tiver erro, mostra aqui
}
```

### **Passo 2: Verificar Network Tab**

1. Abrir DevTools (F12)
2. Ir ao tab "Network"
3. Recarregar página
4. Procurar por request: `/api/assistbuild/conversations`

**O que verificar:**
- **Status Code:**
  - `200` = ✅ Sucesso
  - `403` = ❌ Permissões (mas user tem role, então não deve ser)
  - `401` = ❌ Não autenticado
  - `500` = ❌ Erro no servidor

- **Response:**
  ```json
  {
    "conversations": [...],
    "total": 0
  }
  ```

### **Passo 3: Verificar Logs do Servidor**

Ao aceder a `/studio`, procurar nos logs:

```
[requireConfigurator] Checking access for user USER_ID, tenant TENANT_ID
[requireConfigurator] User USER_ID has role: owner in tenant TENANT_ID
[requireConfigurator] ✅ Access granted for user USER_ID with role owner
[AssistBuild] GET /conversations - tenant: TENANT_ID, environment: sandbox
[AssistBuild] Found 0 conversations for tenant TENANT_ID
```

**Se bloquear:**
```
[requireConfigurator] ❌ Insufficient permissions: user has role 'ROLE', required: 'owner' or 'config'
```

### **Passo 4: Verificar isSandbox**

O problema mais provável é que `isSandbox = false`.

**Verificar:**
1. Console do browser: `[Studio] Debug state: { isSandbox: ... }`
2. Se `isSandbox = false`:
   - User não está em modo sandbox
   - Precisa mudar ambiente para sandbox nas configurações

**Como mudar:**
- Ir a `/settings`
- Mudar ambiente para "Sandbox"
- Voltar a `/studio`

---

## 🎯 SOLUÇÕES POR PROBLEMA

### **Problema 1: isSandbox = false**

**Sintoma:** Query nunca corre (`enabled: isSandbox` bloqueia)

**Solução:**
```sql
-- Verificar environment do user
SELECT active_environment FROM user_tenants 
WHERE user_id = 'USER_ID' AND tenant_id = 'TENANT_ID';

-- Mudar para sandbox
UPDATE user_tenants 
SET active_environment = 'sandbox' 
WHERE user_id = 'USER_ID' AND tenant_id = 'TENANT_ID';
```

### **Problema 2: Query Retorna Erro**

**Sintoma:** `conversationsError` tem mensagem

**Solução:**
- Verificar mensagem de erro no console
- Verificar logs do servidor
- Verificar Network tab para status code

### **Problema 3: Formato de Resposta**

**Sintoma:** Query completa mas `conversations` está vazio

**Solução:**
- Já corrigido - frontend agora trata `{ conversations: [...] }` e array direto

---

## 🧪 TESTE RÁPIDO

**No Console do Browser:**
```javascript
// Verificar estado
console.log('isSandbox:', document.querySelector('[data-sandbox]')?.dataset.sandbox);

// Testar API diretamente
fetch('/api/assistbuild/conversations', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
```

---

## 📝 PRÓXIMOS PASSOS

1. **Reiniciar servidor** (para aplicar logging)
2. **Abrir `/studio`**
3. **Abrir console do browser** (F12)
4. **Verificar `[Studio] Debug state:`**
5. **Verificar Network tab** para request `/api/assistbuild/conversations`
6. **Verificar logs do servidor**

**Com essas informações, conseguimos identificar exatamente o problema!**

---

**Última atualização:** 2025-11-17  
**Status:** ✅ DEBUG APLICADO - Aguardando informações do console/logs

