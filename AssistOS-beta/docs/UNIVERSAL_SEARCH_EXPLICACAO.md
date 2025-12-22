# 🔍 Universal Search - O que é e o que faz

**Data:** 2025-11-17  
**Objetivo:** Explicar Universal Search e o que integrar no AssistME

---

## 🎯 O QUE É UNIVERSAL SEARCH?

**Universal Search** é um serviço de busca unificado que permite procurar em **todos os módulos e dados** da plataforma AssistOS usando uma única interface.

### **Analogia:**
É como o Google, mas dentro do AssistOS:
- **Google:** busca em toda a internet
- **Universal Search:** busca em toda a plataforma (documentos, invoices, clientes, fornecedores, projetos, etc.)

---

## 🛠️ O QUE FAZ (3 Tipos de Busca)

### **1. Busca Textual (`search`)**
- Busca por texto exato ou parcial
- Procura em campos como `name`, `title`, `description`
- Exemplo: buscar "João Silva" encontra clientes, fornecedores, contatos com esse nome

**Como funciona:**
```
Query: "João Silva"
↓
Busca em TODOS os módulos ativos:
  - Módulo Comercial → Clientes (name, email)
  - Módulo Compras → Fornecedores (name, contact)
  - Módulo HR → Funcionários (name)
  - etc.
↓
Retorna resultados ordenados por relevância
```

### **2. Busca Semântica (`semanticSearch`)**
- Busca por **significado**, não apenas palavras exatas
- Usa **embeddings** (representações vetoriais de texto)
- Entende sinônimos e contexto
- Exemplo: "fatura do fornecedor ABC" encontra invoices mesmo que não tenha essas palavras exatas

**Como funciona:**
```
Query: "fatura do fornecedor ABC em janeiro"
↓
1. Gera embedding da query (vetor de 1536 dimensões)
2. Compara com embeddings de documentos existentes
3. Usa cosine distance para encontrar documentos similares
4. Retorna documentos mais relevantes (por significado)
```

**Vantagem:** Encontra documentos mesmo que não tenham as palavras exatas da busca.

### **3. Busca Inteligente (`intelligentSearch`)**
- **Combina** busca textual + semântica
- Remove duplicados
- Ranking melhorado (semântica tem boost de 20%)
- Melhor dos dois mundos

**Como funciona:**
```
Query: "orçamento projeto X"
↓
1. Busca textual → encontra projetos com "orçamento" no nome
2. Busca semântica → encontra documentos relacionados a orçamentos
3. Merge e deduplica resultados
4. Ranking: semântica tem prioridade (mais relevante)
5. Retorna top 20 resultados
```

---

## 📊 O QUE BUSCA ATUALMENTE

### **✅ Implementado:**
1. **Documentos** (semantic search)
   - Busca em `document_embeddings` table
   - Join com `documents` table para título/descrição
   - Retorna: título, filename, tipo, descrição

2. **Entidades de Módulos** (textual search)
   - Busca em todas as entidades de módulos ativos
   - Usa `ModuleDataInterface.listEntities()`
   - Busca em campos: `name`, `title`, `description`

### **⚠️ Limitações Atuais:**
- Semantic search só busca em **documentos** (não em outras entidades)
- Textual search depende de módulos implementarem `listEntities()` corretamente
- Alguns módulos podem não ter busca implementada (retorna vazio)

---

## 🎨 ONDE ESTÁ NA UI ATUALMENTE?

### **Existe:**
- `SearchDialog` component em `client/src/components/documents/SearchDialog.tsx`
- Usado apenas na página de **Gestão Documental**
- Busca apenas em **documentos** (não é universal ainda)
- Endpoint: `/api/documents/search` (não usa Universal Search)

### **Não existe:**
- ❌ Busca universal no header/navbar
- ❌ Atalho Cmd+K (command palette)
- ❌ Integração no AssistME
- ❌ Busca cross-module na UI

---

## 🤖 O QUE VAMOS INTEGRAR NO ASSISTME?

### **Objetivo:**
Permitir que o AssistME use Universal Search para ajudar o usuário a encontrar coisas.

### **Cenários de Uso:**

#### **1. Usuário pergunta: "Onde está a fatura do fornecedor ABC?"**
```
AssistME:
1. Usa tool universal_search
2. Busca "fatura fornecedor ABC"
3. Retorna resultados
4. Responde: "Encontrei 3 faturas do fornecedor ABC:
   - Fatura #123 (Janeiro 2025) - €1,200
   - Fatura #456 (Fevereiro 2025) - €800
   - Fatura #789 (Março 2025) - €1,500
   
   Quer que eu abra alguma?"
```

#### **2. Usuário pergunta: "Mostra-me todos os documentos sobre o projeto X"**
```
AssistME:
1. Usa tool universal_search com filtro de módulo/entidade
2. Busca "projeto X" em documentos
3. Retorna lista de documentos relacionados
4. Apresenta resultados formatados
```

#### **3. Usuário pergunta: "Quem é o cliente João?"**
```
AssistME:
1. Usa tool universal_search
2. Busca "João" (pode ser cliente, fornecedor, funcionário)
3. Retorna resultados de múltiplos módulos
4. Responde: "Encontrei:
   - Cliente: João Silva (CRM)
   - Fornecedor: João & Filhos (Compras)
   - Funcionário: João Santos (HR)
   
   Qual deles?"
```

---

## 🛠️ O QUE VAMOS CRIAR

### **1. Tool para AssistME: `universal_search`**

**Localização:** `packages/ai/tools/assistme/discovery/universal-search.ts`

**Funcionalidade:**
- Permite AssistME buscar em toda a plataforma
- Usa `intelligentSearch()` (combina textual + semântica)
- Retorna resultados formatados para AssistME apresentar

**Parâmetros:**
```typescript
{
  query: string;           // "fatura fornecedor ABC"
  modules?: string[];      // Opcional: filtrar módulos
  entities?: string[];     // Opcional: filtrar entidades
  limit?: number;          // Default: 10
}
```

**Retorno:**
```typescript
{
  results: Array<{
    module: string;        // "financeiro"
    entity: string;        // "invoice"
    id: string;           // "inv-123"
    title: string;        // "Fatura #123"
    description?: string;  // "Fornecedor ABC, €1,200"
    score: number;        // 0.95 (relevância)
    url?: string;         // Link para página
  }>;
  count: number;
}
```

### **2. Integração no AssistME**

**O que fazer:**
1. Criar tool `UniversalSearchTool` (extends `ToolBase`)
2. Registrar no `toolRegistry`
3. Tool será automaticamente disponível para AssistME (se categoria correta)
4. AssistME pode usar quando usuário pedir para "buscar", "encontrar", "mostrar"

**Exemplo de uso pelo AssistME:**
```typescript
// AssistME detecta que usuário quer buscar algo
if (userMessage.includes("buscar") || userMessage.includes("encontrar")) {
  // Chama tool universal_search
  const results = await universalSearchTool.execute({
    query: extractedQuery,
    limit: 10
  });
  
  // Formata resposta
  return formatSearchResults(results);
}
```

---

## 📋 RESUMO

### **O que é:**
- Serviço de busca unificado em toda a plataforma
- 3 tipos: textual, semântica, inteligente (combina ambos)

### **O que faz:**
- Busca em documentos (semântica)
- Busca em entidades de módulos (textual)
- Combina resultados com ranking inteligente

### **O que vamos integrar:**
- ✅ Tool `universal_search` para AssistME
- ✅ AssistME pode buscar quando usuário pedir
- ✅ Respostas formatadas e úteis

### **O que NÃO vamos fazer agora:**
- ❌ UI de busca universal no header (fase seguinte)
- ❌ Command palette Cmd+K (fase seguinte)
- ❌ Melhorias na busca semântica de outras entidades (fase seguinte)

---

## 🎯 IMPLEMENTAÇÃO COMPLETA

### ✅ **Tool Criada: `universal_search`**

**Localização:** `packages/ai/tools/assistme/discovery/universal-search.ts`

**Características:**
- ✅ Categoria: `discovery` (disponível para AssistME)
- ✅ Scope: `tenant` (seguro para AssistME)
- ✅ Usa `intelligentSearch()` (combina textual + semântica)
- ✅ Auto-registrada no `toolRegistry`
- ✅ Validação Zod de input/output
- ✅ Error handling robusto

**Parâmetros:**
- `query` (obrigatório): Texto de busca
- `modules` (opcional): Filtrar módulos específicos
- `entities` (opcional): Filtrar entidades específicas
- `limit` (opcional, default: 10, max: 20): Número de resultados

**Exemplo de uso pelo AssistME:**
```typescript
// AssistME detecta: "Onde está a fatura do fornecedor ABC?"
await universalSearchTool.execute({
  query: "fatura fornecedor ABC",
  limit: 10
});

// Retorna:
{
  count: 3,
  results: [
    {
      module: "financeiro",
      entity: "invoice",
      id: "inv-123",
      title: "Fatura #123",
      description: "Fornecedor ABC, €1,200",
      score: 0.95
    },
    // ...
  ]
}
```

### ✅ **Registrada e Pronta**

A tool está automaticamente disponível para AssistME quando:
1. AssistME carrega tools do `toolRegistry`
2. `filterAssistMETools()` permite tools de categoria `discovery`
3. AssistME pode usar quando detectar intenção de busca

---

## 🧪 TESTE

**Para testar:**
1. Abrir AssistME (chat)
2. Perguntar: "Onde está a fatura do fornecedor ABC?"
3. AssistME deve:
   - Detectar intenção de busca
   - Chamar `universal_search` tool
   - Apresentar resultados formatados
   - Oferecer ações (abrir, ver detalhes, etc.)

---

## 📝 PRÓXIMAS MELHORIAS (Fase Seguinte)

- [ ] Melhorar formatação de resultados no AssistME
- [ ] Adicionar ações rápidas (abrir documento, ver detalhes)
- [ ] Adicionar busca universal no header (Cmd+K)
- [ ] Expandir busca semântica para outras entidades (não só documentos)

