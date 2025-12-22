# 📊 Módulo Financeiro - Documentação Completa

**Versão**: 1.0.0  
**Categoria**: Gestão Financeira  
**Ícone**: DollarSign (💰)

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Entidades](#entidades)
3. [Ferramentas AI (AssistME)](#ferramentas-ai-assistme)
4. [API Routes](#api-routes)
5. [Workflows](#workflows)
6. [Páginas Frontend](#páginas-frontend)
7. [Permissões](#permissões)
8. [Instalação & Configuração](#instalação--configuração)
9. [Exemplos de Uso](#exemplos-de-uso)

---

## 🎯 Visão Geral

O **Módulo Financeiro** é o sistema completo de gestão financeira do AssistOS, oferecendo:

- ✅ **Faturação**: Criação, envio e gestão de faturas
- 💰 **Recebimentos**: Registo e tracking de pagamentos
- 🏦 **Contas Bancárias**: Gestão de contas e saldos
- 🔄 **Reconciliação Bancária**: Matching automático de transações
- 📊 **Analytics**: Resumos financeiros e análise de fluxo de caixa
- 🧮 **Taxas**: Gestão de IVA e outras taxas (Portugal)
- 🤖 **AI-Powered**: 6 ferramentas AI disponíveis no AssistME

**Ficheiros Principais**:

- Core: `packages/modules/financeiro/index.ts`
- Entidades: `packages/modules/financeiro/entities/index.ts`
- AI Tools: `packages/modules/financeiro/tools/index.ts`
- Rotas: `packages/modules/financeiro/routes/index.ts`
- Workflows: `packages/modules/financeiro/workflows/index.ts`

---

## 📦 Entidades

### 1. **Invoices** (Faturas)

Gestão completa de faturas a receber.

```typescript
{
  id: string,
  tenantId: string,
  invoiceNumber: string,         // Ex: "INV-000001"
  clientId: string,              // Referência ao cliente
  issueDate: Date,               // Data de emissão
  dueDate: Date,                 // Data de vencimento
  subtotal: decimal,             // Valor antes de impostos
  taxAmount: decimal,            // Valor de IVA
  totalAmount: decimal,          // Valor total
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled',
  items: json[],                 // Linhas da fatura
  notes: string,                 // Notas adicionais
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Relacionamentos**:

- `belongsTo`: clients (via clientId)
- `hasMany`: payments (via invoiceId)
- `hasMany`: invoiceItems (via invoiceId)

**Estados do Workflow**:

- 📝 **draft**: Rascunho (editável)
- 📤 **sent**: Enviada ao cliente
- ✅ **paid**: Paga
- ⚠️ **overdue**: Vencida (automaticamente após due date)
- ❌ **cancelled**: Cancelada

---

### 2. **Payments** (Pagamentos)

Registo de todos os pagamentos recebidos.

```typescript
{
  id: string,
  tenantId: string,
  invoiceId: string,             // Opcional (pode ser pagamento avulso)
  paymentDate: Date,             // Data do recebimento
  amount: decimal,               // Montante recebido
  paymentMethod: 'bank_transfer' | 'cash' | 'card' | 'check',
  reference: string,             // Referência bancária
  status: 'pending' | 'completed' | 'failed',
  notes: string,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Relacionamentos**:

- `belongsTo`: invoices (via invoiceId)

**Estados do Workflow** (Reconciliation):

- ⏳ **pending**: Aguarda reconciliação
- ✅ **matched**: Correspondido com invoice
- ⚠️ **unmatched**: Não correspondido
- 🔒 **verified**: Verificado (final)

---

### 3. **Bank Accounts** (Contas Bancárias)

Gestão de contas bancárias da empresa.

```typescript
{
  id: string,
  tenantId: string,
  accountName: string,           // Ex: "Conta Corrente EUR"
  bankName: string,              // Ex: "Millennium BCP"
  accountNumber: string,         // Número da conta
  iban: string,                  // IBAN (PT50...)
  swift: string,                 // Código SWIFT/BIC
  currency: string,              // Ex: "EUR"
  balance: decimal,              // Saldo atual
  status: 'active' | 'inactive',
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Relacionamentos**:

- `hasMany`: bankTransactions (via accountId)

---

### 4. **Tax Rates** (Taxas de IVA)

Gestão de taxas de IVA (Portugal).

```typescript
{
  id: string,
  tenantId: string,
  country: 'PT',
  taxType: 'VAT',
  rateName: string,              // Ex: "IVA Normal"
  ratePercentage: decimal,       // Ex: 23.00
  effectiveFrom: Date,           // Data de início
  isActive: boolean,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Taxas Pré-Configuradas** (Portugal):

- 23% - IVA Normal
- 13% - IVA Reduzido
- 6% - IVA Intermédio
- 0% - Isento

---

## 🤖 Ferramentas AI (AssistME)

O módulo Financeiro disponibiliza **6 ferramentas AI** que o AssistME pode usar automaticamente:

### 1. **list_invoices**

Lista faturas com filtros opcionais.

**Parâmetros**:

- `clientId` (opcional): Filtrar por cliente
- `status` (opcional): Filtrar por status
- `startDate` (opcional): Data inicial (YYYY-MM-DD)
- `endDate` (opcional): Data final (YYYY-MM-DD)
- `limit` (opcional): Número máximo de resultados (default: 50)

**Exemplo de Uso no Chat**:

```
User: "Mostra-me as faturas pagas de janeiro"
AssistME: [usa list_invoices com status="paid", startDate="2025-01-01", endDate="2025-01-31"]
```

**Response**:

```json
{
  "invoices": [...],
  "total": 15
}
```

---

### 2. **create_invoice**

Cria nova fatura com validação completa.

**Parâmetros**:

- `clientId` (obrigatório): ID do cliente
- `items` (obrigatório): Array de items [{description, quantity, unitPrice}]
- `issueDate` (obrigatório): Data de emissão (YYYY-MM-DD)
- `dueDate` (obrigatório): Data de vencimento (YYYY-MM-DD)
- `taxRate` (opcional): Taxa de IVA (default: 0.23 = 23%)
- `notes` (opcional): Notas adicionais

**Validações**:

- ✅ Cliente existe e pertence ao tenant
- ✅ Items array não vazio
- ✅ Cada item tem description, quantity, unitPrice
- ✅ Quantity > 0
- ✅ UnitPrice >= 0
- ✅ Cálculos automáticos de subtotal, IVA e total

**Exemplo de Uso no Chat**:

```
User: "Cria uma fatura para cliente X com 10 horas de consultoria a €50/hora"
AssistME: [usa create_invoice com items=[{description: "Consultoria", quantity: 10, unitPrice: 50}]]
```

**Response**:

```json
{
  "success": true,
  "data": {
    "invoiceId": "uuid...",
    "invoiceNumber": "INV-000001",
    "subtotal": 500,
    "taxAmount": 115,
    "total": 615,
    "status": "draft",
    "message": "Fatura criada com sucesso"
  }
}
```

---

### 3. **list_payments**

Lista pagamentos recebidos.

**Parâmetros**:

- `invoiceId` (opcional): Filtrar por fatura
- `status` (opcional): Filtrar por status
- `limit` (opcional): Número máximo de resultados (default: 50)

**Exemplo de Uso**:

```
User: "Quais foram os pagamentos de hoje?"
AssistME: [usa list_payments]
```

---

### 4. **create_payment**

Regista um novo pagamento.

**Parâmetros**:

- `invoiceId` (opcional): ID da fatura (se pagamento de fatura específica)
- `amount` (obrigatório): Montante recebido
- `paymentDate` (obrigatório): Data do pagamento (YYYY-MM-DD)
- `method` (obrigatório): Método (bank_transfer, cash, card, check)
- `reference` (opcional): Referência bancária
- `notes` (opcional): Notas adicionais

**Validações**:

- ✅ Amount > 0
- ✅ Se invoiceId fornecido, fatura existe e pertence ao tenant

**Exemplo de Uso**:

```
User: "Regista um pagamento de €615 da fatura INV-000001 por transferência"
AssistME: [usa create_payment com invoiceId, amount=615, method="bank_transfer"]
```

---

### 5. **get_receivables_summary**

Resumo de valores a receber (faturas pendentes).

**Sem parâmetros** - análise completa automática.

**Response**:

```json
{
  "success": true,
  "data": {
    "draft": { "count": 5, "total": 2500.0 },
    "sent": { "count": 12, "total": 8900.0 },
    "paid": { "count": 45, "total": 35000.0 },
    "overdue": { "count": 3, "total": 1200.0 },
    "cancelled": { "count": 2, "total": 500.0 }
  }
}
```

**Exemplo de Uso**:

```
User: "Quanto temos a receber?"
AssistME: [usa get_receivables_summary]
```

---

### 6. **get_cash_flow_analysis**

Análise de fluxo de caixa.

**Parâmetros**:

- `startDate` (opcional): Data inicial
- `endDate` (opcional): Data final

**Response**:

```json
{
  "success": true,
  "data": {
    "totalPayments": 28,
    "totalAmount": 45600.0,
    "period": {
      "start": "2025-01-01",
      "end": "2025-01-31"
    }
  }
}
```

**Exemplo de Uso**:

```
User: "Quanto recebemos em janeiro?"
AssistME: [usa get_cash_flow_analysis com startDate="2025-01-01", endDate="2025-01-31"]
```

---

## 🌐 API Routes

### Invoices (Faturas)

| Método | Endpoint                       | Handler       | Descrição              |
| ------ | ------------------------------ | ------------- | ---------------------- |
| GET    | `/api/financeiro/invoices`     | listInvoices  | Lista todas as faturas |
| POST   | `/api/financeiro/invoices`     | createInvoice | Cria nova fatura       |
| GET    | `/api/financeiro/invoices/:id` | getInvoice    | Detalhes de uma fatura |
| PATCH  | `/api/financeiro/invoices/:id` | updateInvoice | Atualiza fatura        |
| DELETE | `/api/financeiro/invoices/:id` | deleteInvoice | Elimina fatura         |

### Payments (Pagamentos)

| Método | Endpoint                       | Handler       | Descrição                 |
| ------ | ------------------------------ | ------------- | ------------------------- |
| GET    | `/api/financeiro/payments`     | listPayments  | Lista todos os pagamentos |
| POST   | `/api/financeiro/payments`     | createPayment | Regista novo pagamento    |
| GET    | `/api/financeiro/payments/:id` | getPayment    | Detalhes de um pagamento  |

### Bank Accounts (Contas Bancárias)

| Método | Endpoint                        | Handler           | Descrição              |
| ------ | ------------------------------- | ----------------- | ---------------------- |
| GET    | `/api/financeiro/bank-accounts` | listBankAccounts  | Lista contas bancárias |
| POST   | `/api/financeiro/bank-accounts` | createBankAccount | Cria nova conta        |

### Tax Rates (Taxas)

| Método | Endpoint                    | Handler      | Descrição          |
| ------ | --------------------------- | ------------ | ------------------ |
| GET    | `/api/financeiro/tax-rates` | listTaxRates | Lista taxas de IVA |

### Analytics (Análises)

| Método | Endpoint                                | Handler               | Descrição                 |
| ------ | --------------------------------------- | --------------------- | ------------------------- |
| GET    | `/api/financeiro/analytics/receivables` | getReceivablesSummary | Resumo de recebimentos    |
| GET    | `/api/financeiro/analytics/cash-flow`   | getCashFlowAnalysis   | Análise de fluxo de caixa |

---

## 🔄 Workflows

### 1. **Invoice Lifecycle** (Ciclo de Vida da Fatura)

Workflow completo desde criação até pagamento/cancelamento.

**Estados**:

- 📝 **draft** (Rascunho) - Estado inicial, editável
- 📤 **sent** (Enviada) - Enviada ao cliente
- ✅ **paid** (Paga) - Estado final, pagamento recebido
- ⚠️ **overdue** (Vencida) - Passou da data de vencimento
- ❌ **cancelled** (Cancelada) - Estado final, cancelada

**Transições**:

```
draft → sent          (ação: send)
sent → paid           (ação: receive_payment)
sent → overdue        (ação: check_due_date - automático)
overdue → paid        (ação: receive_payment)
draft → cancelled     (ação: cancel)
sent → cancelled      (ação: cancel)
overdue → cancelled   (ação: cancel)
```

**Automações**:

1. **Email de Fatura**: Quando draft → sent
2. **Confirmação de Pagamento**: Quando sent/overdue → paid
3. **Check Overdue**: Verificação diária automática de faturas vencidas

---

### 2. **Payment Reconciliation** (Reconciliação de Pagamentos)

Workflow de matching de pagamentos com faturas.

**Estados**:

- ⏳ **pending** (Pendente) - Estado inicial
- ✅ **matched** (Correspondido) - Matching com fatura encontrado
- ⚠️ **unmatched** (Não correspondido) - Sem match automático
- 🔒 **verified** (Verificado) - Estado final, confirmado

**Transições**:

```
pending → matched     (ação: auto_match)
pending → unmatched   (ação: mark_unmatched)
unmatched → matched   (ação: manual_match)
matched → verified    (ação: verify)
```

**Automações**:

1. **Auto-match**: Tentativa automática quando payment.status = pending

---

### 3. **Month End Close** (Fecho de Mês)

Workflow de fecho de período financeiro.

**Estados**:

- 🟢 **open** (Aberto) - Estado inicial, período ativo
- 🔵 **reconciling** (Em reconciliação) - A reconciliar transações
- 🟡 **review** (Em revisão) - Aguarda aprovação
- 🔴 **closed** (Fechado) - Estado final, período fechado

**Transições**:

```
open → reconciling           (ação: start_close)
reconciling → review         (ação: complete_reconciliation)
review → closed              (ação: approve_close)
review → reconciling         (ação: reject_close - reabrir)
```

**Automações**:

1. **Relatórios Financeiros**: Geração automática no final do período

---

## 🖥️ Páginas Frontend

O módulo Financeiro disponibiliza **10 páginas** completas:

### 1. **Dashboard Financeiro**

- **Rota**: `/financeiro` ou `/financeiro-dashboard`
- **Ficheiro**: `client/src/pages/financeiro-dashboard.tsx`
- **Descrição**: Visão geral com KPIs, gráficos e resumos financeiros
- **Features**:
  - Total a receber
  - Faturas vencidas
  - Pagamentos do mês
  - Gráficos de evolução

### 2. **Faturação**

- **Rota**: `/financeiro-faturacao`
- **Ficheiro**: `client/src/pages/financeiro-faturacao.tsx`
- **Descrição**: Lista e gestão de faturas
- **Features**:
  - Lista de faturas (tabela)
  - Filtros por status, cliente, datas
  - Criar nova fatura
  - Editar/eliminar faturas
  - Enviar fatura por email
  - Download PDF

### 3. **Recebimentos**

- **Rota**: `/financeiro-recebimentos`
- **Ficheiro**: `client/src/pages/financeiro-recebimentos.tsx`
- **Descrição**: Lista e registo de pagamentos
- **Features**:
  - Lista de pagamentos
  - Registar novo pagamento
  - Filtros por data, método
  - Reconciliação com faturas

### 4. **Contas Bancárias**

- **Rota**: `/financeiro-contas-bancarias`
- **Ficheiro**: `client/src/pages/financeiro-contas-bancarias.tsx`
- **Descrição**: Gestão de contas bancárias
- **Features**:
  - Lista de contas
  - Saldos atuais
  - Criar/editar contas
  - Histórico de transações

### 5. **Reconciliação Bancária**

- **Rota**: `/financeiro-reconciliacao`
- **Ficheiro**: `client/src/pages/financeiro-reconciliacao.tsx`
- **Descrição**: Matching de transações bancárias
- **Features**:
  - Import de extratos bancários
  - Auto-matching com pagamentos
  - Manual matching
  - Verificação de saldos

### 6. **Orçamentos**

- **Rota**: `/financeiro-orcamentos`
- **Ficheiro**: `client/src/pages/financeiro-orcamentos.tsx`
- **Descrição**: Criação e gestão de orçamentos
- **Features**:
  - Lista de orçamentos
  - Criar novo orçamento
  - Converter orçamento em fatura
  - Templates de orçamento

### 7. **Detalhe de Orçamento**

- **Rota**: `/financeiro-orcamento-detalhe/:id`
- **Ficheiro**: `client/src/pages/financeiro-orcamento-detalhe.tsx`
- **Descrição**: Visualização detalhada de orçamento

### 8. **Rate Cards**

- **Rota**: `/financeiro-rate-cards`
- **Ficheiro**: `client/src/pages/financeiro-rate-cards.tsx`
- **Descrição**: Gestão de tabelas de preços
- **Features**:
  - Preços de serviços/produtos
  - Múltiplas moedas
  - Histórico de alterações

### 9. **Templates de Fatura**

- **Rota**: `/financeiro-templates`
- **Ficheiro**: `client/src/pages/financeiro-templates.tsx`
- **Descrição**: Templates personalizados de faturas
- **Features**:
  - Editor de templates
  - Preview em tempo real
  - Branding personalizado

### 10. **Configurações Financeiras**

- **Rota**: `/financeiro-configuracoes`
- **Ficheiro**: `client/src/pages/financeiro-configuracoes.tsx`
- **Descrição**: Configurações gerais do módulo
- **Features**:
  - Taxas de IVA
  - Numeração de faturas
  - Termos de pagamento
  - Moedas e câmbios

---

## 🔐 Permissões

O módulo Financeiro implementa **12 permissões** granulares:

### Permissões Gerais

| Chave              | Nome                  | Descrição            |
| ------------------ | --------------------- | -------------------- |
| `financial.read`   | Ver dados financeiros | Acesso leitura geral |
| `financial.write`  | Criar/editar dados    | Acesso escrita geral |
| `financial.delete` | Eliminar dados        | Acesso eliminação    |

### Permissões de Faturas

| Chave                       | Nome             | Descrição                    |
| --------------------------- | ---------------- | ---------------------------- |
| `financeiro.faturas.view`   | Ver faturas      | Visualizar lista e detalhes  |
| `financeiro.faturas.create` | Criar faturas    | Criar novas faturas          |
| `financeiro.faturas.edit`   | Editar faturas   | Modificar faturas existentes |
| `financeiro.faturas.delete` | Eliminar faturas | Apagar faturas               |

### Permissões de Pagamentos

| Chave                            | Nome                  | Descrição             |
| -------------------------------- | --------------------- | --------------------- |
| `financeiro.recebimentos.view`   | Ver recebimentos      | Visualizar pagamentos |
| `financeiro.recebimentos.create` | Registar recebimentos | Criar pagamentos      |

### Permissões de Contas

| Chave                      | Nome                   | Descrição           |
| -------------------------- | ---------------------- | ------------------- |
| `financeiro.contas.view`   | Ver contas bancárias   | Visualizar contas   |
| `financeiro.contas.manage` | Gerir contas bancárias | Criar/editar contas |

### Permissões Avançadas

| Chave                      | Nome                      | Descrição            |
| -------------------------- | ------------------------- | -------------------- |
| `financeiro.reconciliacao` | Reconciliação bancária    | Acesso reconciliação |
| `financeiro.configuracoes` | Configurações financeiras | Acesso configurações |

---

## ⚙️ Instalação & Configuração

### Instalação Automática

Quando o módulo é instalado via Studio, o hook `onInstall` cria automaticamente:

1. **Taxas de IVA para Portugal**:
   - IVA Normal (23%)
   - IVA Reduzido (13%)
   - IVA Intermédio (6%)
   - Isento (0%)

### Configuração Manual

```typescript
// 1. Ativar módulo para tenant
await financeiroModule.initialize(tenantId);

// 2. Executar hook de instalação (se necessário)
await financeiroModule.hooks.onInstall(tenantId);
```

### Configurações Recomendadas

#### 1. Numeração de Faturas

Por padrão, faturas são numeradas sequencialmente: `INV-000001`, `INV-000002`, etc.

Para personalizar:

```typescript
// Em financeiro-configuracoes.tsx
{
  prefix: "FT",           // FT-000001
  startNumber: 1000,      // FT-001000
  padLength: 6
}
```

#### 2. Taxas de IVA Customizadas

```typescript
// Adicionar nova taxa
await db.insert(taxRates).values({
  tenantId,
  country: "PT",
  taxType: "VAT",
  rateName: "IVA Açores/Madeira",
  ratePercentage: "16.00",
  effectiveFrom: new Date(),
  isActive: true,
});
```

#### 3. Templates de Email

Configurar templates para envio automático:

- Email de fatura (draft → sent)
- Confirmação de pagamento (→ paid)
- Aviso de vencimento (sent → overdue)

---

## 💡 Exemplos de Uso

### Exemplo 1: Criar Fatura via AssistME

**Chat do Utilizador**:

```
User: "Cria uma fatura para o cliente Acme Corp com:
       - 40 horas de desenvolvimento a €75/hora
       - 10 horas de design a €50/hora
       - Data de emissão: hoje
       - Vencimento: 30 dias"
```

**AssistME executa**:

```typescript
// Tool: create_invoice
{
  clientId: "uuid-acme-corp",
  items: [
    {
      description: "Desenvolvimento Web",
      quantity: 40,
      unitPrice: 75
    },
    {
      description: "Design UI/UX",
      quantity: 10,
      unitPrice: 50
    }
  ],
  issueDate: "2025-01-20",
  dueDate: "2025-02-19",
  taxRate: 0.23
}
```

**Resultado**:

```
Fatura INV-000123 criada com sucesso!

Subtotal: €3,500.00
IVA (23%): €805.00
Total: €4,305.00
Status: Rascunho

Próximo passo: Queres que envie a fatura ao cliente?
```

---

### Exemplo 2: Análise Financeira

**Chat do Utilizador**:

```
User: "Quanto temos a receber este mês? E quanto já recebemos?"
```

**AssistME executa**:

```typescript
// 1. Tool: get_receivables_summary
// 2. Tool: get_cash_flow_analysis com startDate = início do mês
```

**Resultado**:

```
📊 Análise Financeira - Janeiro 2025

💰 A Receber:
   - Faturas enviadas: €8,900.00 (12 faturas)
   - Faturas vencidas: €1,200.00 (3 faturas) ⚠️
   - Total a receber: €10,100.00

✅ Já Recebido:
   - 28 pagamentos
   - Total: €45,600.00

Taxa de cobrança: 81.9%
```

---

### Exemplo 3: Registar Pagamento

**Chat do Utilizador**:

```
User: "Acabei de receber €4,305 da fatura INV-000123 por transferência bancária"
```

**AssistME executa**:

```typescript
// 1. Tool: list_invoices com filtro invoiceNumber="INV-000123"
// 2. Tool: create_payment
{
  invoiceId: "uuid-inv-123",
  amount: 4305,
  paymentDate: "2025-01-20",
  method: "bank_transfer"
}
```

**Resultado**:

```
✅ Pagamento registado com sucesso!

Fatura INV-000123 marcada como PAGA
Método: Transferência Bancária
Montante: €4,305.00
Data: 20/01/2025

A fatura foi automaticamente atualizada e o cliente receberá
uma confirmação de pagamento por email.
```

---

### Exemplo 4: Query Builder (Cross-Module)

Outros módulos podem aceder aos dados do Financeiro:

```typescript
// No módulo Comercial, obter faturas de um cliente
const financeiroData = financeiroModule.exposeData();

const invoices = await financeiroData.listEntities("invoices", [
  { field: "clientId", operator: "eq", value: clientId },
  { field: "status", operator: "eq", value: "paid" },
]);

// Ou usar query builder
const query = financeiroData.createQuery();
const totalRevenue = await query
  .select("invoices")
  .where([
    { field: "status", operator: "eq", value: "paid" },
    { field: "issueDate", operator: "gte", value: "2025-01-01" },
  ])
  .aggregate("sum", "totalAmount");
```

---

### Exemplo 5: Workflow Automation

```typescript
// Automação: Enviar email quando fatura é enviada
financeiroModule.workflows[0].automations[0] = {
  trigger: "state_change",
  condition: { from: "draft", to: "sent" },
  action: async (invoice) => {
    await sendEmail({
      to: invoice.client.email,
      subject: `Fatura ${invoice.invoiceNumber}`,
      template: "invoice_sent",
      data: { invoice },
    });
  },
};
```

---

## 📊 Métricas & Analytics

### Métricas Disponíveis

Via `exposeData().aggregate()`:

| Métrica             | Descrição                            |
| ------------------- | ------------------------------------ |
| `total_invoices`    | Total de faturas criadas             |
| `total_payments`    | Total de pagamentos recebidos        |
| `total_receivables` | Valor total a receber (faturas sent) |
| `total_revenue`     | Receita total (faturas paid)         |

**Exemplo**:

```typescript
const revenue = await financeiroData.aggregate("total_revenue");
// Output: 245600.00
```

---

## 🔒 Segurança

### Tenant Isolation

✅ **Todas** as entidades têm `tenantId` obrigatório  
✅ **Todos** os queries filtram por `tenantId`  
✅ **Todas** as ferramentas AI validam tenant ownership

**Exemplo de Validação**:

```typescript
// Na tool create_invoice
const clientResult = await db
  .select({ id: clients.id })
  .from(clients)
  .where(
    and(
      eq(clients.id, clientId),
      eq(clients.tenantId, context.tenantId) // ✅ SECURITY
    )
  )
  .limit(1);

if (!clientResult || clientResult.length === 0) {
  return { error: "Cliente não encontrado ou não pertence ao tenant" };
}
```

### Validações

- ✅ Amounts > 0
- ✅ Dates válidas
- ✅ Foreign keys existem
- ✅ Items arrays não vazios
- ✅ Calculations corretos (subtotal + IVA)

---

## 🚀 Próximos Passos

### Roadmap Sugerido

1. **PDF Generation**: Gerar PDFs de faturas com branding
2. **Email Templates**: Templates customizáveis de emails
3. **Recurring Invoices**: Faturas recorrentes automáticas
4. **Multi-Currency**: Suporte para múltiplas moedas
5. **Bank Integration**: Sincronização automática com bancos (via Open Banking)
6. **Reports**: Relatórios financeiros avançados (P&L, Balance Sheet)
7. **Exports**: Export para Excel/CSV/PDF
8. **Reminders**: Lembretes automáticos de pagamento
9. **Payment Links**: Links de pagamento online (Stripe/MB Way)
10. **Audit Trail**: Histórico completo de alterações

---

## 📞 Suporte

**Ficheiros Relevantes**:

- Core: `packages/modules/financeiro/`
- Database Schema: `shared/schema.ts` (search for "invoices", "payments")
- Frontend: `client/src/pages/financeiro*`
- API Routes: `apps/api/routes/` (registados via módulo)

**Debug Mode**:

```typescript
// Ativar logging detalhado
process.env.DEBUG_FINANCEIRO = "true";
```

---

**Última Atualização**: Janeiro 2025  
**Versão do Documento**: 1.0.0
