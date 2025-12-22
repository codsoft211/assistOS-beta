# Sistema de Sequências Numéricas por Tenant

## 📋 Visão Geral

O AssistOS implementa um sistema de IDs sequenciais por tenant para garantir códigos legíveis e organizados.

**Características:**
- ✅ **Thread-safe** (usa `SELECT FOR UPDATE`)
- ✅ **Multi-tenant** (cada tenant tem sua própria sequência)
- ✅ **Suporta importação** (códigos importados atualizam contadores automaticamente)
- ✅ **Mantém UUID interno** (para integridade referencial)

---

## 🏗️ Estrutura

### Tabela: `sequenceCounters`

```sql
CREATE TABLE sequence_counters (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id),
  entity_type VARCHAR(50) NOT NULL,     -- 'supplier', 'client', 'invoice', etc.
  prefix VARCHAR(10) NOT NULL,           -- 'SUP', 'CLI', 'INV', etc.
  current_value INTEGER NOT NULL DEFAULT 0,
  padding_length INTEGER NOT NULL DEFAULT 4,  -- SUP-0001 (4 dígitos)
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Schema em Drizzle (shared/schema.ts)

```typescript
export const suppliers = pgTable("suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`), // ← UUID interno
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  code: varchar("code", { length: 50 }).notNull().unique(), // ← Código sequencial
  taxId: varchar("tax_id", { length: 50 }), // ← NIF
  name: varchar("name", { length: 255 }).notNull(),
  ...
});
```

---

## 💻 Uso do SequenceService

### 1. Criação Normal (sem importação)

```typescript
import { SequenceService } from '@/services/sequence.service';

// Gera próximo código: SUP-0001, SUP-0002, etc.
const code = await SequenceService.getNextCode({
  tenantId: context.tenantId,
  entityType: 'supplier',
  prefix: 'SUP'
});

// Insere fornecedor com código sequencial
const [supplier] = await db.insert(suppliers).values({
  tenantId: context.tenantId,
  code, // ← SUP-0001
  name: 'Fornecedor XYZ',
  taxId: '123456789'
}).returning();
```

---

### 2. Importação de Dados

```typescript
// Importar fornecedor com código específico
const importedCode = 'SUP-0042'; // ← Código do sistema antigo

const code = await SequenceService.getNextCode({
  tenantId: context.tenantId,
  entityType: 'supplier',
  prefix: 'SUP'
}, importedCode); // ← Passa código importado

// Resultado: code = 'SUP-0042'
// E o contador é atualizado para 42 (se for maior que o atual)
```

**O que acontece:**
1. ✅ Usa o código importado (`SUP-0042`)
2. ✅ Atualiza o contador para `42` (se for maior que o valor atual)
3. ✅ Próximo código gerado será `SUP-0043`

---

### 3. Exemplo Completo de Importação em Lote

```typescript
interface ImportedSupplier {
  code: string;    // Ex: "SUP-0042"
  name: string;
  taxId: string;
}

async function importSuppliers(
  tenantId: string,
  data: ImportedSupplier[]
) {
  for (const item of data) {
    // Preserva código importado e atualiza contador
    const code = await SequenceService.getNextCode({
      tenantId,
      entityType: 'supplier',
      prefix: 'SUP'
    }, item.code); // ← Código do sistema antigo
    
    await db.insert(suppliers).values({
      tenantId,
      code,           // ← SUP-0042 (preservado)
      name: item.name,
      taxId: item.taxId
    });
  }
}

// Uso:
await importSuppliers('tenant-123', [
  { code: 'SUP-0010', name: 'Fornecedor A', taxId: '111111111' },
  { code: 'SUP-0025', name: 'Fornecedor B', taxId: '222222222' },
  { code: 'SUP-0042', name: 'Fornecedor C', taxId: '333333333' },
]);

// Após importação:
// - Contador ficará em 42
// - Próximo código gerado: SUP-0043
```

---

## 🔧 Tipos de Entidades Suportadas

```typescript
type EntityType = 
  | 'supplier'     // SUP-0001
  | 'client'       // CLI-0001
  | 'invoice'      // INV-0001
  | 'expense'      // EXP-0001
  | 'opportunity'  // OPP-0001
  | 'project';     // PRJ-0001
```

---

## 🛡️ Thread Safety

O sistema usa `SELECT FOR UPDATE` para garantir que múltiplas requisições simultâneas não gerem códigos duplicados:

```typescript
const existingCounter = await db
  .select()
  .from(sequenceCounters)
  .where(...)
  .for('update') // ← Lock até a transação terminar
  .limit(1);
```

---

## 🎯 Exemplo Real no AssistOS

### Ferramenta: `create_expense`

```typescript
// packages/ai/tools/assistme/financial/create-expense.ts

// 1. Procura fornecedor por NIF
const existingSupplier = await db
  .select()
  .from(suppliers)
  .where(and(
    eq(suppliers.tenantId, context.tenantId),
    eq(suppliers.taxId, input.supplierTaxId) // ← NIF
  ));

if (existingSupplier.length === 0) {
  // 2. Gera código sequencial
  const code = await SequenceService.getNextCode({
    tenantId: context.tenantId,
    entityType: 'supplier',
    prefix: 'SUP'
  });
  
  // 3. Cria novo fornecedor
  const [newSupplier] = await db.insert(suppliers).values({
    tenantId: context.tenantId,
    code, // ← SUP-0001
    name: input.supplierName,
    taxId: input.supplierTaxId
  }).returning();
}

// 4. Cria despesa com código sequencial
const expenseCode = await SequenceService.getNextCode({
  tenantId: context.tenantId,
  entityType: 'expense',
  prefix: 'EXP'
});

await db.insert(purchasingInvoices).values({
  code: expenseCode, // ← EXP-0001
  invoiceNumber: expenseCode,
  ...
});
```

---

## 🔑 Decisões Arquiteturais

### Por que UUID interno + Código sequencial?

1. ✅ **UUID (`id`)**:
   - Imutável
   - Usado em relações (foreign keys)
   - Seguro para APIs públicas
   - Evita conflitos em importações

2. ✅ **Código sequencial (`code`)**:
   - Legível para humanos
   - Fácil de lembrar e comunicar
   - Ordenação natural
   - Compatível com sistemas antigos

### Exemplo:
```typescript
{
  id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", // ← UUID (interno)
  code: "SUP-0001",                            // ← Código (UX)
  name: "Fornecedor XYZ"
}
```

---

## 📝 Resumo

| Característica | Descrição |
|----------------|-----------|
| **Isolamento** | Cada tenant tem sequências independentes |
| **Thread-safe** | `SELECT FOR UPDATE` previne race conditions |
| **Importação** | Códigos importados atualizam contadores |
| **Formato** | `{PREFIX}-{NUMBER}` (ex: SUP-0001) |
| **Padding** | Configurável (padrão: 4 dígitos) |
| **Persistência** | Tabela `sequenceCounters` |
| **Serviço** | `apps/api/services/sequence.service.ts` |

---

## ✅ Checklist de Implementação

Ao adicionar nova entidade com sequências:

- [ ] Adicionar tipo em `SequenceService` interface
- [ ] Definir prefixo único (ex: `PRJ` para projetos)
- [ ] Usar `SequenceService.getNextCode()` ao criar
- [ ] Suportar importação com código específico
- [ ] Manter UUID interno para relações
- [ ] Documentar formato do código

---

## 🚀 Próximos Passos

Para adicionar sequências em nova entidade:

1. **Atualizar tipo** em `sequence.service.ts`:
```typescript
type EntityType = 
  | 'supplier'
  | 'client'
  | 'invoice'
  | 'expense'
  | 'opportunity'
  | 'project'
  | 'your_new_entity'; // ← Adicionar aqui
```

2. **Usar no código**:
```typescript
const code = await SequenceService.getNextCode({
  tenantId: context.tenantId,
  entityType: 'your_new_entity',
  prefix: 'YNE' // ← Escolher prefixo único
});
```

3. **Testar importação**:
```typescript
const code = await SequenceService.getNextCode({
  tenantId: context.tenantId,
  entityType: 'your_new_entity',
  prefix: 'YNE'
}, 'YNE-0100'); // ← Código importado
```

---

**Sistema pronto para produção!** 🎉
