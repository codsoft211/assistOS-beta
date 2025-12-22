# 🏗️ Módulos AssistOS - Arquitetura Modular

## 📋 Visão Geral

Sistema modular para AssistOS baseado em 4 camadas:

```
┌─────────────────────────────────────────────────────────┐
│                    AGENT LAYER                          │
│     (assistME, assistBuild, 11 specialized agents)     │
└─────────────────────────────────────────────────────────┘
                         ↕️
┌─────────────────────────────────────────────────────────┐
│              CROSS-MODULE TOOLS LAYER                   │
│  (Financial Grid, Document Management, Analytics)       │
│  - Trabalham sobre MÚLTIPLOS módulos                    │
│  - Agregam dados cross-module                           │
└─────────────────────────────────────────────────────────┘
                         ↕️
┌─────────────────────────────────────────────────────────┐
│                   MODULE LAYER                          │
│    (Comercial, Financeiro, Logística, RH, etc)         │
│    - Cada módulo é independente                         │
│    - Expõe interface padronizada                        │
└─────────────────────────────────────────────────────────┘
                         ↕️
┌─────────────────────────────────────────────────────────┐
│                    CORE LAYER                           │
│  (Multi-tenant, Auth, Storage, Database)                │
└─────────────────────────────────────────────────────────┘
```

---

## 🧩 IModule Interface

Cada módulo de negócio implementa `IModule`:

```typescript
interface IModule {
  metadata: ModuleMetadata; // ID, nome, versão, dependências
  entities: EntityDefinition[]; // Schema das entidades
  workflows: WorkflowDefinition[]; // Workflows e estados
  tools: ModuleTool[]; // AI tools específicas
  routes: RouteDefinition[]; // Rotas API
  hooks: ModuleHooks; // Lifecycle events
  exposeData(): ModuleDataInterface; // Para cross-tools
}
```

### Exemplo: Módulo Comercial

```typescript
export class ComercialModule implements IModule {
  metadata = {
    id: 'comercial',
    name: 'Módulo Comercial',
    version: '1.0.0',
    category: 'comercial',
    permissions: ['sales.read', 'sales.write']
  };

  entities = [
    { name: 'leads', schema: {...} },
    { name: 'orders', schema: {...} }
  ];

  tools = [
    {
      name: 'create_lead',
      description: 'Create a new lead',
      execute: async (params, context) => { ... }
    }
  ];

  exposeData(): ModuleDataInterface {
    return {
      createQuery: () => new ComercialQueryBuilder(this.tenantId),
      aggregate: async (metric) => { ... },
      getEntity: async (name, id) => { ... },
      // ... outros métodos
    };
  }
}

// Registrar módulo no sistema
ModuleRegistryService.registerModule('comercial', () => new ComercialModule());
```

---

## 🔄 ICrossModuleTool Interface

Ferramentas transversais que trabalham sobre múltiplos módulos:

```typescript
interface ICrossModuleTool {
  metadata: CrossModuleToolMetadata;
  requiredModules?: string[]; // Módulos necessários
  execute(context: CrossModuleContext): Promise<any>;
  aggregateData?(modules: ModuleRegistry): Promise<AggregatedData>;
}
```

### Exemplo: Financial Grid

```typescript
export class FinancialGridTool implements ICrossModuleTool {
  metadata = {
    id: "financial-grid",
    name: "Financial Grid",
    category: "intelligence",
  };

  requiredModules = ["comercial", "financeiro"];

  async execute(context: CrossModuleContext) {
    // Acessa dados de múltiplos módulos
    const comercial = context.modules.get("comercial");
    const financeiro = context.modules.get("financeiro");

    // Agrega dados
    const revenue = await comercial.exposeData().aggregate("revenue");
    const costs = await financeiro.exposeData().aggregate("costs");

    return { revenue, costs, margin: revenue - costs };
  }
}
```

---

## 📦 ModuleRegistry

Gerencia módulos instalados por tenant:

```typescript
const registry = await createModuleRegistry(tenantId);

// Verificar se módulo está instalado
if (registry.isInstalled("comercial")) {
  const comercial = registry.get("comercial");
  // Usar módulo...
}

// Listar todos módulos
const allModules = registry.list(); // ['comercial', 'financeiro', ...]

// Query cross-module
const results = await registry.queryAll({
  modules: ["comercial", "financeiro"],
  entity: "invoices",
  filters: [{ field: "status", operator: "eq", value: "paid" }],
});
```

---

## 🔧 CrossModuleContext

Context para executar cross-module tools:

```typescript
import { CrossModuleContextService } from './cross-module-tools/base';

// Build context
const context = await CrossModuleContextService.buildContext(
  tenantId,
  userId,
  {
    dateRange: { start: new Date('2025-01-01'), end: new Date() },
    filters: [...]
  }
);

// Usar em cross-tool
const financialGrid = new FinancialGridTool();
const result = await financialGrid.execute(context);
```

---

## 📊 Database Schema

### tenantModules

Rastreia módulos instalados por tenant:

```sql
CREATE TABLE tenant_modules (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR REFERENCES tenants(id),
  module_id TEXT,                    -- 'comercial', 'financeiro', etc
  is_active BOOLEAN DEFAULT true,
  installed_at TIMESTAMP,
  installed_by VARCHAR REFERENCES users(id),
  config JSONB,
  UNIQUE(tenant_id, module_id)
);
```

### moduleFeatures

Features individuais por módulo:

```sql
CREATE TABLE module_features (
  id VARCHAR PRIMARY KEY,
  tenant_module_id VARCHAR REFERENCES tenant_modules(id) ON DELETE CASCADE,
  feature_key TEXT,                  -- 'leads', 'opportunities', etc
  is_enabled BOOLEAN DEFAULT true,
  config JSONB
);
```

---

## 🚀 Migração de Legacy Code

### Estratégia

1. **Identificar** - Mapear código legacy (entities, tools, routes)
2. **Adaptar** - Criar classe IModule
3. **Migrar** - Copiar lógica existente (não reescrever!)
4. **Testar** - Validar isoladamente

### Exemplo de Migração

**ANTES (Legacy):**

```typescript
// apps/api/routes/commercial.ts
router.post("/leads", async (req, res) => {
  const lead = await db.insert(leads).values(req.body);
  res.json(lead);
});
```

**DEPOIS (IModule):**

```typescript
// packages/modules/comercial/index.ts
export class ComercialModule implements IModule {
  tools = [
    {
      name: "create_lead",
      execute: async (params, context) => {
        // MESMA lógica do legacy!
        return await db.insert(leads).values(params);
      },
    },
  ];

  routes = [
    {
      method: "POST",
      path: "/api/comercial/leads",
      handler: "createLead", // Usa tool acima
    },
  ];
}
```

---

## 📁 Estrutura de Ficheiros

```
packages/
├── modules/
│   ├── base/
│   │   ├── module.interface.ts          # IModule contract
│   │   ├── module-registry.service.ts   # Registry
│   │   └── README.md                    # Esta doc
│   │
│   ├── comercial/                       # Módulo 1
│   │   ├── index.ts                     # ComercialModule class
│   │   ├── entities/
│   │   ├── workflows/
│   │   └── tools/
│   │
│   ├── financeiro/                      # Módulo 2
│   └── ... (8 módulos total)
│
├── cross-module-tools/
│   ├── base/
│   │   ├── cross-module-tool.interface.ts
│   │   └── cross-module-context.service.ts
│   │
│   ├── financial-grid/                  # Cross-tool 1
│   ├── document-management/             # Cross-tool 2
│   └── analytics/                       # Cross-tool 3
```

---

## ✅ Checklist de Implementação

### Para Novo Módulo

- [ ] Criar classe que implementa `IModule`
- [ ] Definir `metadata` (id, nome, versão)
- [ ] Mapear `entities` do legacy
- [ ] Migrar `tools` (AI tools) do legacy
- [ ] Definir `routes` API
- [ ] Implementar `exposeData()` para cross-tools
- [ ] Implementar `hooks` (onInstall, etc)
- [ ] Testar isoladamente
- [ ] Adicionar ao `ModuleRegistry.loadModule()`

### Para Nova Cross-Tool

- [ ] Criar classe que implementa `ICrossModuleTool`
- [ ] Definir `metadata`
- [ ] Especificar `requiredModules`
- [ ] Implementar `execute(context)`
- [ ] Implementar `aggregateData()` se aplicável
- [ ] Testar com módulos reais

---

## 🔍 Exemplos de Uso

### Instalar Módulo

```typescript
const registry = new ModuleRegistryService(tenantId);
await registry.installModule("comercial", userId);
```

### Usar Module Tool

```typescript
const comercial = registry.get("comercial");
const createLeadTool = comercial.tools.find((t) => t.name === "create_lead");

const result = await createLeadTool.execute(
  { name: "Cliente X", email: "x@example.com" },
  { tenantId, userId, permissions: ["sales.write"] }
);
```

### Cross-Module Query

```typescript
const context = await CrossModuleContextService.buildContext(tenantId, userId);

// Financial Grid sobre Comercial + Financeiro
const grid = new FinancialGridTool();
const budget = await grid.execute(context);
```

---

## 📚 Recursos

- **Interface Docs:** `module.interface.ts`
- **Cross-Tool Docs:** `cross-module-tool.interface.ts`
- **Assessment:** `FASE_0_LEGACY_ASSESSMENT.md`
- **Migration Plan:** `ASSISTOS_MIGRATION_PLAN.md`

---

**Status:** ✅ FASE 1 COMPLETA - Fundação da arquitetura modular criada
