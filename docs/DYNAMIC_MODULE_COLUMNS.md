# Sistema Universal de Colunas Dinâmicas para Módulos

## Visão Geral

Sistema completo que permite a todos os módulos (CRM, Projects, Lead Generation, etc.) **renderizarem dinamicamente as suas colunas** com base na configuração guardada no backend através do AssistBuild.

## Componentes do Sistema

### 1. Hooks Reutilizáveis

#### `useModuleConfig(moduleId)`
Busca a configuração completa do módulo do backend.

```typescript
import { useModuleConfig } from "@/hooks/use-module-config";

const { data: moduleConfig } = useModuleConfig('lead-generation');
// Retorna: { success, config, moduleId, isActive }
```

#### `useDynamicColumns(moduleConfig, fallbackColumns)`
Extrai e processa colunas dinâmicas da configuração.

```typescript
import { useDynamicColumns } from "@/hooks/use-dynamic-columns";

const columns = useDynamicColumns(moduleConfig, [
  { fieldKey: 'email', label: 'Email' },
  { fieldKey: 'name', label: 'Nome' },
]);
// Retorna: [{ fieldKey, label, type }]
```

### 2. Renderizador Universal

#### `renderModuleField(entity, fieldKey, fieldType, options)`
Renderiza qualquer campo com formatação adequada (badges, datas, moedas, links, etc.).

**Type-based rendering** - Prioriza o tipo configurado sobre heurísticas de nome:

```typescript
import { renderModuleField } from "@/lib/module-field-renderer";

{columns.map((col) => (
  <TableCell key={col.fieldKey}>
    {renderModuleField(lead, col.fieldKey, col.type, {
      detailPath: '/angariacao/leads',
    })}
  </TableCell>
))}
```

## Estrutura de Dados no Backend

### Configuração do Módulo (`tenant_modules.config`)

```json
{
  "ui": {
    "list": {
      "columns": ["numeroProposta", "nome", "estado", "data"],
      "pageSize": 25,
      "defaultSort": {
        "field": "data",
        "order": "desc"
      }
    },
    "form": {
      "layout": [
        {
          "section": "Identificação",
          "fields": ["numeroProposta:readonly", "nome:required"]
        }
      ]
    }
  },
  "leadFields": [
    {
      "key": "numeroProposta",
      "label": "Nº Proposta",
      "type": "auto_number"
    },
    {
      "key": "nome",
      "label": "Nome",
      "type": "text",
      "required": true
    }
  ]
}
```

## Como Usar num Módulo

### Exemplo Completo (Leads Page)

```typescript
import { useModuleConfig } from "@/hooks/use-module-config";
import { useDynamicColumns } from "@/hooks/use-dynamic-columns";
import { renderModuleField } from "@/lib/module-field-renderer";
import { Skeleton } from "@/components/ui/skeleton";

export default function LeadsPage() {
  const { data: leadsData } = useQuery({ queryKey: ['/api/angariacao/leads'] });
  
  // 1. Buscar configuração do módulo (com error handling)
  const { data: moduleConfig, isLoading, isError } = useModuleConfig('lead-generation');
  
  // 2. Extrair colunas dinâmicas (com fallback)
  const columns = useDynamicColumns(moduleConfig, [
    { fieldKey: 'email', label: 'Email', type: 'email' },
    { fieldKey: 'name', label: 'Nome', type: 'text' },
    { fieldKey: 'status', label: 'Status', type: 'status' },
  ]);
  
  // 3. Show loading state
  if (isLoading) {
    return <Skeleton className="h-96" />;
  }
  
  // 4. Renderizar tabela
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col.fieldKey}>{col.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {leadsData?.leads?.map((lead) => (
          <TableRow key={lead.id}>
            {columns.map((col) => (
              <TableCell key={col.fieldKey}>
                {renderModuleField(lead, col.fieldKey, col.type, {
                  detailPath: '/angariacao/leads',
                })}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

## Mapeamentos de Campos Suportados

O sistema inclui mapeamentos padrão para todos os módulos:

```typescript
// Lead Generation
'numeroProposta' → 'proposalNumber'
'nome' → 'name'
'estado' → 'status'
'budgetTotal' → 'totalBudget'

// CRM / Contacts
'nomeCompleto' → 'fullName'
'empresa' → 'company'
'cargo' → 'position'

// Projects
'nomeProjeto' → 'projectName'
'cliente' → 'client'
'valorContrato' → 'contractValue'
```

## Tipos de Campos Suportados

### Type-Based Rendering (Priority 1)

O renderizador usa **tipos explícitos** da configuração primeiro:

- ✅ **currency** → €XX.XX
- ✅ **date / datetime** → Formato PT (DD/MM/AAAA)
- ✅ **auto_number** → Fonte mono, negrito
- ✅ **status / select** → Badge colorido
- ✅ **multi_select / tags** → Múltiplos badges
- ✅ **boolean** → ✓ / ✗
- ✅ **email** → Link mailto
- ✅ **url / link** → Link externo
- ✅ **relation / reference** → Link interno
- ✅ **computed** → JSON se objeto
- ✅ **number / integer / decimal** → String

### Fallback: Heuristic Rendering (Priority 2)

Se não houver tipo configurado, usa heurísticas de nome de campo

## Configuração via AssistBuild

### Exemplo de Configuração de UI

```
Pergunta do utilizador:
"Configura a lista de leads para mostrar Nº Proposta, Nome, Estado, Data, Nº Pax e Budget Total"

AssistBuild executa:
configure_module_settings(
  moduleId: "lead-generation",
  settings: {
    ui: {
      list: {
        columns: ["numeroProposta", "nome", "estado", "data", "numeroPax", "budgetTotal"]
      }
    }
  },
  merge: true
)
```

## Adicionar Suporte a Novo Módulo

### 1. Adicionar mapeamentos de campos (se necessário)

Editar `client/src/lib/module-field-renderer.tsx`:

```typescript
const STANDARD_FIELD_MAPPINGS: Record<string, string> = {
  // ... existing mappings
  
  // Novo módulo
  'meuCampo': 'myField',
  'outroCampo': 'anotherField',
};
```

### 2. Usar hooks na página do módulo

```typescript
const { data: moduleConfig } = useModuleConfig('meu-modulo');
const columns = useDynamicColumns(moduleConfig, fallbackColumns);
```

### 3. Renderizar com renderModuleField

```typescript
{renderModuleField(entity, col.fieldKey, { 
  detailPath: '/meu-modulo/items' 
})}
```

## Endpoints API

### GET `/api/modules/:moduleId/config`

Retorna configuração completa do módulo incluindo UI settings.

**Response:**
```json
{
  "success": true,
  "config": { /* configuração completa */ },
  "moduleId": "lead-generation",
  "isActive": true
}
```

## Fluxo Completo

```
1. Utilizador configura via AssistBuild
   ↓
2. AssistBuild chama configure_module_settings
   ↓
3. Configuração guardada em tenant_modules.config (JSONB)
   ↓
4. Frontend chama useModuleConfig('module-id')
   ↓
5. useDynamicColumns extrai colunas
   ↓
6. renderModuleField renderiza cada célula
   ↓
7. Tabela dinâmica renderizada automaticamente
```

## Benefícios

- ✅ **Zero hardcoding** - Todas as colunas vêm do backend
- ✅ **Configuração conversacional** - Via AssistBuild
- ✅ **Reutilizável** - Funciona em todos os módulos (CRM, Projects, Leads, etc.)
- ✅ **Type-safe** - Com fallbacks robustos
- ✅ **Type-based rendering** - Usa tipos configurados em vez de heurísticas
- ✅ **Auto-formatação** - 15+ tipos suportados (currency, date, multi_select, etc.)
- ✅ **Error handling** - Toasts informativos em 403/404/erros
- ✅ **Extensível** - Suporta customStatusColors e customFieldMap
- ✅ **Supports all field collections** - leadFields, projectFields, pipelineFields, globalFields, etc.

## Implementações Completas

### ✅ Lead Generation Module
**Página:** `client/src/pages/angariacao/leads.tsx`
**Colunas dinâmicas:** 9 (proposalNumber, name, company, email, phone, status, totalBudget, createdAt, source)
**Field collection:** `leadFields`
**Status:** Production-ready

```typescript
const columns = useDynamicColumns(moduleConfig, [
  { fieldKey: 'proposalNumber', label: 'Nº Proposta', type: 'auto_number' },
  { fieldKey: 'name', label: 'Nome', type: 'text' },
  { fieldKey: 'company', label: 'Empresa', type: 'text' },
  // ... 6 more fields
]);
```

### ✅ CRM - Opportunities Module
**Página:** `client/src/pages/crm/opportunities.tsx`
**Colunas dinâmicas:** 9 (code, name, clientName, value, probability, status, stage, expectedCloseDate, createdAt)
**Field collection:** `opportunityFields`
**Status:** Production-ready

```typescript
const columns = useDynamicColumns(moduleConfig, [
  { fieldKey: 'code', label: 'Código', type: 'auto_number' },
  { fieldKey: 'name', label: 'Oportunidade', type: 'text' },
  { fieldKey: 'value', label: 'Valor €', type: 'currency' },
  // ... 6 more fields
]);
```

**Custom status colors:**
```typescript
{
  Qualificação: 'secondary',
  Proposta: 'outline',
  Negociação: 'default',
  // ... 4 more statuses
}
```

### ✅ CRM - Clients Module
**Página:** `client/src/pages/crm/clients.tsx`
**Colunas dinâmicas:** 6 (name, company, nif, email, phone, status)
**Field collection:** `clientFields`
**Status:** Production-ready

```typescript
const columns = useDynamicColumns(moduleConfig, [
  { fieldKey: 'name', label: 'Nome', type: 'text' },
  { fieldKey: 'company', label: 'Empresa', type: 'text' },
  { fieldKey: 'status', label: 'Estado', type: 'status' },
  // ... 3 more fields
]);
```

### ✅ CRM - Orders Module
**Página:** `client/src/pages/crm/orders.tsx`
**Colunas dinâmicas:** 6 (code, orderDate, clientName, totalAmount, status, invoiceId)
**Field collection:** `orderFields`
**Status:** Production-ready

```typescript
const columns = useDynamicColumns(moduleConfig, [
  { fieldKey: 'code', label: 'Código', type: 'auto_number' },
  { fieldKey: 'orderDate', label: 'Data', type: 'date' },
  { fieldKey: 'totalAmount', label: 'Total €', type: 'currency' },
  { fieldKey: 'invoiceId', label: 'Fatura Gerada?', type: 'boolean' },
  // ... 2 more fields
]);
```

**Custom status colors:**
```typescript
{
  Draft: 'secondary',
  Pending: 'outline',
  Confirmed: 'default',
  Shipped: 'default',
  Delivered: 'default',
  Cancelled: 'destructive',
}
```

## Métricas de Implementação

- **Páginas com sistema universal:** 4 (Leads, Opportunities, Clients, Orders)
- **Módulos suportados:** 2 (Lead Generation, CRM)
- **Total de colunas dinâmicas:** 30 colunas configuráveis
- **Field collections diferentes:** 4 (leadFields, opportunityFields, clientFields, orderFields)
- **Zero hardcoding:** 100% das colunas vêm da configuração backend

## Próximos Passos

Para aplicar a outros módulos:

1. **Projects** - `client/src/pages/projetos/list.tsx` (usar `projectFields`)
2. **Logistics** - Páginas de inventário (usar campos do módulo Logistics)
3. **Finance** - Páginas financeiras (usar campos do módulo Finance)

Basta seguir o padrão dos 4 exemplos implementados!
