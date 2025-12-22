# 🔍 Debug AssistBuild "Initializing..." Preso

**Data:** 2025-11-17  
**Problema:** AssistBuild fica preso em "Initializing..." e não sai do sítio

---

## 🎯 PROBLEMA IDENTIFICADO

O frontend mostra "Initializing..." quando:
1. `!conversationId` (linha 644 de `studio.tsx`)
2. A query `fetchConversations()` não completa
3. Se a query falhar (403, 401, etc.), nunca completa
4. `loadingConversations` fica `true` para sempre
5. `conversationId` nunca é definido
6. Fica preso em "Initializing..."

---

## 🔴 CAUSA MAIS PROVÁVEL

**Middleware `requireConfigurator` bloqueia acesso:**

A rota `/api/assistbuild/conversations` passa por:
1. `requireAuth` - Verifica autenticação
2. `hardTenantGuard` - Verifica tenant
3. `requireConfigurator` - **BLOQUEIA se não for owner/config**

Se `requireConfigurator` retornar 403 ou 401:
- Query nunca completa
- Frontend fica preso
- Não há feedback ao utilizador

---

## ✅ CORREÇÕES APLICADAS

### **1. Logging no Middleware**
Adicionado logging detalhado em `require-configurator.ts`:
- Log quando verifica acesso
- Log quando bloqueia (com motivo)
- Log quando permite acesso

### **2. Error Handling no Frontend**
Melhorado `studio.tsx`:
- Captura erros da query
- Mostra toast se for 403 (permissões)
- Não retry infinito (`retry: false`)
- Trata resposta vazia

### **3. Error Handling na API**
Melhorado `conversations.ts`:
- Retorna erro detalhado
- Inclui status code
- Inclui mensagem de erro

### **4. Logging na Rota**
Adicionado logging em `assistbuild-conversations.ts`:
- Log quando recebe request
- Log quantas conversas encontrou

---

## 🧪 COMO TESTAR

### **1. Verificar Logs do Servidor**

Ao aceder a `/studio`, procurar nos logs:

```
[requireConfigurator] Checking access for user USER_ID, tenant TENANT_ID
[requireConfigurator] User USER_ID has role: ROLE in tenant TENANT_ID
```

**Se bloquear:**
```
[requireConfigurator] ❌ Insufficient permissions: user has role 'ROLE', required: 'owner' or 'config'
```

**Se permitir:**
```
[requireConfigurator] ✅ Access granted for user USER_ID with role ROLE
[AssistBuild] GET /conversations - tenant: TENANT_ID, environment: sandbox
[AssistBuild] Found X conversations for tenant TENANT_ID
```

### **2. Verificar Console do Browser**

Abrir DevTools → Console e procurar:
- Erros de fetch
- Erros de permissões
- Mensagens de toast

### **3. Verificar Network Tab**

Abrir DevTools → Network e procurar:
- Request para `/api/assistbuild/conversations`
- Status code (200, 403, 401, 500?)
- Response body

---

## 🔧 SOLUÇÕES POR PROBLEMA

### **Problema 1: 403 - Insufficient Permissions**

**Causa:** User não tem role `owner` ou `config`

**Solução:**
```sql
-- Verificar role atual
SELECT role FROM user_tenants WHERE user_id = 'USER_ID' AND tenant_id = 'TENANT_ID';

-- Atualizar para owner (se necessário)
UPDATE user_tenants 
SET role = 'owner' 
WHERE user_id = 'USER_ID' AND tenant_id = 'TENANT_ID';
```

### **Problema 2: 401 - Authentication Required**

**Causa:** User não está autenticado ou session expirou

**Solução:**
- Fazer logout e login novamente
- Verificar se cookies estão a ser enviados

### **Problema 3: 400 - No Active Organization**

**Causa:** `tenantId` não está definido

**Solução:**
- Verificar se user tem tenant ativo
- Verificar se `hardTenantGuard` está a funcionar

### **Problema 4: Query Nunca Completa (Timeout)**

**Causa:** Database lento ou query bloqueada

**Solução:**
- Verificar logs do database
- Verificar se há locks
- Adicionar timeout na query

---

## 📋 CHECKLIST DE DEBUG

- [ ] Verificar logs do servidor ao aceder `/studio`
- [ ] Verificar console do browser para erros
- [ ] Verificar Network tab para status code
- [ ] Verificar role do user no tenant
- [ ] Verificar se `tenantId` está definido
- [ ] Verificar se `userId` está definido
- [ ] Verificar se query completa (não timeout)

---

## 🎯 PRÓXIMOS PASSOS

1. **Reiniciar servidor** para aplicar mudanças
2. **Aceder a `/studio`** e verificar logs
3. **Verificar console do browser** para erros
4. **Se ainda preso**, verificar:
   - Role do user
   - Logs do servidor
   - Network tab

---

**Última atualização:** 2025-11-17  
**Status:** ✅ CORREÇÕES APLICADAS - Aguardando teste

