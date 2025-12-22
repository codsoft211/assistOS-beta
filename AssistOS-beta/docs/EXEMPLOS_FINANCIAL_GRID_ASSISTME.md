# 💰 Exemplos Práticos - AssistME usando Financial Grid

**Data:** 2025-11-17  
**Objetivo:** Mostrar exemplos concretos de como o AssistME usaria Financial Grid e Budgeting Engine

---

## 🎯 CENÁRIOS PRÁTICOS

### **Cenário 1: Criar Budget de Marketing**

**Conversa:**
```
👤 Utilizador: "Cria um budget de marketing de €10,000 para este mês"

🤖 AssistME (thinking):
  - Detecta: criar budget
  - Precisa: name, category, period, amount
  - Tool: create_budget (já existe!)

💬 AssistME: "Vou criar o budget de marketing para este mês."

[Executa: create_budget({
  name: "Marketing - Novembro 2025",
  period: "2025-11",
  amount: 10000,
  category: "marketing"
})]

✅ AssistME: "Budget criado com sucesso!

**Budget: Marketing - Novembro 2025**
- Categoria: `marketing`
- Período: 2025-11
- Valor: **€10,000.00**
- ID: `budget-abc123`

Quer que eu configure alertas quando o budget atingir 80%?"
```

**O que acontece:**
1. AssistME detecta intenção de criar budget
2. Chama tool `create_budget` (já existe em `assistme/financial/create-budget.ts`)
3. Tool cria budget diretamente no database (atualmente não usa FinancialGridService)
4. AssistME apresenta resultado formatado
5. Oferece próxima ação (alertas)

**Nota:** A tool atual usa implementação direta. Idealmente deveria usar `FinancialGridService.createBudget()` para aproveitar funcionalidades avançadas.

---

### **Cenário 2: Verificar Tracking de Budget**

**Conversa:**
```
👤 Utilizador: "Como está o budget de marketing este mês?"

🤖 AssistME (thinking):
  - Detecta: consultar budget/spending
  - Precisa: budgetId
  - Tool: track_budget (já existe!)

💬 AssistME: "Vou verificar o status do budget de marketing."

[Primeiro, busca budget de marketing]
[Depois executa: track_budget({
  budgetId: "budget-abc123"
})]

✅ AssistME: "Status do Budget de Marketing (Novembro 2025):

**Budget: Marketing - Novembro 2025**
- Alocado: **€10,000.00**
- Gasto: **€6,500.00**
- Restante: **€3,500.00**
- Utilizado: **65%** ✅

**Status:** 🟢 On Track

Ainda tens **€3,500** disponíveis. Quer que eu mostre o breakdown por categoria?"
```

**O que acontece:**
1. AssistME detecta consulta de budget
2. Se necessário, busca budget por categoria/nome
3. Chama tool `track_budget` (já existe em `assistme/financial/track-budget.ts`)
4. Tool calcula:
   - Total alocado (do budget)
   - Total gasto (campo `spent` do budget)
   - Percentagem usada
   - Status (ok/warning/exceeded)
5. AssistME apresenta de forma clara e visual

**Nota:** A tool atual usa apenas o campo `spent` do budget. Idealmente deveria usar `BudgetingEngineService.trackSpending()` para calcular gastos reais de invoices.

---

### **Cenário 3: Calcular Orçamento de Projeto**

**Conversa:**
```
👤 Utilizador: "Quanto custa um projeto de 200 horas a €50/hora, com €5,000 de materiais?"

🤖 AssistME (thinking):
  - Detecta: calcular orçamento
  - Tool: calculate_project_budget (já existe!)

💬 AssistME: "Vou calcular o orçamento do projeto."

[Executa: calculate_project_budget({
  laborHours: 200,
  laborRate: 50,
  materials: 5000,
  overhead: 2000,
  marginPercent: 20,
  taxRate: 0.23
})]

✅ AssistME: "Orçamento calculado:

**Custos:**
- Mão-de-obra: **€10,000** (200h × €50/h)
- Materiais: **€5,000**
- Overhead: **€2,000**
- **Subtotal:** €17,000

**Margem (20%):** €3,400
**IVA (23%):** €4,692

**Preço de Venda:** **€25,092**

Quer que eu crie um orçamento formal com estes valores?"
```

**O que acontece:**
1. AssistME detecta cálculo de orçamento
2. Chama tool `calculate_project_budget` (já existe em `specialized/financial.ts`)
3. Financial Grid executa cálculo usando modelo financeiro
4. Retorna breakdown detalhado
5. AssistME formata de forma clara

---

### **Cenário 4: Comparar Cenários de Budget**

**Conversa:**
```
👤 Utilizador: "Compara o budget conservador vs otimista para o próximo trimestre"

🤖 AssistME (thinking):
  - Detecta: comparar cenários
  - Tool: compare_scenarios (via Financial Grid)

💬 AssistME: "Vou comparar os dois cenários de budget."

[Executa: compare_scenarios({
  baseScenarioId: "scenario-conservador",
  comparisonScenarioIds: ["scenario-otimista"]
})]

✅ AssistME: "Comparação de Cenários - Q1 2026:

| Métrica | Conservador | Otimista | Diferença |
|---------|-------------|----------|-----------|
| Receita | €100,000 | €150,000 | +€50,000 |
| Custos | €80,000 | €100,000 | +€20,000 |
| Margem | €20,000 | €50,000 | +€30,000 |
| Margem % | 20% | 33% | +13pp |

**Recomendação:** Cenário otimista mostra potencial de **+€30,000** de margem adicional, mas requer **+€20,000** de investimento.

Quer que eu detalhe as premissas de cada cenário?"
```

**O que acontece:**
1. AssistME detecta comparação de cenários
2. Chama tool `compare_scenarios` do Financial Grid
3. Financial Grid compara resultados de diferentes cenários
4. AssistME apresenta tabela comparativa
5. Oferece análise e recomendações

---

### **Cenário 5: Explicar Cálculo Financeiro**

**Conversa:**
```
👤 Utilizador: "Explica-me o cálculo do orçamento do projeto X"

🤖 AssistME (thinking):
  - Detecta: explicar cálculo
  - Precisa: calculationId
  - Tool: explain_financial_result (já existe!)

💬 AssistME: "Vou explicar como foi calculado o orçamento."

[Executa: explain_financial_result({
  calculationId: "calc-abc123"
})]

✅ AssistME: "Explicação do Cálculo - Projeto X:

**Inputs Utilizados:**
- Horas: 200h
- Taxa horária: €50/h
- Materiais: €5,000
- Overhead: €2,000
- Margem: 20%
- IVA: 23%

**Fórmula Aplicada:**
1. Custo direto = (200 × 50) + 5,000 = €15,000
2. Custo total = 15,000 + 2,000 (overhead) = €17,000
3. Preço sem IVA = 17,000 × 1.20 (margem) = €20,400
4. Preço final = 20,400 × 1.23 (IVA) = **€25,092**

**Padrões Aplicados:**
- Ajuste automático de overhead baseado em projetos similares (+5%)
- Margem ajustada para tipo de projeto (+2%)

Quer que eu mostre como os padrões foram aplicados?"
```

**O que acontece:**
1. AssistME detecta pedido de explicação
2. Chama tool `explain_financial_result` (já existe)
3. Financial Grid retorna breakdown passo-a-passo
4. AssistME explica de forma clara e didática

---

### **Cenário 6: Forecast Financeiro**

**Conversa:**
```
👤 Utilizador: "Qual é a previsão financeira para os próximos 3 meses?"

🤖 AssistME (thinking):
  - Detecta: previsão/forecast
  - Tool: generate_forecast (via Budgeting Engine)

💬 AssistME: "Vou gerar a previsão financeira baseada no histórico."

[Executa: generate_forecast({
  period: { start: "2025-12-01", end: "2026-02-28" },
  lookbackMonths: 6
})]

✅ AssistME: "Previsão Financeira - Dez 2025 a Fev 2026:

**Tendências Identificadas:**
- Receita: **+5%** ao mês (crescimento consistente)
- Custos: **+3%** ao mês (inflação controlada)
- Sazonalidade: Dezembro +15% (fim de ano)

**Previsão:**
| Mês | Receita | Custos | Margem | Margem % |
|-----|---------|--------|--------|----------|
| Dez | €120,000 | €85,000 | €35,000 | 29% |
| Jan | €105,000 | €80,000 | €25,000 | 24% |
| Fev | €110,000 | €82,000 | €28,000 | 25% |
| **Total** | **€335,000** | **€247,000** | **€88,000** | **26%** |

**Confiança:** 🟡 Média (baseado em 6 meses de histórico)

Quer que eu crie budgets baseados nesta previsão?"
```

**O que acontece:**
1. AssistME detecta pedido de forecast
2. Chama tool `generate_forecast` do Budgeting Engine
3. Budgeting Engine:
   - Busca dados históricos (invoices)
   - Calcula tendências
   - Aplica sazonalidade
   - Gera previsão
4. AssistME apresenta tabela e análise

---

### **Cenário 7: Análise de Variância (Budget vs Actual)**

**Conversa:**
```
👤 Utilizador: "Como está o budget de marketing vs o que realmente gastámos?"

🤖 AssistME (thinking):
  - Detecta: análise de variância
  - Tool: get_budget_vs_actual (via Budgeting Engine)

💬 AssistME: "Vou comparar o budget planeado com os gastos reais."

[Executa: get_budget_vs_actual({
  category: "marketing",
  period: { start: "2025-11-01", end: "2025-11-30" }
})]

✅ AssistME: "Análise Budget vs Actual - Marketing (Nov 2025):

**Resumo:**
- Budget: **€10,000**
- Actual: **€11,500**
- Variância: **-€1,500** ❌ (excedido)

**Breakdown:**
| Item | Budget | Actual | Variância |
|------|--------|--------|-----------|
| Publicidade | €5,000 | €6,200 | -€1,200 |
| Eventos | €3,000 | €3,500 | -€500 |
| Materiais | €2,000 | €1,800 | +€200 ✅ |

**Principais Desvios:**
- Publicidade: Excedido em 24% (campanha extra)
- Eventos: Excedido em 17% (evento adicional)

**Recomendação:** Considerar ajustar budget de publicidade para €6,000 no próximo mês.

Quer que eu crie um novo budget ajustado?"
```

**O que acontece:**
1. AssistME detecta análise de variância
2. Chama tool `get_budget_vs_actual` do Budgeting Engine
3. Budgeting Engine:
   - Compara budget com invoices reais
   - Calcula variâncias
   - Identifica desvios
4. AssistME apresenta análise detalhada
5. Oferece recomendações

---

## 🛠️ TOOLS DISPONÍVEIS

### **Tools já implementadas para AssistME:**
- ✅ `create_budget` - Criar budget (em `assistme/financial/create-budget.ts`)
- ✅ `track_budget` - Tracking de gastos (em `assistme/financial/track-budget.ts`)
- ✅ `calculate_project_budget` - Calcula orçamento de projeto (em `specialized/financial.ts`)
- ✅ `explain_financial_result` - Explica cálculo financeiro (em `specialized/financial.ts`)
- ✅ `record_actual_outcome` - Regista resultado real (em `specialized/financial.ts`)
- ✅ `get_recent_budgets` - Lista budgets recentes (em `specialized/financial.ts`)

### **Tools que precisam ser criadas/integradas:**
- ❌ `get_budget_vs_actual` - Análise de variância (Budgeting Engine tem `analyzeVariance`, mas não como tool)
- ❌ `generate_forecast` - Gerar forecast (Budgeting Engine tem `generateForecast`, mas não como tool)
- ❌ `compare_scenarios` - Comparar cenários (Financial Grid tem `compareScenarios`, mas não como tool)

### **Nota importante:**
As tools `create_budget` e `track_budget` existem, mas **precisam ser verificadas** se estão integradas com `FinancialGridService` e `BudgetingEngineService` ou se usam implementação direta no database.

---

## 📋 RESUMO

**O que o AssistME pode fazer COM Financial Grid:**

1. ✅ **Calcular orçamentos** de projetos
2. ✅ **Explicar cálculos** financeiros
3. ✅ **Registar resultados** reais (para learning)
4. ✅ **Listar budgets** recentes

**O que o AssistME NÃO pode fazer ainda (precisa tools):**

1. ❌ **Criar budgets** (precisa tool `create_budget`)
2. ❌ **Ver tracking** de gastos (precisa tool `track_spending`)
3. ❌ **Análise de variância** (precisa tool `get_budget_vs_actual`)
4. ❌ **Gerar forecasts** (precisa tool `generate_forecast`)
5. ❌ **Comparar cenários** (precisa tool `compare_scenarios`)

---

## 🎯 PRÓXIMO PASSO

Criar as tools faltantes para AssistME poder usar Financial Grid e Budgeting Engine completamente.

