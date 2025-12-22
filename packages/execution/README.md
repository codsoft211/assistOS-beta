# Execution Engine

Core execution engine para workflows, automations e agents.

## Overview

O Execution Engine é responsável por executar workflows de forma sequencial, gerenciar o estado de execução e registrar todos os passos no banco de dados.

## Components

- **WorkflowExecutor**: Executa workflows sequencialmente com tracking completo
- **ActionRegistry**: Registry de ações disponíveis (✅ Implemented)
- **ActionExecutor**: Interface base para criar custom actions
- **EventBus**: Event-driven automation trigger system (✅ Implemented)

## Usage

```typescript
import { WorkflowExecutor } from '@/packages/execution';
import type { WorkflowDefinition } from '@/packages/execution';

// Define your workflow
const workflow: WorkflowDefinition = {
  id: 'workflow-123',
  name: 'Sample Workflow',
  steps: [
    {
      id: 'step-1',
      name: 'Send Email',
      action: 'send_email',
      config: {
        to: 'user@example.com',
        subject: 'Hello',
        body: 'World'
      }
    },
    {
      id: 'step-2',
      name: 'Create Record',
      action: 'create_record',
      config: {
        entity: 'leads',
        data: { name: 'New Lead' }
      }
    }
  ]
};

// Execute the workflow
const executor = new WorkflowExecutor();
const executionId = await executor.execute(
  workflow,
  'tenant-id-123',
  { triggeredBy: 'user@example.com' }
);

console.log(`Workflow execution started: ${executionId}`);
```

## Features

### ✅ Implemented

- Sequential step execution
- Database tracking of execution state
- Error handling and logging
- Step result storage in context
- Complete execution lifecycle management
- **Action Registry pattern** - Plugin-like architecture for actions
- Action validation before execution
- Default stub action for testing

### 🚧 Coming Next

- Retry logic for failed steps
- Parallel step execution
- Conditional branching
- Event-driven triggers
- Webhook support
- Additional built-in actions (send_email, http_request, etc.)

## Database Schema

O executor utiliza a tabela `workflow_executions` para tracking:

```sql
- workflowId: Reference to workflow definition
- tenantId: Multi-tenancy support
- status: running | completed | failed | cancelled | waiting_approval
- stepsExecuted: Array of step execution results
- triggerData: Original trigger data
- errorMessage: Error details if failed
- startedAt/completedAt: Timing information
```

## Architecture

```
WorkflowExecutor
├── execute()          - Main execution entry point
├── executeStep()      - Execute individual step via ActionRegistry
└── logStepExecution() - Log step to database

ActionRegistry (Singleton)
├── register()         - Register new actions
├── unregister()       - Remove actions
├── list()            - List available actions
├── has()             - Check if action exists
├── get()             - Get action instance
└── execute()         - Execute action with validation

Future Components:
├── EventBus          - Pub/sub event system
└── RetryManager      - Handle step retries
```

## Error Handling

O executor implementa error handling robusto:

1. Cada step é executado dentro de try-catch
2. Erros são registrados no banco de dados
3. Workflow status é atualizado para 'failed'
4. Error stack trace é preservado para debugging

## Action Registry

O Action Registry implementa um padrão de plugin que permite registrar e executar ações customizadas.

### Registered Actions

Ações atualmente registradas:

#### Core Actions (Batch 1)

- **send_email**: Enviar emails via SMTP usando Nodemailer
  - Config: `{ to, subject, body, from?, html? }`
  - Utiliza variáveis de ambiente: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS

- **create_record**: Criar um novo registro genérico no banco de dados
  - Config: `{ table, data }`
  - Adiciona automaticamente o tenantId ao registro
  - Retorna o registro criado

- **update_record**: Atualizar um registro existente no banco de dados
  - Config: `{ table, where, data }`
  - Garante que apenas registros do tenant correto são atualizados
  - **Usa per-table column allowlists** para segurança máxima (CRÍTICO)
  
  **SECURITY: Per-Table Column Allowlists**
  - Cada tabela tem uma lista EXPLÍCITA de colunas que podem ser atualizadas
  - Sistema de allowlist previne múltiplas vulnerabilidades críticas:
    1. **Tenant Escalation**: Bloqueia updates em `tenantId` E `tenant_id` (snake_case)
    2. **Foreign Key Attacks**: Bloqueia updates em foreign keys (clientId, supplierId, projectId, etc.)
    3. **Audit Trail Tampering**: Bloqueia updates em campos de auditoria
    4. **Primary Key Manipulation**: Bloqueia updates em IDs
  
  - Campos **SEMPRE BLOQUEADOS** (não estão em nenhuma allowlist):
    - `id`: Chave primária
    - `tenantId` / `tenant_id`: Isolamento multi-tenant (CRÍTICO - previne tenant takeover)
    - `clientId`, `supplierId`, `projectId`, etc.: Foreign keys (previne cross-tenant access)
    - `createdAt`, `createdBy`: Integridade do audit trail
    - `updatedAt`, `updatedBy`: Gerenciado pelo banco de dados/ORM
  
  - Exemplo de allowlist para `notifications`:
    - **Permitido**: `read`, `readAt`, `metadata` (APENAS 3 campos)
    - **Bloqueado**: `id`, `tenantId`, `userId`, `type`, `title`, `message`, `link`, etc.
  
  - Exemplo de allowlist para `clients`:
    - **Permitido**: `name`, `email`, `phone`, `address`, `status`, etc. (business fields)
    - **Bloqueado**: `id`, `tenantId`, `createdBy`, `createdAt`, etc. (system fields)
  
  - Mensagens de erro claras mostram:
    - Campos que foram tentados
    - Campos permitidos para aquela tabela específica
    - Exemplo: `"Attempted: [tenantId, clientId]. Allowed for notifications: [read, readAt, metadata]"`
  
  - Sistema handle schemas **MIXED camelCase/snake_case**:
    - Tenant enforcement funciona com `tenantId` (camelCase) OU `tenant_id` (snake_case)
    - Allowlists bloqueiam ambos os formatos automaticamente
  
  - Retorna erro se apenas campos bloqueados forem fornecidos
  - Retorna o registro atualizado após filtragem segura

- **send_notification**: Criar uma notificação no sistema
  - Config: `{ userId, message, title?, type? }`
  - Tipos disponíveis: 'info', 'success', 'warning', 'error'
  - Notificações aparecem no painel do usuário

- **log_event**: Registrar um evento no event log do sistema
  - Config: `{ eventType, eventData, triggeredBy? }`
  - Status automático: 'processed'
  - Usado para auditoria e rastreamento de automações

#### Core Actions (Batch 2)

- **ocr_extract**: Extrair texto de arquivos PDF usando pdf-parse
  - Config: `{ filePath?, fileBuffer? }`
  - Suporta tanto caminho de arquivo quanto buffer direto
  - Retorna texto extraído, número de páginas, info e metadata do PDF
  - Exemplo:
    ```typescript
    {
      action: 'ocr_extract',
      config: {
        filePath: '/path/to/document.pdf'
      }
    }
    ```

- **call_api**: Fazer chamadas HTTP/REST a APIs externas
  - Config: `{ url, method, headers?, params?, body?, timeout? }`
  - Timeout padrão: 30 segundos
  - Retorna status, statusText, headers e data da resposta
  - Exemplo:
    ```typescript
    {
      action: 'call_api',
      config: {
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: { 'Authorization': 'Bearer token' },
        body: { key: 'value' },
        timeout: 5000
      }
    }
    ```

- **transform_data**: Transformar e mapear dados usando templates
  - Config: `{ input, mapping }`
  - Suporta transformação de objetos únicos ou arrays
  - Permite acesso a variáveis de contexto via `$context.varName`
  - Permite acesso a resultados de steps anteriores via `$step.stepId.field`
  - **Permite literal strings via `@literal`** (novo!)
  - Sintaxe de mapping:
    - `"fieldName"` → Busca valor em `input.fieldName`
    - `"$context.varName"` → Busca valor em `context.variables.varName`
    - `"$step.stepId.field"` → Busca valor em `context.stepResults.stepId.field`
    - `"@literal"` → Retorna literal string "literal" (constante)
  - Exemplo:
    ```typescript
    {
      action: 'transform_data',
      config: {
        input: { firstName: 'John', lastName: 'Doe' },
        mapping: {
          fullName: 'firstName',                    // Maps input.firstName
          email: '$context.userEmail',              // Maps context variable
          previousResult: '$step.step1.output',     // Maps previous step result
          status: '@approved',                      // Literal string "approved"
          type: '@customer',                        // Literal string "customer"
          tenantId: '$context.tenantId'            // Maps context.tenantId
        }
      }
    }
    // Output: {
    //   fullName: 'John',
    //   email: 'user@example.com',
    //   previousResult: {...},
    //   status: 'approved',
    //   type: 'customer',
    //   tenantId: 'tenant-123'
    // }
    ```

- **wait**: Pausar execução por um período determinado
  - Config: `{ duration }`
  - Duration em milissegundos (máximo: 300000ms / 5 minutos)
  - Retorna duração configurada e duração real da espera
  - Exemplo:
    ```typescript
    {
      action: 'wait',
      config: {
        duration: 5000 // Wait 5 seconds
      }
    }
    ```

- **conditional**: Avaliação de condições para branching logic
  - Config: `{ condition }`
  - Suporta operadores de comparação: `==`, `===`, `!=`, `!==`, `>`, `>=`, `<`, `<=`, `contains`, `startsWith`, `endsWith`
  - Suporta operadores lógicos: `and`, `or`, `not`
  - Acesso a contexto via `$context.` e resultados de steps via `$step.`
  - Retorna `conditionMet` (boolean) indicando se a condição foi satisfeita
  - Exemplos:
    ```typescript
    // Simple comparison
    {
      action: 'conditional',
      config: {
        condition: {
          operator: '>',
          left: '$context.totalAmount',
          right: 1000
        }
      }
    }
    
    // Logical AND
    {
      action: 'conditional',
      config: {
        condition: {
          and: [
            { operator: '===', left: '$context.status', right: 'approved' },
            { operator: '>', left: '$context.amount', right: 500 }
          ]
        }
      }
    }
    
    // String operations
    {
      action: 'conditional',
      config: {
        condition: {
          operator: 'contains',
          left: '$step.step1.output.email',
          right: '@company.com'
        }
      }
    }
    ```

#### Test Actions

- **stub**: Ação de teste que sempre retorna sucesso

### Creating Custom Actions

Para criar uma ação customizada:

```typescript
import type { ActionExecutor, ActionResult } from '@/packages/execution';
import type { ExecutionContext } from '@/packages/execution';

export class SendEmailAction implements ActionExecutor {
  readonly name = 'send_email';
  readonly description = 'Sends an email to specified recipients';
  
  // Optional: Validate configuration before execution
  validate(config: Record<string, any>): boolean {
    return !!config.to && !!config.subject && !!config.body;
  }
  
  // Execute the action
  async execute(
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    try {
      const { to, subject, body } = config;
      
      // Your email sending logic here
      await sendEmail({ to, subject, body });
      
      return {
        success: true,
        output: {
          messageId: 'msg-123',
          sentTo: to,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
```

### Registering Custom Actions

```typescript
import { actionRegistry } from '@/packages/execution';
import { SendEmailAction } from './actions/send-email';

// Register your custom action
actionRegistry.register(new SendEmailAction());

// Check if action is available
if (actionRegistry.has('send_email')) {
  console.log('send_email action is ready!');
}

// List all available actions
console.log('Available actions:', actionRegistry.list());
```

### Using Actions in Workflows

```typescript
const workflow: WorkflowDefinition = {
  id: 'workflow-123',
  name: 'Send Welcome Email',
  steps: [
    {
      id: 'step-1',
      name: 'Send Email',
      action: 'send_email',  // References the registered action
      config: {
        to: 'user@example.com',
        subject: 'Welcome!',
        body: 'Thanks for signing up'
      }
    }
  ]
};
```

## Event Bus

O **Event Bus** é um sistema de pub/sub event-driven que permite executar automations e agents em resposta a eventos do sistema.

### Architecture

```
Event Publisher → eventLog (status='pending') → Event Bus Poller → Match Automations → Execute → Mark as 'processed'
```

O Event Bus:
1. **Polls** a tabela `eventLog` a cada X segundos (configurável)
2. **Encontra** automations que subscrevem o `eventType` do evento
3. **Executa** as automations correspondentes
4. **Marca** o evento como `processed` ou `failed`

### Starting the Event Bus

```typescript
import { eventBus } from '@/packages/execution';

// Start with default 5-second interval
eventBus.start();

// Or customize the polling interval (in milliseconds)
eventBus.start(3000); // Poll every 3 seconds

// Stop the event bus
eventBus.stop();
```

### Publishing Events

Para publicar um evento que dispara automations:

```typescript
import { eventBus } from '@/packages/execution';

// Publish an event
const eventId = await eventBus.publish(
  'tenant-123',                    // tenantId
  'order.created',                 // eventType
  {                                // eventData
    orderId: 'order-456',
    customerId: 'customer-789',
    amount: 1500.00,
    items: [...]
  },
  'user-id-optional'               // triggeredBy (optional)
);

console.log(`Event published: ${eventId}`);
```

### Event Types

Eventos seguem uma convenção de nomenclatura hierárquica:

- `order.created` - Nova ordem criada
- `order.approved` - Ordem aprovada
- `order.cancelled` - Ordem cancelada
- `invoice.created` - Fatura criada
- `invoice.approved` - Fatura aprovada
- `invoice.paid` - Fatura paga
- `payment.received` - Pagamento recebido
- `task.completed` - Tarefa completada
- `document.uploaded` - Documento carregado
- `approval.needed` - Aprovação necessária

### Automation Triggers

Automations podem subscrever eventos através do campo `trigger`:

```typescript
// Example automation in tenantAutomations table
{
  id: 'automation-123',
  tenantId: 'tenant-456',
  name: 'Send Invoice Email',
  trigger: 'invoice.created',      // Subscribe to this event type
  isActive: true,
  action: { /* automation config */ }
}
```

Quando um evento `invoice.created` é publicado:
1. Event Bus encontra todas as automations com `trigger = 'invoice.created'`
2. Executa cada automation (insere em `automationExecutions`)
3. Marca o evento como processado

### How It Works

#### 1. Publishing (Immediate)

```typescript
// App code publishes event
await eventBus.publish('tenant-123', 'order.created', orderData);
// ↓
// Event inserted into eventLog with status='pending'
// ↓
// setImmediate() triggers immediate processing (no waiting for poll)
```

#### 2. Polling Mechanism

```typescript
// Every 5 seconds (configurable):
SELECT * FROM event_log WHERE status = 'pending' LIMIT 50;
// ↓
// Process each event:
//   1. Find matching automations
//   2. Execute automations
//   3. Update event status to 'processed'
```

#### 3. Execution Tracking

```typescript
// For each event, tracks:
{
  status: 'processed',              // or 'failed'
  processedAt: '2025-11-01T10:00:00Z',
  automationsTriggered: 3,          // Count of automations executed
  agentsTriggered: 0                // Future: agent triggers
}
```

### Database Schema

O Event Bus utiliza estas tabelas:

**eventLog** - Event queue
```sql
- id: UUID
- tenantId: Reference to tenant
- eventType: String (e.g., 'order.created')
- eventData: JSONB payload
- status: 'pending' | 'processed' | 'failed'
- triggeredBy: Optional user ID
- processedAt: Timestamp when processed
- automationsTriggered: Count of automations executed
- agentsTriggered: Count of agents triggered (future)
- createdAt: Event creation time
```

**tenantAutomations** - Automation definitions
```sql
- id: UUID
- tenantId: Reference to tenant
- trigger: Event type to subscribe (e.g., 'invoice.created')
- isActive: Boolean
- action: JSONB automation config
```

**automationExecutions** - Execution records
```sql
- id: UUID
- automationId: Reference to automation
- tenantId: Reference to tenant
- status: 'completed' | 'failed'
- triggerData: JSONB event data
- result: JSONB execution result
- startedAt: Execution start time
```

### Error Handling

O Event Bus implementa error handling robusto:

1. **Event Processing Errors**: Se falhar ao processar um evento, marca como `failed`
2. **Automation Errors**: Se uma automation falha, continua processando outras automations
3. **Lock Mechanism**: `isProcessing` flag previne processamento concorrente
4. **Batch Processing**: Processa até 50 eventos por vez para performance

```typescript
// Example error handling
try {
  await processEvent(event);
} catch (error) {
  // Mark event as failed
  await db.update(eventLog)
    .set({ status: 'failed', processedAt: new Date() })
    .where(eq(eventLog.id, event.id));
}
```

### Best Practices

1. **Event Naming**: Use hierarchical naming (`entity.action`)
2. **Event Data**: Include all relevant data in `eventData` payload
3. **Idempotency**: Design automations to be idempotent (safe to retry)
4. **Monitoring**: Check `eventLog` for `failed` events periodically
5. **Polling Interval**: Balance between responsiveness and database load
   - High-traffic: 3-5 seconds
   - Low-traffic: 10-30 seconds
   - Development: 5 seconds (default)

### Integration Example

Integrar o Event Bus no servidor:

```typescript
// apps/api/index.ts
import { eventBus } from '@/packages/execution';

// Start event bus when server starts
eventBus.start(5000); // 5-second polling

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  eventBus.stop();
  process.exit(0);
});
```

Publicar eventos nas rotas:

```typescript
// Example: Publishing event when order is created
app.post('/api/orders', async (req, res) => {
  const order = await createOrder(req.body);
  
  // Publish event to trigger automations
  await eventBus.publish(
    req.user.tenantId,
    'order.created',
    {
      orderId: order.id,
      customerId: order.customerId,
      total: order.total,
      items: order.items
    },
    req.user.id
  );
  
  res.json(order);
});
```

### Future Enhancements

- ✅ Automation triggers
- 🚧 Agent scheduling triggers
- 🚧 Retry logic for failed events
- 🚧 Event priority queue
- 🚧 Webhook delivery
- 🚧 Event replay capability

## Testing

### End-to-End Integration Test

O Execution Engine inclui um teste end-to-end completo que valida o ciclo inteiro de event-driven automations:

**Ficheiro**: `packages/execution/test-integration.ts`

**O que o teste valida:**

1. ✅ **Criação de Automation** - Insere uma automation na tabela `tenantAutomations`
2. ✅ **Publicação de Evento** - Publica evento via `eventBus.publish()`
3. ✅ **Event Processing** - EventBus encontra e processa o evento pendente
4. ✅ **Automation Matching** - EventBus encontra automations que subscrevem o eventType
5. ✅ **Action Execution** - ActionRegistry executa todas as actions da automation
6. ✅ **Result Persistence** - Results são gravados em `automationExecutions`

**Flow do teste:**

```
1. Create Automation (event trigger: 'lead.created')
   ↓
2. Publish Event (eventType: 'lead.created')
   ↓
3. EventBus polls eventLog → finds pending event
   ↓
4. EventBus matches automation by eventType
   ↓
5. Execute actions: log_event + send_notification
   ↓
6. Verify execution record in automationExecutions
```

### Como executar o teste

**Opção 1: Executar diretamente com tsx**

```bash
npx tsx packages/execution/test-integration.ts
```

**Opção 2: Usar npm script (se configurado)**

```bash
npm run test:execution
```

### Configuração do teste

**IMPORTANTE**: Antes de executar o teste, atualize os IDs no ficheiro:

```typescript
// packages/execution/test-integration.ts
const TEST_TENANT_ID = 'your-tenant-id-here';  // Replace com tenant ID real
const TEST_USER_ID = 'your-user-id-here';      // Replace com user ID real
```

Pode obter IDs válidos da base de dados:

```sql
-- Get tenant ID
SELECT id, name FROM tenants LIMIT 1;

-- Get user ID
SELECT id, email FROM users LIMIT 1;
```

### Output esperado

Quando o teste corre com sucesso, verá output semelhante a:

```
=== EXECUTION ENGINE INTEGRATION TEST ===

📝 Step 1: Creating test automation...
✅ Automation created: abc-123-def - "Test Lead Welcome Email"

📢 Step 2: Publishing event...
✅ Event published: xyz-789-uvw

⏳ Step 3: Waiting for event processing (6 seconds)...

🔍 Step 4: Checking event status...
✅ Event processed successfully
   - Automations triggered: 1
   - Processed at: 2025-11-01T10:30:45.123Z

🔍 Step 5: Checking automation execution...
✅ Automation executed: exec-456-ghi
   - Status: success
   - Duration: 234ms
   - Actions executed: 2
   - Action 1 (log_event): success
   - Action 2 (send_notification): success

🧹 Step 6: Cleanup (optional - comment out to keep data)...

=== TEST COMPLETE ===

✅ All tests passed!
```

### Interpretação dos resultados

**✅ Teste passou se:**
- Automation foi criada com sucesso
- Event foi publicado e registrado
- Event status mudou de `pending` → `processed`
- Automation execution foi criada
- Todas as actions executaram com `status: 'success'`

**❌ Teste falhou se:**
- Event ficou em status `pending` (EventBus não está a correr)
- Event mudou para `failed` (erro no processamento)
- Automation execution não foi criada (matching falhou)
- Actions têm status `failed` (erro na execução)

### Troubleshooting

**Problema: "Event NOT processed"**
- **Causa**: EventBus não está a correr
- **Solução**: Verificar se `eventBus.start()` foi chamado no servidor
- **Check**: Ver logs do servidor para confirmar `[EventBus] Starting event processing`

**Problema: "No automation executions found"**
- **Causa**: EventType não match ou automation não está ativa
- **Solução**: Verificar que `triggerConfig.eventType === 'lead.created'`
- **Check**: Confirmar que `isActive: true` na automation

**Problema: "Action failed"**
- **Causa**: Configuração inválida ou dependências em falta
- **Solução**: Ver `errorMessage` e `errorStack` no execution record
- **Check**: Verificar que action está registrada no ActionRegistry

### Cleanup

O teste deixa os dados na base de dados **por default** para que possa inspecionar os resultados.

Para **apagar** a automation de teste automaticamente, descomente esta linha:

```typescript
// Step 6: Cleanup
await db.delete(tenantAutomations).where(eq(tenantAutomations.id, automation.id));
console.log('✅ Test automation deleted');
```

Para **limpar manualmente** via SQL:

```sql
-- Ver automations criadas pelo teste
SELECT * FROM tenant_automations 
WHERE name = 'Test Lead Welcome Email';

-- Apagar automation (e executions via cascade)
DELETE FROM tenant_automations 
WHERE id = 'automation-id-here';
```

### Executar com EventBus ativo

Para testar com o EventBus já a correr (cenário real):

1. **Iniciar servidor** com EventBus ativo:
   ```bash
   npm run dev
   ```

2. **Em outro terminal**, executar o teste:
   ```bash
   npx tsx packages/execution/test-integration.ts
   ```

Neste caso, o evento será processado **quase imediatamente** (via `setImmediate()`) em vez de esperar pelo polling interval.

### Extensões do teste

Pode estender o teste para validar outros cenários:

**Teste múltiplas automations:**
```typescript
// Create 2 automations for same event
const automation1 = await createAutomation('lead.created', actions1);
const automation2 = await createAutomation('lead.created', actions2);

// Publish event
await eventBus.publish(tenantId, 'lead.created', data);

// Expect: automationsTriggered === 2
```

**Teste diferentes event types:**
```typescript
await eventBus.publish(tenantId, 'invoice.approved', invoiceData);
await eventBus.publish(tenantId, 'order.created', orderData);
```

**Teste error handling:**
```typescript
// Create automation with invalid action
const automation = await createAutomation('test.event', [
  { type: 'invalid_action', config: {}, order: 0 }
]);

// Expect: execution.status === 'failed'
```

## WorkflowScheduler

O **WorkflowScheduler** permite executar workflows de forma on-demand ou agendada com cron expressions, similar ao AgentScheduler mas para workflows.

### Features

- ✅ Execute workflows on-demand
- ✅ Schedule workflows with cron expressions  
- ✅ Track executions in workflowExecutions table
- ✅ Integrate with WorkflowExecutor
- ✅ Fetch workflow definitions from database
- ✅ Singleton pattern
- ✅ Error handling completo

### On-Demand Execution

Execute um workflow imediatamente:

```typescript
import { workflowScheduler } from '@/packages/execution';

// Execute workflow now
const executionId = await workflowScheduler.executeNow(
  'workflow-id',      // Workflow ID from tenantWorkflows table
  'tenant-id',        // Tenant ID
  'user-id',          // User ID (for execution context)
  { inputData: 'value' }  // Input data (optional)
);

console.log(`Workflow execution started: ${executionId}`);
```

O `executeNow()` method:
1. Fetches workflow definition from `tenantWorkflows` table
2. Validates that workflow exists and is active
3. Converts database format to `WorkflowDefinition`
4. Delegates execution to WorkflowExecutor
5. Returns execution ID for tracking

### Scheduled Execution

Schedule workflows to run periodically with cron expressions:

```typescript
import { workflowScheduler } from '@/packages/execution';

// Schedule workflow to run daily at 9am
workflowScheduler.scheduleWorkflow(
  'daily-report',           // Unique schedule ID
  'workflow-id',            // Workflow to execute
  'tenant-id',              // Tenant ID
  'user-id',                // User ID (for execution context)
  '0 9 * * *',              // Cron expression (9am daily)
  { reportType: 'daily' }   // Input data (optional)
);

console.log('Workflow scheduled successfully');
```

**Cron Expression Examples:**

- `'0 9 * * *'` - Daily at 9:00 AM
- `'0 */6 * * *'` - Every 6 hours
- `'0 0 * * 1'` - Every Monday at midnight
- `'*/15 * * * *'` - Every 15 minutes
- `'0 0 1 * *'` - First day of every month at midnight

### Managing Scheduled Workflows

```typescript
// Unschedule a workflow
const removed = workflowScheduler.unscheduleWorkflow('daily-report');
console.log(removed ? 'Unscheduled' : 'Not found');

// List all scheduled workflows
const scheduled = workflowScheduler.listScheduled();
console.log('Scheduled workflows:', scheduled);
// Output: [
//   {
//     id: 'daily-report',
//     tenantId: 'tenant-123',
//     workflowId: 'workflow-456',
//     schedule: '0 9 * * *'
//   }
// ]

// Stop all scheduled workflows (useful for graceful shutdown)
workflowScheduler.stopAll();
```

### Execution History

Retrieve execution history for a workflow:

```typescript
import { workflowScheduler } from '@/packages/execution';

// Get last 10 executions
const history = await workflowScheduler.getExecutionHistory(
  'tenant-id',
  'workflow-id',
  10  // Limit (default: 10)
);

console.log('Execution history:', history);
// Output: [
//   {
//     id: 'exec-123',
//     workflowId: 'workflow-456',
//     status: 'completed',
//     startedAt: '2025-11-01T09:00:00Z',
//     completedAt: '2025-11-01T09:01:30Z',
//     stepsExecuted: [...]
//   },
//   ...
// ]
```

### Integration Example

Integrar WorkflowScheduler numa rota API:

```typescript
// apps/api/routes.ts
import { workflowScheduler } from '@/packages/execution';

// Execute workflow on-demand
app.post('/api/workflows/:workflowId/execute', async (req, res) => {
  const { workflowId } = req.params;
  const { input } = req.body;
  
  try {
    const executionId = await workflowScheduler.executeNow(
      workflowId,
      req.user.tenantId,
      req.user.id,
      input
    );
    
    res.json({ executionId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Schedule a workflow
app.post('/api/workflows/:workflowId/schedule', async (req, res) => {
  const { workflowId } = req.params;
  const { scheduleId, cronExpression, input } = req.body;
  
  try {
    workflowScheduler.scheduleWorkflow(
      scheduleId,
      workflowId,
      req.user.tenantId,
      req.user.id,
      cronExpression,
      input
    );
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});
```

### Error Handling

WorkflowScheduler implementa error handling robusto:

```typescript
try {
  const executionId = await workflowScheduler.executeNow(
    'invalid-workflow-id',
    'tenant-123',
    'user-456'
  );
} catch (error: any) {
  console.error('Error:', error.message);
  // Possible errors:
  // - "Workflow not found: invalid-workflow-id"
  // - "Workflow is not active: workflow-123"
}

try {
  workflowScheduler.scheduleWorkflow(
    'my-schedule',
    'workflow-123',
    'tenant-123',
    'user-456',
    'invalid cron',  // ❌ Invalid
    {}
  );
} catch (error: any) {
  console.error('Error:', error.message);
  // Output: "Invalid cron expression: invalid cron"
}
```

### Architecture

```
WorkflowScheduler
├── executeNow()          - Execute workflow immediately
│   ├── Fetch from tenantWorkflows table
│   ├── Validate workflow exists & is active
│   ├── Convert to WorkflowDefinition
│   └── Delegate to WorkflowExecutor
│
├── scheduleWorkflow()    - Schedule periodic execution
│   ├── Validate cron expression
│   ├── Create scheduled task
│   └── Store in scheduledWorkflows Map
│
├── unscheduleWorkflow()  - Stop scheduled workflow
├── listScheduled()       - List all scheduled workflows
├── getExecutionHistory() - Query workflowExecutions table
└── stopAll()             - Stop all scheduled workflows
```

### Comparison: WorkflowScheduler vs AgentScheduler

| Feature | WorkflowScheduler | AgentScheduler |
|---------|------------------|----------------|
| **Purpose** | Execute workflows | Execute agents |
| **Source** | `tenantWorkflows` table | ActionRegistry (run_agent) |
| **Tracking** | `workflowExecutions` | `agentRuns` |
| **Executor** | WorkflowExecutor | ActionRegistry |
| **Scheduling** | ✅ Cron expressions | ✅ Cron expressions |
| **On-demand** | ✅ executeNow() | ✅ executeNow() |

Ambos seguem o mesmo padrão de design para consistência e facilidade de uso.

## Demo: Caso Mafmo

Demonstração end-to-end do Execution Engine através de cenário realista de procurement.

### Cenário

**Situação:** Cotação de fornecedor de alto valor (€50,000) para compra de equipamento CNC

**Fluxo completo:**
1. 📨 **Event** - `supplier.quote.received` publicado no EventBus
2. ⚡ **Automation** - "High-Value Quote Detector" triggers:
   - TransformData: Extrai dados da cotação
   - SendNotification: Alerta procurement + finance
   - CreateRecord: Cria purchase request
3. 📋 **Workflow** - "Multi-Level Approval Process" executa:
   - Manager Approval (wait simulation)
   - Finance Review (data transform)
   - C-Level Decision (notification)
   - Final Approval (status update)
4. 🤖 **Agent** - "Supplier Analyzer" analisa:
   - Multi-turn AI reasoning
   - Supplier reputation check
   - Pricing analysis
   - Approval recommendation
5. 📊 **Monitoring** - Tudo visível em `/admin/monitoring`

### Executar Demo

```bash
npx tsx packages/execution/demo-mafmo.ts
```

**Output esperado:**
- ✅ Demo tenant e user criados automaticamente
- ✅ 2 configurations criadas (automation + workflow)
- ✅ Event processado pelo EventBus
- ✅ Automation executada com 3 actions
- ✅ Workflow completado com 4 steps
- ✅ Agent analysis executada (ou skipped se sem ANTHROPIC_API_KEY)
- ✅ Executions visíveis no monitoring dashboard

**Validação:**
1. Terminal mostra logs detalhados de cada passo
2. Database tem registros em `automation_executions` e `workflow_executions`
3. Dashboard em `http://localhost:5000/admin/monitoring` mostra:
   - Stats cards atualizadas
   - Executions nas tabs correspondentes
   - Status badges corretos

### Arquitetura Demonstrada

```
Event: supplier.quote.received (€50,000 quote)
  ↓
EventBus (polling + processNow)
  ↓
Automation: High-Value Quote Detector
  ├─ transform_data: Extract quote fields
  ├─ send_notification: Alert teams
  └─ log_event: Audit trail
  ↓
Workflow: Multi-Level Approval
  ├─ Step 1: Manager Approval (wait 1s)
  ├─ Step 2: Finance Review (transform)
  ├─ Step 3: C-Level Decision (notify)
  └─ Step 4: Final Approval (complete)
  ↓
Agent: Supplier Analyzer (optional)
  ├─ Analyze quote details
  ├─ Check supplier reputation
  └─ Generate recommendation
  ↓
Monitoring Dashboard
  └─ Real-time stats & execution history
```

### Cleanup

Para limpar demo data:

```sql
DELETE FROM automation_executions WHERE tenant_id = 'demo-mafmo-tenant';
DELETE FROM workflow_executions WHERE tenant_id = 'demo-mafmo-tenant';
DELETE FROM tenant_automations WHERE tenant_id = 'demo-mafmo-tenant';
DELETE FROM tenant_workflows WHERE tenant_id = 'demo-mafmo-tenant';
DELETE FROM tenants WHERE id = 'demo-mafmo-tenant';
DELETE FROM users WHERE id = 'demo-user-mafmo';
```

### Features Demonstradas

- ✅ **EventBus**: Pub/sub event processing
- ✅ **Automations**: Event-triggered actions
- ✅ **Workflows**: Multi-step sequential processes
- ✅ **Agents**: AI-powered analysis (optional)
- ✅ **Action Registry**: Pluggable action system
- ✅ **Database Tracking**: Complete execution audit trail
- ✅ **Error Handling**: Graceful degradation
- ✅ **Monitoring**: Real-time execution visibility

### Notas Técnicas

1. **Demo Tenant**: Criado automaticamente com ID `demo-mafmo-tenant`
2. **Demo User**: Criado automaticamente com ID `demo-user-mafmo`
3. **Agent Execution**: Gracefully skips se `ANTHROPIC_API_KEY` não estiver configurado
4. **Deterministic Testing**: Usa `eventBus.processNow()` para execução síncrona
5. **Database Schema**: Utiliza schema correto com `triggerType`, `triggerConfig`, `nextSteps`, etc.

## Next Steps

1. ✅ ~~Implementar ActionRegistry para executar ações reais~~
2. ✅ ~~Implementar WorkflowScheduler para scheduled workflows~~
3. ✅ ~~Criar demo end-to-end (Caso Mafmo)~~
4. Adicionar suporte a retry policies
5. Implementar conditional branching
6. Adicionar parallel step execution
7. Integrar com EventBus para triggers avançados
