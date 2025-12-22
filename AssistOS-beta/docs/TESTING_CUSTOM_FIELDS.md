# 🧪 Teste de Custom Fields - Lead Generation

## 📋 Objetivo
Validar o flow completo de configuração dinâmica de campos customizados através do AssistBuild.

## 🔄 Flow Completo
```
AssistBuild (Studio) → configure_lead_generation_fields → Database → Frontend (Auto-reload)
```

## ✅ Passo-a-passo de Teste

### 1️⃣ Aceder ao Studio (AssistBuild)
1. Login no AssistOS
2. Clicar em "**Studio**" (menu lateral ou "My Account" → "Studio (configuration)")
3. Abrir uma conversa nova

### 2️⃣ Configurar Campo Customizado
Enviar ao AssistBuild:
```
Adiciona um campo customizado ao formulário de captura de leads:
- Nome do campo: "orcamento_mensal"
- Label: "Orçamento Mensal Disponível"
- Tipo: select
- Opções: "Menos de 5.000€, Entre 5.000€ e 15.000€, Entre 15.000€ e 50.000€, Mais de 50.000€"
- Obrigatório: sim
- Ordem de exibição: 10
```

### 3️⃣ Validar Resposta do AssistBuild
✅ **Esperado:**
```
✅ Campo "Orçamento Mensal Disponível" criado! Agora aparece automaticamente no formulário de captura de leads.
```

### 4️⃣ Verificar na Base de Dados
```sql
SELECT * FROM module_custom_fields 
WHERE name = 'orcamento_mensal';
```

✅ **Esperado:**
- 1 registo criado
- `moduleId` = "lead-generation"
- `type` = "select"
- `options` = ["Menos de 5.000€", "Entre 5.000€ e 15.000€", ...]

### 5️⃣ Verificar no Frontend
1. Ir para "**Lead Generation**" → "**Leads**"
2. Clicar em "**Capturar Lead**"
3. Scroll até ao fim do formulário

✅ **Esperado:**
- Secção "**Campos Personalizados**" visível
- Campo "**Orçamento Mensal Disponível**" com dropdown
- 4 opções disponíveis para seleção
- Indicador de obrigatório (\*)

### 6️⃣ Testar Segundo Campo (Diferente Tipo)
```
Adiciona outro campo customizado:
- Nome: "data_evento"
- Label: "Data do Evento"
- Tipo: date
- Obrigatório: não
```

✅ **Esperado:**
- Novo campo tipo `date` aparece no formulário
- Campo não tem indicador de obrigatório

---

## 🔍 Pontos de Validação

### Backend ✅
- [x] Endpoint GET `/api/angariacao/fields` criado
- [x] Endpoint POST `/api/angariacao/fields` criado
- [x] Permissão `angariacao.configure` validada
- [x] Tool `configure_lead_generation_fields` persiste na DB

### Frontend ✅
- [x] Query carrega custom fields automaticamente
- [x] Renderização dinâmica por tipo (text, number, date, select, textarea)
- [x] Indicador de campos obrigatórios (\*)
- [x] Secção "Campos Personalizados" com separador visual
- [x] Grid responsivo (2 colunas / 1 coluna em mobile)

### Database ✅
- [x] Tabela `module_custom_fields` já existe
- [x] FK para `modules.id` (cascade delete)
- [x] Campo `options` (jsonb) para selects

---

## 🐛 Troubleshooting

### Erro: "Module not found"
**Causa:** Módulo "lead-generation" não existe na tabela `modules`
**Fix:**
```sql
INSERT INTO modules (id, name, description, is_active) 
VALUES ('lead-generation', 'Lead Generation', 'Automated lead capture', true);
```

### Campo não aparece no frontend
**Causa:** Cache do React Query
**Fix:** Hard refresh (Ctrl+Shift+R) ou clear cache

### Permissão negada ao criar campo
**Causa:** User não tem permissão `angariacao.configure`
**Fix:** Garantir que owner/configurator têm a permissão registada

---

## 📊 Resultado Esperado Final

**AssistBuild:**
- Tool executa sem erros
- Mensagem de sucesso clara

**Database:**
- Registo criado em `module_custom_fields`
- Relação com módulo correto

**Frontend:**
- Campos aparecem dinamicamente no formulário
- Tipos renderizados corretamente
- UX consistente com campos base
