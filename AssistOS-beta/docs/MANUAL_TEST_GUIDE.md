# 🧪 GUIA DE TESTE MANUAL - ONBOARDING END-TO-END

**Data:** 18 de Novembro de 2025  
**Tenant de Teste:** Tailor Meal Catering  
**User:** tailor@assistos.ai  
**Password:** TailorMeal@2025  

---

## ✅ **VALIDAÇÕES JÁ COMPLETADAS (SQL)**

| # | Componente | Status | Detalhes |
|---|------------|--------|----------|
| 1️⃣ | **User criado** | ✅ **PASS** | ID: `454d1715-b767-4728-8dcf-7d30b72dbb4b`, role: `owner`, criado há 1.47h |
| 2️⃣ | **Warehouse automático** | ✅ **PASS** | ARM-114895, type: `central`, is_default: `true`, is_active: `true` |
| 3️⃣ | **Company info** | ✅ **PASS** | Name: "Tailor Meal Catering" via fallback (sem pre-registration chat) |
| 4️⃣ | **Código WelcomeBanner** | ✅ **PASS** | Linha 51-56: verifica `isOwner` && `isNewUser` (<24h) |
| 5️⃣ | **Endpoint /api/auth/me** | ✅ **PASS** | Linha 384: retorna `user.createdAt` explicitamente |

---

## 🧪 **TESTES MANUAIS REQUERIDOS**

### **TESTE 1: Login e Welcome Banner**

#### **Passos:**

1. **Abrir browser** e ir para a aplicação AssistOS
2. **Fazer login** com:
   - 📧 Email: `tailor@assistos.ai`
   - 🔑 Password: `TailorMeal@2025`

#### **Validações:**

✅ **Welcome Banner DEVE aparecer** automaticamente no topo da página com:
- Ícone **Sparkles** (⚡)
- Título: **"Bem-vindo ao AssistOS!"**
- Texto explicativo em **Português**
- 2 botões:
  - **"Ir para Studio"** (primário, com ícone Sparkles)
  - **"Mais tarde"** (outline)

#### **Screenshot esperado:**
```
┌──────────────────────────────────────────────────────────────┐
│ ⚡ Bem-vindo ao AssistOS!                              [X]  │
│                                                              │
│ Para começar a usar o sistema, precisa de configurar a sua  │
│ empresa no Studio.                                           │
│                                                              │
│ No Studio, o AssistBuild vai ajudá-lo conversacionalmente   │
│ a configurar módulos, criar automações e personalizar o     │
│ sistema para as necessidades da sua empresa.                │
│                                                              │
│ [⚡ Ir para Studio]  [Mais tarde]                           │
└──────────────────────────────────────────────────────────────┘
```

#### **Verificação DevTools:**

- Abrir **DevTools → Console**
- Verificar **NÃO existem** erros relacionados com:
  - `/api/auth/me` (deve retornar HTTP 200)
  - `createdAt` field missing
  - WelcomeBanner rendering errors

---

### **TESTE 2: Navegação para Studio**

#### **Passos:**

1. Clicar no botão **"Ir para Studio"**

#### **Validações:**

✅ **DEVE:**
- Redirecionar para `/studio`
- Banner **NÃO deve aparecer** novamente
- LocalStorage deve ter:
  ```
  Key: welcomeBannerDismissed_454d1715-b767-4728-8dcf-7d30b72dbb4b
  Value: "true"
  ```

#### **Verificação LocalStorage:**
- Abrir **DevTools → Application → Local Storage**
- Procurar chave: `welcomeBannerDismissed_454d1715-b767-4728-8dcf-7d30b72dbb4b`
- Verificar valor: `"true"`

---

### **TESTE 3: Banner Dismiss Persistente**

#### **Passos:**

1. **Fazer logout**
2. **Fazer login** novamente com `tailor@assistos.ai`

#### **Validações:**

✅ **Banner NÃO deve aparecer** (dismissed persiste em localStorage)

---

### **TESTE 4: Criar Conversa no AssistBuild**

#### **Passos:**

1. Garantir que estás na página `/studio`
2. Verificar se existe **botão "Nova Conversa"** ou similar
3. Clicar para criar nova conversa AssistBuild

#### **Validações:**

✅ **DEVE:**
- Criar conversa com `agent_type = 'assistbuild'`
- Input de mensagem disponível
- Título vazio/genérico (ex: "Untitled Conversation")

---

### **TESTE 5: Enviar Mensagem ao AssistBuild**

#### **Passos:**

1. Na conversa criada, enviar mensagem:
   ```
   Olá! Podes ajudar-me a configurar o warehouse "Armazém Principal" que foi criado automaticamente?
   ```

#### **Validações:**

✅ **DEVE:**
- Mensagem aparecer no histórico
- **Streaming em tempo real** (chunks a aparecerem progressivamente)
- Resposta do AssistBuild mencionando ferramentas de configuração disponíveis
- **NÃO deve haver** erros de streaming no console

#### **Verificação Console:**
- **NÃO deve haver:**
  - `[SSE] Connection error`
  - `404 Not Found` em `/api/assistbuild/conversations/*`
  - Erros de streaming

---

### **TESTE 6: Configurar Warehouse via AssistBuild**

#### **Passos:**

1. Pedir ao AssistBuild:
   ```
   Configura o warehouse ARM-114895 para ter:
   - Descrição: "Armazém central para todas as operações"
   - Disponível para projetos: true
   ```

#### **Validações:**

✅ **DEVE:**
- AssistBuild executar tool `configure_warehouse` ou similar
- Mostrar confirmação de sucesso
- Dados persistidos no banco de dados

---

### **TESTE 7: Validar Dados Persistidos (SQL)**

#### **SQL Query a executar:**

```sql
SELECT 
    code,
    name,
    description,
    is_default,
    available_for_projects,
    TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at
FROM warehouses
WHERE code = 'ARM-114895'
  AND tenant_id = 'ef7ad9a9-250b-4dfc-922d-8dfffe530b2b';
```

#### **Resultado Esperado:**

```
code        | ARM-114895
name        | Armazém Principal
description | Armazém central para todas as operações
is_default  | t
available_for_projects | t
updated_at  | 2025-11-18 XX:XX:XX (hora recente)
```

---

## 📊 **CHECKLIST FINAL**

### **Componentes Automáticos (Validados via SQL):**
- ✅ User criado com `createdAt`
- ✅ Warehouse ARM-114895 criado automaticamente
- ✅ Company info criada via fallback
- ✅ Código WelcomeBanner correto
- ✅ Endpoint `/api/auth/me` retorna `createdAt`

### **Componentes Manuais (A validar visualmente):**
- ⏳ Welcome Banner aparece no login
- ⏳ Botão "Ir para Studio" redireciona corretamente
- ⏳ Banner dismiss persiste após logout/login
- ⏳ Conversa AssistBuild criada com sucesso
- ⏳ Streaming de mensagens funciona
- ⏳ AssistBuild consegue configurar warehouse
- ⏳ Dados persistidos no banco de dados

---

## 🐛 **TROUBLESHOOTING**

### **Welcome Banner NÃO aparece:**
1. Verificar `/api/auth/me` retorna HTTP 200
2. Verificar `user.createdAt` existe no response
3. Verificar `activeTenant.role === "owner"`
4. Verificar user foi criado há menos de 24h
5. Verificar localStorage NÃO tem `welcomeBannerDismissed_${userId}`

### **AssistBuild Streaming não funciona:**
1. Verificar console por erros `[SSE] Connection error`
2. Verificar routes corretas: `/api/assistbuild/conversations/*`
3. Verificar workflow "Start application" está a correr
4. Verificar logs do servidor não têm erros

### **Warehouse NÃO configurado:**
1. Verificar mensagens do AssistBuild por erros
2. Verificar SQL query retorna o warehouse
3. Verificar tenant_id correto
4. Verificar logs do servidor

---

## 📝 **NOTAS IMPORTANTES**

1. **User de teste é OWNER** - tem acesso a TODOS os recursos
2. **Tenant está em SANDBOX** - ambiente de teste isolado
3. **Warehouse criado AUTOMATICAMENTE** durante registo
4. **Company info via FALLBACK** - sem pre-registration chat
5. **Welcome Banner só aparece UMA VEZ** - depois é dismissed

---

## ✅ **CRITÉRIOS DE SUCESSO**

**O teste é considerado SUCESSO se:**
1. ✅ Welcome Banner aparece no primeiro login
2. ✅ "Ir para Studio" redireciona corretamente
3. ✅ AssistBuild cria conversa e responde com streaming
4. ✅ AssistBuild consegue configurar warehouse via tool
5. ✅ Dados persistem no banco de dados
6. ✅ NÃO há erros no console ou logs do servidor

---

**Bons testes! 🚀**
