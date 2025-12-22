# 📘 Documentação Completa - AssistME

## Índice
1. [Visão Geral](#visão-geral)
2. [Schema da Base de Dados](#schema-da-base-de-dados)
3. [API Routes](#api-routes)
4. [Arquitetura do Orquestrador](#arquitetura-do-orquestrador)
5. [Ferramentas AI (75+ Tools)](#ferramentas-ai)
6. [Modelo de Segurança](#modelo-de-segurança)
7. [SSE Streaming](#sse-streaming)
8. [Gestão de Conversas](#gestão-de-conversas)

---

## Visão Geral

**AssistME** é o assistente operacional de produção do AssistOS, projetado para tarefas empresariais do dia-a-dia.

### Características Principais
- 🤖 **Orquestrador:** GPT-5 (OpenAI) com Hybrid Intelligence Engine
- 🛠️ **Ferramentas:** 75+ AI tools operacionais
- 💬 **Conversas:** Auto-delete vazias, auto-geração de títulos
- 🏷️ **Tags:** Sistema de organização por tags
- 👥 **Multi-tenant:** Acesso compartilhado no tenant
- 📊 **Scope:** Operações empresariais (finanças, vendas, compras, RH, logística, CRM)
- ⚡ **Streaming:** SSE com otimização de tokens (60-80% redução de overhead HTTP)

### Acesso
- **Rota:** `/chat`
- **Contexto:** Production environment
- **Usuários:** Todos os usuários do tenant (multi-tenant)
- **Permissões:** RBAC por tenant (owner, admin, user)

---

## Schema da Base de Dados

### Tabelas Independentes (4 tabelas)

#### 1. `conversations` - Conversas principais
```typescript
{
  id: varchar (UUID, PK),
  tenantId: varchar (FK → tenants.id),
  title: varchar,                    // Título auto-gerado ou manual
  scope: varchar,                    // "module", "entity", "general"
  module: varchar,                   // Módulo associado (opcional)
  agentType: varchar,                // "assist_me" (SEMPRE)
  relatedEntityType: varchar,        // Tipo de entidade relacionada
  relatedEntityId: varchar,          // ID da entidade relacionada
  relatedEntityName: varchar,        // Nome da entidade (para busca)
  tags: jsonb,                       // Array de tags para organização
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Índices:**
- `idx_conversations_tenant` (tenantId)
- `idx_conversations_agent_type` (agentType)
- `idx_conversations_entity` (relatedEntityType, relatedEntityId)

#### 2. `messages` - Mensagens das conversas
```typescript
{
  id: varchar (UUID, PK),
  conversationId: varchar (FK → conversations.id),
  tenantId: varchar (FK → tenants.id),
  role: varchar,                     // "user" | "assistant"
  content: text,                     // Conteúdo da mensagem
  metadata: jsonb,                   // Metadata adicional (tool calls, etc)
  isRead: boolean,                   // Status de leitura
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Índices:**
- `idx_messages_conversation` (conversationId)
- `idx_messages_tenant` (tenantId)

#### 3. `conversation_tags` - Tags predefinidas
```typescript
{
  id: varchar (UUID, PK),
  tenantId: varchar (FK → tenants.id),
  name: varchar,                     // Nome da tag
  color: varchar,                    // Cor em hex
  icon: varchar,                     // Ícone (opcional)
  createdAt: timestamp
}
```

#### 4. `conversation_participants` - Participantes
```typescript
{
  id: varchar (UUID, PK),
  conversationId: varchar (FK → conversations.id),
  userId: varchar (FK → users.id),
  tenantId: varchar (FK → tenants.id),
  role: varchar,                     // "owner", "participant"
  joinedAt: timestamp
}
```

---

## API Routes

### Namespace
**Base:** `/api/conversations`

### Endpoints

#### 1. **GET /api/conversations** - Listar conversas
Lista todas as conversas do tenant com filtros opcionais.

**Query Parameters:**
- `scope` (string, opcional): Filtrar por scope
- `moduleSlug` (string, opcional): Filtrar por módulo
- `q` (string, opcional): Busca WhatsApp-style (título, entidade, conteúdo)
- `tags` (string[], opcional): Filtrar por tags
- `entityType` (string, opcional): Filtrar por tipo de entidade
- `agentType` (string, **recomendado**): "assistme" (previne leakage entre sistemas)

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Criar novo cliente",
    "scope": "module",
    "module": "crm",
    "agentType": "assist_me",
    "tags": ["clientes", "urgente"],
    "unreadCount": 3,
    "createdAt": "2025-01-01T10:00:00Z",
    "updatedAt": "2025-01-01T11:00:00Z"
  }
]
```

**Segurança:**
- ✅ `hardTenantGuard` - Filtra automaticamente por tenantId
- ✅ `uxRateLimiter` - Rate limiting por IP/sessão

---

#### 2. **GET /api/conversations/:id** - Obter conversa
Retorna uma conversa específica.

**Response:**
```json
{
  "id": "uuid",
  "title": "Criar novo cliente",
  "scope": "module",
  "module": "crm",
  "agentType": "assist_me",
  "tags": ["clientes"],
  "relatedEntityType": "customer",
  "relatedEntityId": "customer-123",
  "relatedEntityName": "Empresa ABC",
  "createdAt": "2025-01-01T10:00:00Z"
}
```

---

#### 3. **POST /api/conversations** - Criar conversa
Cria uma nova conversa manualmente.

**Request Body:**
```json
{
  "title": "Nova conversa sobre X",
  "scope": "module",
  "module": "sales",
  "agentType": "assist_me"
}
```

**Response:** Conversa criada (201)

---

#### 4. **POST /api/conversations/auto** - Auto-criar com primeira mensagem
**Endpoint principal** para criar conversa + enviar primeira mensagem + receber resposta AI.

**Request Body:**
```json
{
  "content": "Cria um novo cliente chamado Empresa ABC",
  "scope": "module",
  "moduleSlug": "crm",
  "attachmentIds": ["file-uuid-1"]
}
```

**Response:** SSE Stream (Server-Sent Events)

**Eventos SSE:**
```typescript
// 1. Progresso
event: progress
data: { "stage": "analyzing", "message": "Analisando pedido", "percentage": 10, "eta_seconds": 5 }

// 2. Início de ferramenta
event: tool_start
data: { "tool": "create_customer", "params": { "name": "Empresa ABC" } }

// 3. Progresso de ferramenta
event: tool_progress
data: { "tool": "create_customer", "progress": { "percentage": 50, "message": "Criando..." } }

// 4. Conclusão de ferramenta
event: tool_complete
data: { "tool": "create_customer", "result": { "id": "customer-123", "name": "Empresa ABC" } }

// 5. Mensagem (streaming otimizado)
event: message
data: { "content": "✅ Cliente Empresa ABC criado", "delta": true }

// 6. Conclusão
event: complete
data: {}
```

**Características:**
- ⚡ **Token Streaming Optimization:** Redução de 60-80% do overhead HTTP
- 📊 **Progress Tracking:** Percentagens e ETA em tempo real
- 🛠️ **Tool Events:** Transparência total nas execuções de ferramentas
- 📎 **Attachments:** Suporta análise de ficheiros (imagens, PDFs, documentos fiscais)

**Segurança:**
- ✅ `requireAuth` - Requer autenticação
- ✅ `chatRateLimiter` - Rate limiting específico para chat
- ✅ `hardTenantGuard` - Isolamento multi-tenant

---

#### 5. **POST /api/conversations/:id/messages** - Enviar mensagem
Envia nova mensagem numa conversa existente e recebe resposta AI (SSE).

**Request Body:**
```json
{
  "content": "Qual o total de vendas este mês?",
  "attachmentIds": []
}
```

**Response:** SSE Stream (mesma estrutura do /auto)

---

#### 6. **GET /api/conversations/:id/messages** - Listar mensagens
Lista todas as mensagens de uma conversa.

**Response:**
```json
[
  {
    "id": "uuid",
    "conversationId": "conv-uuid",
    "role": "user",
    "content": "Cria um cliente",
    "isRead": true,
    "createdAt": "2025-01-01T10:00:00Z"
  },
  {
    "id": "uuid",
    "conversationId": "conv-uuid",
    "role": "assistant",
    "content": "✅ Cliente criado com sucesso!",
    "metadata": {
      "toolCalls": [
        { "tool": "create_customer", "result": { "id": "customer-123" } }
      ]
    },
    "isRead": true,
    "createdAt": "2025-01-01T10:00:05Z"
  }
]
```

---

#### 7. **DELETE /api/conversations/:id** - Apagar conversa
Apaga uma conversa e todas as suas mensagens.

**Response:** 204 No Content

**Comportamento:**
- Auto-delete de conversas vazias (0 mensagens) após criação
- Cascade delete de mensagens associadas

---

#### 8. **PATCH /api/conversations/:id** - Atualizar conversa
Atualiza metadata da conversa (título, tags, etc).

**Request Body:**
```json
{
  "title": "Novo título",
  "tags": ["importante", "cliente-vip"]
}
```

**Response:** Conversa atualizada

---

#### 9. **GET /api/conversations/tags/all** - Listar todas as tags
Lista todas as tags disponíveis no tenant.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "urgente",
    "color": "#ef4444",
    "icon": "AlertCircle"
  }
]
```

---

#### 10. **POST /api/conversations/:id/tags** - Adicionar tag
Adiciona uma tag a uma conversa.

---

#### 11. **DELETE /api/conversations/:id/tags/:tagId** - Remover tag
Remove uma tag de uma conversa.

---

#### 12. **POST /api/conversations/:id/participants** - Adicionar participante
Adiciona um participante a uma conversa.

---

## Arquitetura do Orquestrador

### Hybrid Intelligence Engine

O AssistME utiliza um orquestrador híbrido que otimiza custos e latência.

#### 4 Modos de Operação
```typescript
enum HybridMode {
  TRIVIAL = 'trivial',      // <0.5s | Respostas diretas sem LLM
  SIMPLE = 'simple',        // <2s   | GPT-4o-mini para queries simples
  MODERATE = 'moderate',    // <5s   | GPT-4o para queries moderadas
  COMPLEX = 'complex'       // <15s  | GPT-5 para queries complexas
}
```

#### Pipeline de Processamento

1. **Classification** (100-200ms)
   - Classifica complexidade da query
   - Seleciona modo apropriado
   - Score: 0-100

2. **Routing** (50ms)
   - Direciona para o modo adequado
   - Fallback para modo superior se necessário

3. **Tool Filtering** (10ms)
   - Filtra ferramentas relevantes para o contexto
   - Security: Apenas ferramentas operacionais (scope: "operational")

4. **Execution**
   - **TRIVIAL:** Resposta direta (cache, regex, templates)
   - **SIMPLE:** GPT-4o-mini com 3-5 ferramentas
   - **MODERATE:** GPT-4o com 10-15 ferramentas
   - **COMPLEX:** GPT-5 com 75+ ferramentas

5. **Streaming**
   - Token optimization (batching inteligente)
   - Progress tracking (percentagens + ETA)
   - Tool events (start/progress/complete)

#### Otimizações

**Token Stream Optimizer:**
```typescript
// Configuração padrão
{
  maxBufferSize: 50,           // ~10 palavras
  maxBufferTimeMs: 100,        // <200ms latency
  immediateSendThreshold: 10,  // Palavras longas enviadas imediatamente
  enableBackpressure: true     // Proteção contra clientes lentos
}
```

**Resultados:**
- ✅ 60-80% redução de overhead HTTP
- ✅ <200ms latência percebida
- ✅ 2-3x menos eventos SSE emitidos

**Progress Tracker:**
```typescript
// Stages
analyzing    → 0-20%
routing      → 20-30%
planning     → 30-40%
executing    → 40-90%
synthesizing → 90-100%
```

---

## Ferramentas AI

### Categorias (75+ ferramentas)

O AssistME possui **75+ ferramentas operacionais** organizadas em 12 categorias:

---

### 1. CRM (26 ferramentas)

#### **Clientes**
- `create_customer` - Criar novo cliente
- `search_customers` - Pesquisar clientes (nome, email, NIF)
- `update_customer` - Atualizar informação de cliente
- `list_customers` - Listar clientes com filtros
- `merge_customers` - Fundir registos duplicados
- `enrich_customer` - Enriquecer dados de cliente (placeholder)
- `segment_customers` - Segmentar clientes por critérios
- `export_customers` - Exportar dados para JSON
- `advanced_customer_search` - Busca avançada com filtros complexos
- `bulk_update_customers` - Atualizar múltiplos clientes simultaneamente
- `bulk_tag_customers` - Adicionar/remover tags em massa
- `import_contacts_workflow` - Importar contactos de CSV
- `activity_timeline` - Timeline de atividades do cliente
- `assign_territory` - Atribuir clientes a territórios de venda
- `score_contacts` - Pontuar contactos por engagement

#### **Contactos**
- `create_contact` - Criar contacto individual para cliente
- `list_contacts` - Listar contactos associados a clientes
- `track_relationship` - Rastrear relações entre contactos
- `deduplicate_contacts` - Encontrar contactos duplicados

#### **Leads**
- `create_lead` - Criar novo lead comercial
- `qualify_lead` - Qualificar lead (cálculo de score)
- `convert_lead` - Converter lead em oportunidade

#### **Oportunidades**
- `create_opportunity` - Criar oportunidade de venda
- `update_opportunity` - Atualizar oportunidade existente
- `list_opportunities` - Listar oportunidades com filtros
- `forecast_deals` - Previsão de pipeline (data fecho/probabilidade)

#### **Atividades**
- `create_activity` - Criar atividade genérica
- `log_call` - Registar chamada telefónica
- `log_email` - Registar email enviado

#### **Pipelines**
- `create_pipeline` - Criar pipeline de vendas personalizado

---

### 2. Recursos Humanos (16 ferramentas)

#### **Colaboradores**
- `onboard_employee` - Onboarding de novo colaborador
- `list_employees` - Listar colaboradores com filtros
- `update_employee` - Atualizar informação de colaborador
- `offboard_employee` - Processar offboarding
- `list_employee_documents` - Listar documentos de colaborador

#### **Férias & Assiduidade**
- `request_timeoff` - Pedido de férias
- `approve_timeoff` - Aprovar/rejeitar férias
- `track_attendance` - Registar assiduidade
- `generate_absence_calendar` - Calendário de ausências

#### **Performance**
- `performance_review` - Criar avaliação de desempenho
- `score_employee_performance` - Pontuar desempenho (reviews + assiduidade)

#### **Payroll**
- `calculate_payroll` - Calcular folha de pagamentos

#### **Recrutamento**
- `post_job` - Publicar vaga
- `track_candidate` - Atualizar status de candidato

#### **Formação**
- `schedule_training` - Agendar sessões de formação

#### **Analytics**
- `generate_org_chart` - Gerar organograma
- `hr_analytics_report` - Relatório de analytics RH

---

### 3. Logística (14 ferramentas)

#### **Stock**
- `check_stock` - Verificar stock disponível de produto
- `list_stock_items` - Listar itens em stock
- `create_stock_movement` - Criar movimento (entrada/saída/ajuste)
- `transfer_stock` - Transferir stock entre armazéns
- `adjust_stock` - Ajustar níveis de stock (correções)
- `stock_alert` - Verificar itens com stock baixo
- `stock_valuation` - Calcular valor total do inventário
- `stock_count` - Iniciar contagem física
- `stock_forecast` - Prever necessidades futuras (histórico vendas)
- `track_lot` - Rastrear lotes ou números de série

#### **Armazéns**
- `list_warehouses` - Listar armazéns
- `create_warehouse` - Criar novo armazém

#### **Expedição**
- `create_picking_list` - Criar lista de picking
- `receive_goods` - Registar receção de mercadorias
- `ship_order` - Expedir encomenda (gera tracking)

---

### 4. Compras (10 ferramentas)

#### **Requisições**
- `create_purchase_requisition` - Criar requisição de compra
- `approve_requisition` - Aprovar/rejeitar requisição

#### **Encomendas**
- `create_purchase_order` - Criar ordem de compra

#### **Faturas**
- `receive_invoice` - Registar fatura de fornecedor
- `match_invoice` - 3-way matching (fatura vs PO vs receção)

#### **Fornecedores**
- `manage_suppliers` - Gestão CRUD de fornecedores
- `supplier_performance` - Avaliar desempenho de fornecedores

#### **RFQ (Request for Quotation)**
- `request_quotation` - Criar RFQ para múltiplos fornecedores
- `compare_quotes` - Comparar cotações recebidas

#### **Previsão**
- `forecast_demand` - Prever demanda de produtos (histórico)

---

### 5. Financeiro (3 ferramentas)

- `create_expense` - Criar despesa
- `calculate_vat` - Calcular IVA
- `calculate_project_budget` - Calcular orçamento de projeto (horas, materiais, margem)

---

### 6. Vendas (ferramentas dedicadas)

- Ferramentas específicas de vendas (integradas com módulo Sales)

---

### 7. Marketing (ferramentas dedicadas)

- Ferramentas específicas de marketing (campanhas, leads, etc)

---

### 8. Contabilidade (ferramentas dedicadas)

- Ferramentas de contabilidade (contas, lançamentos, reconciliação)

---

### 9. Projetos (ferramentas dedicadas)

- `list_project_states` - Listar estados de projeto
- `add_project_state` - Adicionar novo estado
- `edit_project_state` - Editar estado existente
- `remove_project_state` - Remover estado

---

### 10. Análise de Documentos (2 ferramentas)

- `analyze_document` - Analisar documentos fiscais (faturas, contratos) com Google Document AI
- `analyze_image` - Analisar imagens com AI Vision

---

### 11. Comunicação (5 ferramentas)

#### **WhatsApp Business**
- `send_whatsapp_template` - Enviar mensagem de template
- `send_whatsapp_message` - Enviar mensagem de texto
- `get_whatsapp_messages` - Obter mensagens de conversa
- `search_whatsapp_contacts` - Pesquisar contactos WhatsApp
- `list_whatsapp_conversations` - Listar conversas WhatsApp

---

### 12. Ferramentas Especializadas (4 ferramentas)

#### **Code Review**
- `request_code_review` - Solicitar revisão arquitetural
- `get_review_status` - Obter status de review
- `get_recent_reviews` - Listar reviews recentes

#### **TOC Online Integration**
- `configure_credentials` - Configurar credenciais TOC Online
- `discover_metadata` - Descobrir metadata (taxas, unidades, séries)
- `import_data` - Importar dados (clientes, produtos, serviços)
- `get_status` - Status da integração TOC Online

---

### Estrutura de Ferramenta

Cada ferramenta segue o formato OpenAI Function Calling:

```typescript
{
  type: "function",
  function: {
    name: "create_customer",
    description: "Cria um novo cliente no sistema CRM",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Nome do cliente ou empresa"
        },
        email: {
          type: "string",
          description: "Email de contacto"
        },
        nif: {
          type: "string",
          description: "NIF (Número de Identificação Fiscal)"
        },
        phone: {
          type: "string",
          description: "Telefone (opcional)"
        },
        address: {
          type: "string",
          description: "Morada (opcional)"
        }
      },
      required: ["name", "email"]
    }
  }
}
```

---

## Modelo de Segurança

### Multi-Tenant Isolation

**Camadas de Proteção:**

1. **hardTenantGuard (Middleware)**
   ```typescript
   // Aplica-se a TODAS as rotas de conversas
   router.use(hardTenantGuard);
   ```
   - Valida `tenantId` em TODAS as queries
   - Previne cross-tenant data leakage
   - Injeta automaticamente `tenantId` em todas as operações DB

2. **Session-based Auth**
   ```typescript
   req.session.activeTenantId  // Tenant ativo do usuário
   req.session.userId          // ID do usuário autenticado
   ```

3. **RBAC (Role-Based Access Control)**
   ```typescript
   // Roles por tenant
   - owner      // Acesso total
   - admin      // Gestão de usuários + operações
   - user       // Operações básicas
   - guest      // Apenas leitura
   ```

4. **Tool Filtering por Scope**
   ```typescript
   // Apenas ferramentas operacionais
   filterAssistMETools(allTools)
   
   // Filtra por scope
   scope: "operational"  ✅ Permitido
   scope: "platform"     ❌ Bloqueado (AssistBuild apenas)
   scope: "user"         ❌ Bloqueado (AssistSettings apenas)
   ```

5. **Rate Limiting**
   ```typescript
   // Chat-specific rate limiting
   chatRateLimiter: 30 requests/min
   
   // UX rate limiting
   uxRateLimiter: 100 requests/min
   ```

6. **Environment Isolation**
   ```typescript
   // AssistME sempre usa production
   environment: "production"
   
   // AssistBuild usa sandbox
   environment: "sandbox"
   ```

---

## SSE Streaming

### Server-Sent Events Implementation

O AssistME utiliza SSE para streaming em tempo real.

#### Configuração HTTP

```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache, no-transform');
res.setHeader('Connection', 'keep-alive');
res.setHeader('X-Accel-Buffering', 'no');

// ⭐ CRÍTICO: Desabilitar buffering TCP
res.socket.setNoDelay(true);
```

#### Formato de Eventos

```typescript
// Estrutura SSE
event: <eventType>
data: <JSON>

// Exemplo
event: message
data: {"content":"Olá","delta":true}

```

#### Tipos de Eventos

1. **progress** - Progresso da operação
   ```json
   {
     "stage": "analyzing",
     "message": "Analisando pedido...",
     "percentage": 10,
     "eta_seconds": 5
   }
   ```

2. **tool_start** - Início de execução de ferramenta
   ```json
   {
     "tool": "create_customer",
     "params": { "name": "ABC" }
   }
   ```

3. **tool_progress** - Progresso de ferramenta
   ```json
   {
     "tool": "create_customer",
     "progress": {
       "percentage": 50,
       "message": "Criando..."
     }
   }
   ```

4. **tool_complete** - Conclusão de ferramenta
   ```json
   {
     "tool": "create_customer",
     "result": { "id": "123", "name": "ABC" }
   }
   ```

5. **message** - Conteúdo da mensagem (streaming)
   ```json
   {
     "content": "✅ Cliente criado",
     "delta": true
   }
   ```

6. **complete** - Conclusão da resposta
   ```json
   {}
   ```

7. **error** - Erro durante processamento
   ```json
   {
     "message": "Erro ao processar"
   }
   ```

#### Token Stream Optimizer

**Problema:**
- LLMs emitem tokens individuais (1-5 chars)
- Cada token = 1 evento HTTP
- Overhead massivo (60-80% do tráfego)

**Solução:**
```typescript
const tokenOptimizer = createTokenStreamOptimizer(
  (chunk: string) => {
    sendEvent('message', { content: chunk, delta: true });
  },
  {
    maxBufferSize: 50,           // ~10 palavras
    maxBufferTimeMs: 100,        // <200ms latency
    immediateSendThreshold: 10,  // Palavras longas imediatas
    enableBackpressure: true     // Proteção slow clients
  }
);
```

**Resultados:**
- ✅ 60-80% menos eventos HTTP
- ✅ <200ms latência percebida
- ✅ Throughput 2-3x superior
- ✅ Proteção contra slow clients

#### Progress Tracker

**Problema:**
- Usuários não sabem quanto falta
- Sem feedback visual de progresso

**Solução:**
```typescript
const progressTracker = createProgressTracker(
  (snapshot) => {
    sendEvent('progress', {
      stage: snapshot.currentStage,
      message: snapshot.message,
      percentage: snapshot.percentage,
      eta_seconds: snapshot.eta_seconds
    });
  },
  'moderate',              // Complexidade
  'conversation_message'   // Tipo de operação
);
```

**Stages:**
```typescript
analyzing    → 0-20%   (Classificação de query)
routing      → 20-30%  (Seleção de modo)
planning     → 30-40%  (Planeamento de resposta)
executing    → 40-90%  (Execução de ferramentas)
synthesizing → 90-100% (Formatação de resposta)
```

**Resultados:**
- ✅ ETA em tempo real
- ✅ Percentagens precisas
- ✅ Feedback visual contínuo

---

## Gestão de Conversas

### Auto-Title Generation

**Trigger:** Primeira mensagem do usuário

**Implementação:**
```typescript
// Gera título automaticamente
const title = await generateConversationTitleAI(firstMessage);

// Fallback simples
const title = firstMessage.split(' ').slice(0, 5).join(' ');
```

**Exemplos:**
- Mensagem: "Cria um novo cliente chamado Empresa ABC"
- Título: "Criar cliente Empresa ABC"

### Auto-Delete Empty Conversations

**Trigger:** Conversa sem mensagens após 24h

**Implementação:**
```typescript
// Background job (cron)
const emptyConversations = await db
  .select()
  .from(conversations)
  .where(and(
    eq(conversations.messageCount, 0),
    sql`created_at < NOW() - INTERVAL '24 hours'`
  ));

await db.delete(conversations)
  .where(inArray(conversations.id, emptyConversations.map(c => c.id)));
```

### Tags System

**Criação de Tags:**
```typescript
// Tag predefinida
{
  id: uuid,
  tenantId: tenant-uuid,
  name: "urgente",
  color: "#ef4444",
  icon: "AlertCircle"
}
```

**Aplicação de Tags:**
```typescript
// Adicionar tag a conversa
await db.update(conversations)
  .set({ tags: [...existingTags, "urgente"] })
  .where(eq(conversations.id, conversationId));
```

**Busca por Tags:**
```typescript
// GET /api/conversations?tags=urgente,cliente-vip
const filtered = conversations.filter(conv => 
  conv.tags?.some(tag => requestedTags.includes(tag))
);
```

### WhatsApp-Style Search

**Busca em 3 níveis:**
1. **Título da conversa**
2. **Nome da entidade relacionada**
3. **Conteúdo das mensagens**

**Implementação:**
```typescript
// 1. Buscar mensagens que contêm termo
const matchingMessages = await db
  .select({ conversationId: messages.conversationId })
  .from(messages)
  .where(sql`LOWER(content) LIKE ${`%${searchTerm}%`}`);

// 2. Filtrar conversas
conversations.filter(conv => 
  conv.title?.toLowerCase().includes(searchTerm) ||
  conv.relatedEntityName?.toLowerCase().includes(searchTerm) ||
  matchingConvIds.has(conv.id)
);
```

### Unread Count

**Cálculo em tempo real:**
```typescript
async getUnreadMessageCount(conversationId: string) {
  const result = await db.select()
    .from(messages)
    .where(and(
      eq(messages.conversationId, conversationId),
      eq(messages.role, 'assistant'),
      eq(messages.isRead, false)
    ));
  return result.length;
}
```

**Mark as Read:**
```typescript
await db.update(messages)
  .set({ isRead: true })
  .where(eq(messages.conversationId, conversationId));
```

---

## Resumo Técnico

### Stack
- **Orquestrador:** GPT-5 (OpenAI) + Hybrid Intelligence
- **Base de Dados:** PostgreSQL (Neon) com Drizzle ORM
- **API:** Express.js com TypeScript
- **Streaming:** SSE (Server-Sent Events)
- **Segurança:** Multi-tenant + RBAC + Rate Limiting

### Performance
- **Latência Média:** <2s (Simple), <5s (Moderate), <15s (Complex)
- **Redução de Custo:** 60%+ vs GPT-5 exclusivo
- **Overhead HTTP:** -60-80% com Token Stream Optimizer
- **Throughput:** 2-3x superior com batching

### Escalabilidade
- ✅ Multi-tenant (1 DB, múltiplos tenants)
- ✅ Horizontal scaling (stateless API)
- ✅ Connection pooling (PostgreSQL)
- ✅ Rate limiting por tenant/IP

### Monitorização
- ✅ Logs estruturados (Pino)
- ✅ Real-time events (SSE)
- ✅ Tool execution tracking
- ✅ Performance metrics (latency, tokens)

---

## Próximos Passos

1. **Adicionar mais ferramentas** (goal: 100+ tools)
2. **Otimizar classificação** (reduzir latência <50ms)
3. **Implementar caching** (Redis para respostas frequentes)
4. **Analytics dashboard** (usage, costs, performance)
5. **Multi-language support** (EN, PT-BR, ES)

---

**Última atualização:** 13 de Novembro de 2025
**Versão:** 1.0.0
**Autor:** Equipa AssistOS
