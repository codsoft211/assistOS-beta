# 🚨 TESTE CRÍTICO - CACHE CONVERSION PATH

**PRIORITY:** ⚠️ **CRÍTICO** - Este é o **ÚNICO teste que falta** para validação completa!

**Data:** 18 de Novembro de 2025  
**Status:** ❌ **NÃO TESTADO** - Requer execução manual URGENTE

---

## ⚠️ **PROBLEMA IDENTIFICADO**

O user `tailor@assistos.ai` registou-se **DIRETAMENTE** sem fazer pre-registration onboarding chat.

**Resultado:**
- ✅ **Fallback funcionou** - company_info criada com nome do tenant
- ❌ **Cache conversion NÃO foi exercitada** - fluxo principal do onboarding não foi validado

**Gaps:**
1. ❌ Onboarding cache creation via chat NÃO testado
2. ❌ Cache → company_info conversion NÃO validado
3. ❌ Fields sector + business_type NÃO populados via cache

---

## 🎯 **OBJETIVO DESTE TESTE**

Validar o **FLUXO COMPLETO** do onboarding:

```
User → Pre-registration Chat → Onboarding Cache Created
                                       ↓
                              User submits registration
                                       ↓
                              Cache promoted to company_info
                                       ↓
                              company_info tem TODOS os campos
```

---

## 🧪 **INSTRUÇÕES PASSO-A-PASSO**

### **FASE 1: Limpar Estado Anterior**

**1.1 Abrir DevTools → Application → Local Storage**

Limpar TUDO:
```
localStorage.clear()
```

**1.2 Abrir DevTools → Application → Session Storage**

Limpar TUDO:
```
sessionStorage.clear()
```

**1.3 Fazer Logout**

Se estiveres logado, fazer logout completo.

---

### **FASE 2: Fazer Onboarding Chat (PRE-REGISTRATION)**

**2.1 Ir para a Home Page**

URL: `http://localhost:5000/` (ou URL da aplicação)

**2.2 Verificar que NÃO ESTÁS LOGADO**

- Não deve haver user info no header
- Deve haver opção de "Login" ou "Registar"

**2.3 Procurar "Onboarding Chat" ou "Chat de Boas-Vindas"**

Pode aparecer como:
- Banner de boas-vindas
- Chat flutuante
- Botão "Começar"
- Hero section com chat

**2.4 Iniciar Conversa com o AssistOS**

Responder às perguntas do onboarding:

**Exemplo de conversa:**
```
AssistOS: Olá! Bem-vindo ao AssistOS. Qual é o nome da sua empresa?
User: Tech Solutions Lda

AssistOS: Obrigado! Em que sector atua a Tech Solutions Lda?
User: Tecnologia e Consultoria

AssistOS: E que tipo de negócio é?
User: Consultoria em IT e desenvolvimento de software
```

**IMPORTANTE:** Anotar **EXATAMENTE** o que respondeste:
- **Company Name:** ___________________________
- **Sector:** ___________________________
- **Business Type:** ___________________________

---

### **FASE 3: Validar Cache Foi Criada**

⚠️ **NOTA:** Não existe endpoint público para verificar onboarding cache. A validação será feita **APÓS registo** via SQL queries que vais executar depois.

**3.1 Observar Comportamento do Chat**

Durante a conversa, o AssistStart (onboarding agent) DEVE:
- ✅ Confirmar que recebeu as informações
- ✅ Parecer "pronto" para registo (ex: "Perfeito! Queres criar conta agora?")
- ✅ Eventualmente mostrar formulário de registo inline

**3.2 Verificar Network Tab (Opcional - para debug)**

Se quiseres confirmar que dados foram guardados:
1. Abrir **DevTools → Network tab**
2. Procurar requests POST para `/api/onboarding/chat`
3. Verificar se responses incluem `tool_calls` com `save_onboarding_context`

Exemplo de tool_call esperado:
```json
{
  "tool_calls": [{
    "function": {
      "name": "save_onboarding_context",
      "arguments": "{\"companyName\":\"Tech Solutions Lda\",\"industry\":\"Tecnologia\"}"
    }
  }]
}
```

✅ **Se vires save_onboarding_context executado** → Dados foram guardados!  
⏳ **Se não vires** → Pode estar tudo bem, continua para registo e valida depois via SQL

---

### **FASE 4: Fazer Registo**

**4.1 Clicar em "Registar" ou "Sign Up"**

**4.2 Preencher Formulário de Registo:**

```
Email:     techsolutions@example.com
Password:  TechSolutions@2025
First Name: Tech
Last Name:  Admin
```

**IMPORTANTE:** Anotar credenciais:
- **Email:** ___________________________
- **Password:** ___________________________

**4.3 Submeter Registo**

Clicar em "Registar" ou "Create Account"

**4.4 Aguardar Redirect**

Deves ser redirecionado para a aplicação (dashboard ou home)

---

### **FASE 5: Validar Cache Foi Convertida (Via SQL)**

**5.1 Como Executar SQL Queries**

Para validar que a cache foi convertida, vais precisar de executar queries SQL. Há 2 opções:

**OPÇÃO A - Via Replit Agent (RECOMENDADO):**
1. Pedir ao Replit Agent para executar queries SQL
2. Exemplo: "Replit Agent, executa esta query: SELECT * FROM company_info WHERE name = 'Tech Solutions Lda';"

**OPÇÃO B - Via Replit Database UI:**
1. Abrir Replit sidebar → Database
2. Clicar em "Query"
3. Executar queries manualmente

**5.2 Confirmar Login Funcionou**

Fazer refresh da página `/` e verificar que estás autenticado:
- ✅ Nome de user aparece no header
- ✅ Não és redirecionado para login
- ✅ Tens acesso à aplicação

---

### **FASE 6: Validar Company Info no SQL**

**6.1 Executar Query SQL:**

```sql
SELECT 
    id,
    name,
    brand_name,
    sector,
    business_type,
    business_description,
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
FROM company_info
WHERE name = 'Tech Solutions Lda';
```

**Resultado ESPERADO:**
```
name:               Tech Solutions Lda
brand_name:         Tech Solutions Lda
sector:             Tecnologia e Consultoria        ← ✅ DEVE ter valor!
business_type:      Consultoria em IT e desenvolvimento de software  ← ✅ DEVE ter valor!
business_description: NULL (ou valor se foi fornecido)
created_at:         2025-11-18 11:XX:XX
```

**CRÍTICO:**
- ✅ `sector` DEVE ter o valor que forneceste no chat
- ✅ `business_type` DEVE ter o valor que forneceste no chat
- ❌ Se ambos forem NULL → **FALHA! Cache conversion não funcionou!**

---

### **FASE 7: Validar Warehouse Foi Criado**

**7.1 Executar Query SQL:**

```sql
SELECT 
    id,
    code,
    name,
    type,
    is_default,
    is_active,
    available_for_projects,
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
FROM warehouses
WHERE tenant_id IN (
    SELECT tenant_id 
    FROM users 
    WHERE email = 'techsolutions@example.com'
);
```

**Resultado ESPERADO:**
```
code:                    ARM-XXXXXX (timestamp-based)
name:                    Armazém Principal
type:                    central
is_default:              true
is_active:               true
available_for_projects:  true
created_at:              2025-11-18 11:XX:XX
```

---

### **FASE 8: Validar Onboarding Cache Foi Limpa**

**8.1 Executar Query SQL:**

```sql
SELECT 
    id,
    session_id,
    user_id,
    company_name,
    sector,
    business_type,
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
FROM onboarding_cache
WHERE company_name = 'Tech Solutions Lda';
```

**Resultado ESPERADO:**

**Opção A - Cache ainda existe:**
```
user_id:         <UUID do novo user>  ← ✅ Deve ter sido atualizado com user_id!
session_id:      <session original>
company_name:    Tech Solutions Lda
sector:          Tecnologia e Consultoria
business_type:   Consultoria em IT...
```

**Opção B - Cache foi deletada:**
```
(0 rows)
```

Ambas as opções são válidas, dependendo da implementação.

---

## 📊 **CHECKLIST DE VALIDAÇÃO**

### **PRÉ-REGISTO:**
- [ ] Onboarding chat funcionou
- [ ] Forneci company name, sector, business type
- [ ] Cache foi criada (validado via DevTools ou SQL)

### **REGISTO:**
- [ ] Registo completou com sucesso
- [ ] Fui redirecionado para a aplicação
- [ ] Welcome banner apareceu (owner + <24h)

### **PÓS-REGISTO:**
- [ ] Company info criada com **sector** preenchido
- [ ] Company info criada com **business_type** preenchido
- [ ] Warehouse ARM-XXXXXX criado automaticamente
- [ ] User tem role `owner`
- [ ] User tem `createdAt` recente (<24h)

---

## ✅ **CRITÉRIOS DE SUCESSO**

O teste é **SUCESSO** se:

1. ✅ Onboarding cache foi criada durante chat
2. ✅ Company info foi criada APÓS registo
3. ✅ Company info tem `sector` = valor do chat
4. ✅ Company info tem `business_type` = valor do chat
5. ✅ Warehouse foi criado automaticamente
6. ✅ User é owner e criado há <24h
7. ✅ Welcome banner apareceu

---

## ❌ **CRITÉRIOS DE FALHA**

O teste **FALHA** se:

1. ❌ Onboarding cache NÃO foi criada
2. ❌ Company info tem `sector` = NULL
3. ❌ Company info tem `business_type` = NULL
4. ❌ Warehouse NÃO foi criado
5. ❌ Erro durante registo
6. ❌ Welcome banner NÃO apareceu

---

## 🐛 **TROUBLESHOOTING**

### **Problema: Cache não foi criada**

**Possíveis causas:**
1. Endpoint `/api/onboarding/cache` não existe
2. Session ID não foi gerado
3. Frontend não está a enviar requests corretos

**Debug:**
- Verificar Network tab durante chat
- Procurar POST requests para `/api/onboarding/*`
- Verificar console por erros JavaScript

---

### **Problema: Company info tem sector/business_type NULL**

**Possíveis causas:**
1. Cache conversion code tem bug
2. Dual lookup (sessionID) falhou
3. Fallback activou em vez de cache conversion

**Debug:**
- Verificar logs do servidor durante registo
- Procurar por:
  ```
  [Onboarding] Converting cache to company_info
  [Onboarding] Using fallback - no cache found
  ```

---

### **Problema: Warehouse não foi criado**

**Possíveis causas:**
1. Schema ainda tem problema (improvável - já foi corrigido)
2. Error handling silenciou erro
3. Tenant não foi criado corretamente

**Debug:**
- Verificar logs do servidor:
  ```
  [Warehouse] Creating default warehouse for tenant
  [Warehouse] Error creating warehouse
  ```

---

## 📝 **FORMATO DE REPORTE**

Quando completares o teste, reportar:

```markdown
## RESULTADO DO TESTE - CACHE CONVERSION PATH

**User Criado:**
- Email: techsolutions@example.com
- ID: <UUID>
- Created At: <timestamp>

**Onboarding Chat:**
- Company Name: Tech Solutions Lda
- Sector: Tecnologia e Consultoria
- Business Type: Consultoria em IT...

**Onboarding Cache:**
- ✅/❌ Cache criada durante chat
- ✅/❌ Cache tinha todos os campos

**Company Info:**
- ✅/❌ Criada após registo
- ✅/❌ sector = "Tecnologia e Consultoria"
- ✅/❌ business_type = "Consultoria em IT..."

**Warehouse:**
- ✅/❌ Criado automaticamente
- Code: ARM-XXXXXX

**Welcome Banner:**
- ✅/❌ Apareceu no primeiro login

**Status Final:** ✅ SUCESSO / ❌ FALHA
```

---

## 🎯 **PRÓXIMOS PASSOS**

**Se SUCESSO:**
1. ✅ Atualizar COMPREHENSIVE_ONBOARDING_TEST_REPORT.md
2. ✅ Marcar cache conversion path como VALIDADO
3. ✅ Documentar evidências SQL
4. ✅ Fechar todos os testes de onboarding

**Se FALHA:**
1. ❌ Reportar bug detalhadamente
2. ❌ Incluir logs do servidor
3. ❌ Incluir SQL queries executadas
4. ❌ Incluir screenshots de errors

---

**ESTE É O TESTE MAIS CRÍTICO! Sem ele, o onboarding NÃO está validado!**
