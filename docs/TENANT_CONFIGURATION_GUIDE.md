# 🎯 Guia de Configuração Dinâmica de Tenants - AssistOS

## 📋 Visão Geral

O AssistOS implementa um sistema de **configuração conversacional** através do **AssistBuild** (Studio) que permite aos owners/configurators customizarem dinamicamente os módulos sem código.

Este guia documenta a arquitetura, flow e optimizações do sistema de custom fields para Lead Generation.

---

## 🏗️ Arquitetura do Sistema

### 1. Componentes Principais

```
┌─────────────────────────────────────────────────────────────┐
│                    CONFIGURATION STUDIO                      │
│                      (AssistBuild)                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ 1. User conversa com AI
                     │ 2. AI executa tool configure_lead_generation_fields
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND - AssistBuild Tool                      │
│     packages/modules/angariacao/tools/index.ts               │
│                                                              │
│  • Valida tenant/environment context                        │
│  • Verifica módulo Angariação ativo                         │
│  • Insere/atualiza campo em module_custom_fields            │
│  • Retorna confirmação estruturada                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ 3. Registo persistido na DB
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  DATABASE (PostgreSQL)                       │
│              Tabela: module_custom_fields                    │
│                                                              │
│  • moduleId (FK → modules.id)                               │
│  • name (identificador técnico)                             │
│  • label (label de exibição)                                │
│  • type (text/number/date/select/textarea)                  │
│  • required (boolean)                                        │
│  • options (jsonb - para selects)                           │
│  • order (ordem de exibição)                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ 4. Frontend carrega campos via API
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              FRONTEND - React Query                          │
│     client/src/components/angariacao/CaptureLeadDialog.tsx   │
│                                                              │
│  • GET /api/angariacao/fields (tenant-scoped)               │
│  • Renderiza campos dinamicamente                           │
│  • Integra no react-hook-form                               │
│  • Submete customFields no payload                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Flow de Configuração (End-to-End)

### Passo 1: User no Studio

```
User: "Adiciona um campo customizado ao formulário de leads:
       - Nome: orcamento_mensal
       - Label: Orçamento Mensal Disponível
       - Tipo: select
       - Opções: Menos de 5.000€, Entre 5.000€ e 15.000€, Mais de 50.000€
       - Obrigatório: sim"
```

### Passo 2: AI Executa Tool

```typescript
// AssistBuild chama:
configure_lead_generation_fields({
  fieldName: "orcamento_mensal",
  fieldLabel: "Orçamento Mensal Disponível",
  fieldType: "select",
  isRequired: true,
  options: "Menos de 5.000€, Entre 5.000€ e 15.000€, Mais de 50.000€",
  displayOrder: 10
}, context);
```

### Passo 3: Tool Persiste na DB

```sql
INSERT INTO module_custom_fields (
  module_id, 
  name, 
  label, 
  type, 
  required, 
  options, 
  "order"
) VALUES (
  '<tenant_module_id>',
  'orcamento_mensal',
  'Orçamento Mensal Disponível',
  'select',
  true,
  '["Menos de 5.000€", "Entre 5.000€ e 15.000€", "Mais de 50.000€"]'::jsonb,
  10
) ON CONFLICT (module_id, name) DO UPDATE SET ...;
```

### Passo 4: Frontend Auto-Load

```typescript
// React Query busca campos automaticamente
const { data: customFieldsData } = useQuery({
  queryKey: ['/api/angariacao/fields'],
});

// Campos aparecem no formulário
{customFields.map(field => (
  <FormField
    control={form.control}
    name={`customFields.${field.name}`}
    render={({ field }) => (
      // Renderização dinâmica por tipo
    )}
  />
))}
```

### Passo 5: User Submete Lead

```json
{
  "email": "exemplo@empresa.pt",
  "firstName": "João",
  "customFields": {
    "orcamento_mensal": "Mais de 50.000€"
  }
}
```

---

## 🔒 Segurança & Isolamento de Tenants

### 1. Tenant Scoping (Crítico!)

**Problema Original:**
```typescript
// ❌ ERRADO - Data leakage!
const fields = await db
  .select()
  .from(moduleCustomFields)
  .where(eq(moduleCustomFields.moduleId, 'lead-generation'));
```

**Solução Implementada:**
```typescript
// ✅ CORRETO - Tenant isolated
const [tenantModule] = await db
  .select()
  .from(modules)
  .where(and(
    eq(modules.id, 'angariacao'),
    eq(modules.tenantId, tenantId),
    eq(modules.environment, environment)
  ))
  .limit(1);

const fields = await db
  .select()
  .from(moduleCustomFields)
  .where(eq(moduleCustomFields.moduleId, tenantModule.id));
```

### 2. Permission Checks

```typescript
// Backend API
router.post("/fields", 
  requirePermission('angariacao.configure'), // ✅ Protegido
  async (req, res) => { ... }
);

// AssistBuild Tool
// Permissões já verificadas via AssistBuild context
// Tool só executa para owners/configurators
```

### 3. Validation Layers

```typescript
// Layer 1: Schema Validation
const validTypes = ['text', 'number', 'date', 'select', 'textarea'];
if (!validTypes.includes(fieldType)) {
  return { error: 'Invalid field type' };
}

// Layer 2: Business Logic
if (fieldType === 'select' && !options) {
  return { error: 'Select fields require options' };
}

// Layer 3: Module Existence
if (!tenantModule) {
  return { error: 'Angariação module not active for this tenant' };
}
```

---

## ⚡ Otimizações & Performance

### 1. Idempotency (Upsert Pattern)

```typescript
// Check if field exists
const [existing] = await db
  .select()
  .from(moduleCustomFields)
  .where(and(
    eq(moduleCustomFields.moduleId, tenantModule.id),
    eq(moduleCustomFields.name, fieldName)
  ))
  .limit(1);

if (existing) {
  // UPDATE existing field
  await db.update(moduleCustomFields).set({ ... });
} else {
  // INSERT new field
  await db.insert(moduleCustomFields).values({ ... });
}
```

**Benefício:** User pode repetir comando sem criar duplicados.

### 2. React Query Cache Invalidation

```typescript
// Quando custom fields mudam, invalidar cache
queryClient.invalidateQueries(['/api/angariacao/fields']);

// Frontend recarrega automaticamente via React Query
```

### 3. Dynamic Schema Generation

```typescript
// Base schema + dynamic fields
const baseCaptureLeadSchema = z.object({
  email: z.string().email(),
  customFields: z.record(z.any()).optional(),
});

// Campos customizados integram-se no payload automaticamente
form.register(`customFields.${field.name}`);
```

---

## 📊 Tipos de Campos Suportados

| Tipo | Renderização | Validação | Exemplo |
|------|-------------|-----------|---------|
| `text` | `<Input type="text" />` | String | Nome da empresa |
| `number` | `<Input type="number" />` | Number | Número de funcionários |
| `date` | `<Input type="date" />` | Date | Data de fundação |
| `select` | `<Select>` com options | Enum | Setor de atividade |
| `textarea` | `<Textarea rows={3} />` | String (multiline) | Observações |

---

## 🧪 Testes & Validação

### Teste Manual (Passo-a-passo)

```bash
# 1. Login no AssistOS como owner/configurator
# 2. Ir para Studio → Nova conversa

# 3. Enviar prompt:
"Adiciona um campo customizado ao formulário de captura de leads:
- Nome do campo: setor_atividade
- Label: Setor de Atividade
- Tipo: select
- Opções: Tecnologia, Saúde, Educação, Retalho, Serviços
- Obrigatório: não
- Ordem de exibição: 5"

# 4. Verificar resposta do AI (sucesso)
# 5. Ir para Leads → Capturar Lead
# 6. Confirmar que campo "Setor de Atividade" aparece no formulário
# 7. Submeter lead e verificar que customFields estão no payload
```

### Validação na Base de Dados

```sql
-- Ver todos os custom fields do tenant
SELECT 
  mcf.name,
  mcf.label,
  mcf.type,
  mcf.required,
  mcf.options,
  mcf."order"
FROM module_custom_fields mcf
INNER JOIN modules m ON m.id = mcf.module_id
WHERE m.tenant_id = '<tenant_id>' 
  AND m.environment = 'development'
  AND m.id = 'angariacao';
```

---

## 🔮 Próximas Expansões

### 1. Guardar Custom Fields nos Leads

```typescript
// Atualizar schema de leads para incluir JSONB
leads: pgTable('leads', {
  // ... campos base
  customFieldsData: jsonb('custom_fields_data'),
});

// No POST /api/angariacao/leads
await db.insert(leads).values({
  email: data.email,
  customFieldsData: data.customFields, // ✅ Persistido
});
```

### 2. Display Custom Fields nas Tabelas

```typescript
// LeadsTable.tsx
{customFields.map(field => (
  <TableCell key={field.id}>
    {lead.customFieldsData?.[field.name] || '-'}
  </TableCell>
))}
```

### 3. Filtros Dinâmicos por Custom Fields

```typescript
// Permitir filtrar leads por campos customizados
GET /api/angariacao/leads?customFields.setor_atividade=Tecnologia
```

### 4. Validação Condicional

```typescript
// Campos obrigatórios apenas se outro campo tiver valor X
{
  "fieldName": "num_funcionarios",
  "requiredIf": {
    "field": "empresa_tipo",
    "value": "PME"
  }
}
```

---

## 📝 Lições Aprendidas

### 1. Tenant Isolation é Crítico
**Problema:** API original retornava campos de TODOS os tenants.  
**Fix:** Sempre adicionar `tenantId` e `environment` nos queries.

### 2. Idempotency Evita Duplicados
**Problema:** Re-executar tool criava campos duplicados.  
**Fix:** Check `UNIQUE(module_id, name)` antes de insert.

### 3. Frontend Deve Integrar com Form Library
**Problema:** Campos renderizados mas não submetidos.  
**Fix:** Usar `FormField` + `control={form.control}` do react-hook-form.

### 4. AssistBuild Tools = Direct DB Access
**Padrão:** Tools do AssistBuild NÃO fazem HTTP fetch.  
**Razão:** Evita overhead de HTTP + dupla autenticação.

---

## 🎓 Padrões Arquiteturais

### Pattern 1: Conversational Configuration

```
User Intent → AI Interpretation → Tool Execution → DB Persistence → UI Auto-Update
```

**Vantagem:** Zero código para configurar módulos.

### Pattern 2: Multi-Tenant Field Isolation

```
module_custom_fields (global table)
├─ moduleId (FK → modules.id)  ← Tenant-scoped module instance
├─ name (field identifier)
└─ [field properties]
```

**Vantagem:** 1 tabela serve TODOS os tenants, mas isolamento garantido via FK.

### Pattern 3: Dynamic Form Rendering

```
API Response → React Query Cache → Map over fields → FormField per field → Submit
```

**Vantagem:** Frontend não precisa deploy para adicionar campos.

---

## 🚀 Conclusão

O sistema de custom fields demonstra:

1. ✅ **Configuração Conversacional** (AssistBuild)
2. ✅ **Isolamento de Tenants** (DB scoping)
3. ✅ **Persistência Dinâmica** (module_custom_fields)
4. ✅ **Frontend Reativo** (React Query + dynamic rendering)
5. ✅ **Idempotency** (upsert pattern)
6. ✅ **Validação em Camadas** (schema + business + permission)

Este padrão pode ser **replicado** para outros módulos:
- CRM → Custom fields em contracts/opportunities
- Projects → Custom fields em tasks/deliverables
- HR → Custom fields em employees/performance reviews

**Próximo Passo:** Expandir para permitir campos calculados, validações condicionais, e automações baseadas em custom fields.
