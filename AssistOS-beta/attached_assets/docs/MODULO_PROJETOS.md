# 📁 Módulo de Projetos - Documentação Completa

**Versão**: 1.0.0  
**Categoria**: Operações  
**Ícone**: FolderKanban (📁)  
**Status**: ⭐ **PRIMEIRO MÓDULO CONFIGURÁVEL DO ASSISTOS**

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura Configurável](#arquitetura-configurável)
3. [Entidades Core](#entidades-core)
4. [Templates de Indústria](#templates-de-indústria)
5. [Ferramentas AI (AssistME)](#ferramentas-ai-assistme)
6. [API Routes](#api-routes)
7. [Workflows](#workflows)
8. [Permissões](#permissões)
9. [Configuração & Extensão](#configuração--extensão)
10. [Exemplos de Uso](#exemplos-de-uso)

---

## 🎯 Visão Geral

O **Módulo de Projetos** é o **primeiro módulo configurável** do AssistOS, representando um novo paradigma na arquitetura da plataforma. Diferente dos módulos tradicionais, adapta-se automaticamente a diferentes indústrias através de **templates pré-configurados**.

### 🌟 **Características Únicas**

✅ **Configurável**: Sistema de templates para diferentes indústrias  
✅ **Extensível**: Entidades customizáveis por tenant  
✅ **Multi-Indústria**: Templates para Construção, Eventos, Consultoria  
✅ **AI-Powered**: 6 ferramentas AI genéricas que funcionam em qualquer configuração  
✅ **Core + Custom**: 4 entidades core + entidades personalizadas via template  
✅ **Self-Evolving**: Aprende padrões cross-tenant

### **Ficheiros Principais**

- Core: `packages/modules/projetos/index.ts`
- AI Tools: `packages/modules/projetos/tools/index.ts`
- Rotas: `packages/modules/projetos/routes/index.ts`
- Templates: `packages/modules/projetos/templates/`
- Workflows: `packages/modules/projetos/workflows/index.ts`

---

## 🔧 Arquitetura Configurável

### **Paradigma: Core + Custom**

```
┌─────────────────────────────────────────┐
│  MÓDULO PROJETOS                        │
│                                         │
│  ┌──────────────┐   ┌────────────────┐ │
│  │ CORE ENTITIES│   │CUSTOM ENTITIES │ │
│  │ (Imutáveis)  │   │(Via Templates) │ │
│  │              │   │                │ │
│  │ • projects   │   │ • site_info    │ │
│  │ • phases     │   │ • safety_logs  │ │
│  │ • resources  │   │ • equipment    │ │
│  │ • documents  │   │ • vendors      │ │
│  └──────────────┘   └────────────────┘ │
│                                         │
│  ┌──────────────┐   ┌────────────────┐ │
│  │CORE TOOLS    │   │CUSTOM TOOLS    │ │
│  │(6 genéricos) │   │(Via Templates) │ │
│  └──────────────┘   └────────────────┘ │
└─────────────────────────────────────────┘
```

### **Pontos de Extensão**

| Extension Point | Descrição                          | Exemplo                                        |
| --------------- | ---------------------------------- | ---------------------------------------------- |
| `entities`      | Adicionar entidades customizadas   | `site_info`, `equipment_logs`                  |
| `workflows`     | Workflows específicos da indústria | `safety_inspection`, `equipment_certification` |
| `tools`         | AI tools especializadas            | `schedule_site_inspection`, `track_equipment`  |
| `routes`        | API endpoints customizados         | `/api/projetos/sites/:id/safety`               |
| `reports`       | Relatórios específicos             | `safety_compliance_report`                     |

### **Benefícios**

1. ✅ **Zero Código**: Configuração via JSON templates
2. ✅ **Multi-Tenant**: Cada tenant pode ter configuração diferente
3. ✅ **Evolutivo**: Sistema aprende padrões e sugere templates
4. ✅ **Compatível**: Core entities sempre funcionam
5. ✅ **Escalável**: Adicionar novas indústrias sem tocar no código

---

## 📦 Entidades Core

As **4 entidades core** estão sempre presentes e são **imutáveis**. Funcionam em qualquer template/configuração.

### 1. **Projects** (Projetos)

Entidade base para qualquer tipo de projeto.

```typescript
{
  id: string,
  projectCode: string,           // Código único (ex: PROJ-2024-001)
  name: string,                  // Nome do projeto
  description: string,           // Descrição
  clientId: string,              // Referência ao cliente
  startDate: Date,               // Data de início
  endDate: Date,                 // Data de fim
  estimatedBudget: decimal,      // Orçamento estimado
  actualCost: decimal,           // Custo real acumulado
  status: 'Planning' | 'Active' | 'On Hold' | 'Completed' | 'Cancelled',
  priority: 'Low' | 'Medium' | 'High' | 'Critical',
  projectType: string,           // Tipo (Construction, Events, etc)
  tags: string,                  // Tags separadas por vírgula
  notes: string,                 // Notas adicionais
  createdBy: string,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Relacionamentos**:

- `hasMany`: project_phases (via projectId)
- `hasMany`: project_resources (via projectId)
- `hasMany`: project_documents (via projectId)
- `belongsTo`: clients (via clientId)

**Índices**:

- `projectCode` (unique)
- `status`
- `clientId`
- `priority`

**Features**:

- ✅ Soft delete ativado
- ✅ Código único por tenant
- ✅ Tenant isolation

---

### 2. **Project Phases** (Fases do Projeto)

Fases/etapas/milestones do projeto.

```typescript
{
  id: string,
  projectId: string,             // Referência ao projeto
  phaseName: string,             // Nome da fase
  description: string,           // Descrição da fase
  startDate: Date,               // Data de início
  endDate: Date,                 // Data de fim
  status: 'Not Started' | 'In Progress' | 'Completed' | 'Delayed',
  percentComplete: decimal,      // Percentagem concluída (0-100)
  budget: decimal,               // Orçamento da fase
  actualCost: decimal,           // Custo real da fase
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Relacionamentos**:

- `belongsTo`: projects (via projectId)

**Índices**:

- `projectId`
- `status`

**Uso Típico**:

- **Construção**: Fundações → Estrutura → Acabamentos
- **Eventos**: Planeamento → Setup → Evento → Desmontagem
- **Consultoria**: Discovery → Análise → Implementação → Follow-up

---

### 3. **Project Resources** (Recursos do Projeto)

Alocação de recursos (humanos, equipamento, materiais, externos).

```typescript
{
  id: string,
  projectId: string,             // Referência ao projeto
  resourceType: 'Human' | 'Equipment' | 'Material' | 'External',
  resourceName: string,          // Nome do recurso
  quantity: decimal,             // Quantidade alocada
  unit: string,                  // Unidade (horas, dias, kg, m³)
  costPerUnit: decimal,          // Custo por unidade
  totalCost: decimal,            // Custo total (auto-calculado)
  allocationDate: Date,          // Data de alocação
  releaseDate: Date,             // Data de libertação
  status: 'Allocated' | 'In Use' | 'Released',
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Relacionamentos**:

- `belongsTo`: projects (via projectId)

**Índices**:

- `projectId`
- `resourceType`
- `status`

**Validações**:

- ✅ Quantity > 0
- ✅ Auto-cálculo de totalCost

---

### 4. **Project Documents** (Documentos do Projeto)

Gestão de documentação do projeto.

```typescript
{
  id: string,
  projectId: string,             // Referência ao projeto
  documentName: string,          // Nome do documento
  documentType: 'Contract' | 'Proposal' | 'Report' | 'Specification' | 'Drawing' | 'Photo' | 'Other',
  fileUrl: string,               // URL do ficheiro
  uploadedBy: string,            // Quem fez upload
  documentDate: Date,            // Data do documento
  category: string,              // Categoria
  tags: string,                  // Tags
  notes: string,                 // Notas
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Relacionamentos**:

- `belongsTo`: projects (via projectId)

**Índices**:

- `projectId`
- `documentType`

---

## 🏭 Templates de Indústria

O módulo inclui **3 templates pré-configurados** para diferentes indústrias.

### **Template 1: Construction (Construção)**

**ID**: `construction`  
**Indústria**: Construção Civil  
**Descrição**: Gestão de projetos de construção com controlo de obra, segurança e equipamento

**Entidades Customizadas**:

#### 1. `site_information`

```typescript
{
  siteAddress: string,
  siteArea: decimal,           // m²
  permitNumber: string,
  siteManager: string,
  safetyOfficer: string,
  emergencyContact: string,
  accessInstructions: text
}
```

#### 2. `safety_logs`

```typescript
{
  logDate: Date,
  inspectorName: string,
  inspectionType: 'Daily' | 'Weekly' | 'Incident' | 'Audit',
  findings: text,
  hazards: text[],
  correctiveActions: text,
  status: 'Open' | 'Resolved',
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
}
```

#### 3. `equipment_tracking`

```typescript
{
  equipmentName: string,
  equipmentType: string,
  serialNumber: string,
  arrivalDate: Date,
  departureDate: Date,
  operator: string,
  maintenanceStatus: 'OK' | 'Needs Service' | 'Out of Service',
  certificationExpiry: Date
}
```

#### 4. `subcontractors`

```typescript
{
  companyName: string,
  contactPerson: string,
  trade: string,              // Electricista, Canalizador, etc
  contractValue: decimal,
  startDate: Date,
  endDate: Date,
  insuranceExpiry: Date,
  certifications: string[]
}
```

**Workflows Específicos**:

- Safety Inspection Workflow
- Equipment Certification Workflow
- Subcontractor Approval Workflow

**Sugerido Para**:

- Construção civil
- Obras públicas
- Renovações
- Infraestruturas

---

### **Template 2: Events (Eventos)**

**ID**: `events`  
**Indústria**: Gestão de Eventos  
**Descrição**: Produção de eventos corporativos, casamentos, conferências

**Entidades Customizadas**:

#### 1. `event_details`

```typescript
{
  eventType: 'Wedding' | 'Corporate' | 'Conference' | 'Concert' | 'Festival',
  venueName: string,
  venueAddress: string,
  capacity: number,
  eventDate: Date,
  setupTime: timestamp,
  eventTime: timestamp,
  teardownTime: timestamp,
  guestCount: number,
  cateringType: string,
  specialRequirements: text
}
```

#### 2. `vendors`

```typescript
{
  vendorType: 'Catering' | 'AV Equipment' | 'Decoration' | 'Photography' | 'Security' | 'Other',
  vendorName: string,
  contactPerson: string,
  phone: string,
  email: string,
  contractValue: decimal,
  deliveryDate: Date,
  setupRequirements: text,
  status: 'Confirmed' | 'Pending' | 'Cancelled'
}
```

#### 3. `runsheet`

```typescript
{
  timeSlot: timestamp,
  duration: number,            // minutos
  activity: string,
  responsible: string,
  location: string,
  notes: text,
  status: 'Pending' | 'In Progress' | 'Completed'
}
```

#### 4. `attendees`

```typescript
{
  attendeeName: string,
  email: string,
  phone: string,
  ticketType: string,
  dietaryRequirements: string,
  accessibility: string,
  rsvpStatus: 'Confirmed' | 'Pending' | 'Declined',
  checkedIn: boolean,
  checkInTime: timestamp
}
```

**Workflows Específicos**:

- Vendor Confirmation Workflow
- Runsheet Approval Workflow
- Guest Check-in Workflow

**Sugerido Para**:

- Casamentos
- Eventos corporativos
- Conferências
- Festivais

---

### **Template 3: Consulting (Consultoria)**

**ID**: `consulting`  
**Indústria**: Consultoria & Serviços Profissionais  
**Descrição**: Projetos de consultoria com deliverables, timesheet e faturação

**Entidades Customizadas**:

#### 1. `deliverables`

```typescript
{
  deliverableName: string,
  description: text,
  dueDate: Date,
  deliveryDate: Date,
  status: 'Planned' | 'In Progress' | 'Review' | 'Delivered' | 'Approved',
  assignedTo: string,
  approvedBy: string,
  fileUrl: string,
  feedback: text
}
```

#### 2. `timesheets`

```typescript
{
  consultantId: string,
  consultantName: string,
  workDate: Date,
  hoursWorked: decimal,
  taskDescription: text,
  billable: boolean,
  hourlyRate: decimal,
  totalAmount: decimal,
  status: 'Draft' | 'Submitted' | 'Approved' | 'Invoiced'
}
```

#### 3. `client_meetings`

```typescript
{
  meetingDate: timestamp,
  meetingType: 'Kickoff' | 'Status Update' | 'Review' | 'Presentation' | 'Other',
  attendees: string[],
  agenda: text,
  minutes: text,
  actionItems: jsonb[],
  nextMeeting: timestamp
}
```

#### 4. `change_requests`

```typescript
{
  requestDate: Date,
  requestedBy: string,
  changeDescription: text,
  impactAnalysis: text,
  budgetImpact: decimal,
  timelineImpact: number,      // dias
  status: 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'Implemented',
  approvedBy: string,
  implementationDate: Date
}
```

**Workflows Específicos**:

- Deliverable Approval Workflow
- Timesheet Approval Workflow
- Change Request Workflow

**Sugerido Para**:

- Consultoria de gestão
- Consultoria IT
- Design & Criativo
- Serviços profissionais

---

## 🤖 Ferramentas AI (AssistME)

O módulo disponibiliza **6 ferramentas AI genéricas** que funcionam em **qualquer template**:

### 1. **list_projects**

Lista projetos com filtros avançados.

**Parâmetros**:

- `status` (opcional): Filtrar por status
- `priority` (opcional): Low, Medium, High, Critical
- `clientId` (opcional): Filtrar por cliente
- `startDateFrom` (opcional): Data mínima de início
- `startDateTo` (opcional): Data máxima de início
- `limit` (opcional): Resultados (default: 50)
- `offset` (opcional): Paginação (default: 0)

**Exemplo de Uso**:

```
User: "Mostra-me os projetos ativos de alta prioridade"
AssistME: [usa list_projects com status="active", priority="High"]
```

**Response**:

```json
{
  "projects": [...],
  "total": 12,
  "limit": 50,
  "offset": 0
}
```

---

### 2. **create_project**

Cria um novo projeto com validação completa.

**Parâmetros**:

- `projectCode` (obrigatório): Código único (ex: PROJ-2024-001)
- `name` (obrigatório): Nome do projeto
- `description` (opcional): Descrição
- `clientId` (opcional): ID do cliente
- `startDate` (opcional): Data de início (ISO)
- `endDate` (opcional): Data de fim (ISO)
- `estimatedBudget` (opcional): Orçamento estimado
- `status` (opcional): planning, active, completed (default: planning)
- `priority` (opcional): Low, Medium, High, Critical (default: Medium)
- `projectType` (opcional): Tipo de projeto
- `tags` (opcional): Tags separadas por vírgula
- `notes` (opcional): Notas adicionais

**Validações**:

- ✅ `projectCode` único por tenant
- ✅ `clientId` existe (se fornecido)
- ✅ Datas válidas

**Exemplo de Uso**:

```
User: "Cria um projeto de construção 'Edifício Central' código CONST-2024-01 para cliente ABC"
AssistME: [usa create_project com projectCode="CONST-2024-01", name="Edifício Central", ...]
```

**Response**:

```json
{
  "success": true,
  "project": {
    "id": "uuid...",
    "projectCode": "CONST-2024-01",
    "name": "Edifício Central",
    "status": "planning",
    "priority": "Medium",
    "estimatedBudget": 500000,
    "startDate": "2024-03-01",
    "endDate": "2024-12-31"
  }
}
```

---

### 3. **update_project_status**

Atualiza status do projeto com tracking de transições.

**Parâmetros**:

- `projectId` (obrigatório): ID do projeto
- `newStatus` (obrigatório): planning, active, completed, on-hold, cancelled
- `notes` (opcional): Motivo da mudança

**Features**:

- ✅ Regista transição no histórico
- ✅ Append automático em project.notes com timestamp
- ✅ Validação de tenant ownership

**Exemplo de Uso**:

```
User: "Ativa o projeto CONST-2024-01"
AssistME: [usa update_project_status com projectId, newStatus="active"]
```

**Response**:

```json
{
  "success": true,
  "project": {
    "id": "uuid...",
    "name": "Edifício Central",
    "oldStatus": "planning",
    "newStatus": "active",
    "updatedAt": "2024-01-20T10:30:00Z"
  },
  "message": "Status do projeto 'Edifício Central' mudou de 'planning' para 'active'"
}
```

---

### 4. **allocate_resources**

Aloca recursos (humanos, equipamento, materiais, externos) ao projeto.

**Parâmetros**:

- `projectId` (obrigatório): ID do projeto
- `resourceType` (obrigatório): Human, Equipment, Material, External
- `resourceName` (obrigatório): Nome do recurso
- `quantity` (obrigatório): Quantidade (>0)
- `unit` (opcional): Unidade (horas, dias, kg, m³)
- `costPerUnit` (opcional): Custo por unidade
- `allocationDate` (opcional): Data (default: hoje)

**Auto-Cálculo**:

- `totalCost` = quantity × costPerUnit

**Validações**:

- ✅ Quantity > 0
- ✅ Projeto existe e pertence ao tenant

**Exemplo de Uso**:

```
User: "Aloca um engenheiro 160 horas a €75/hora ao projeto CONST-2024-01"
AssistME: [usa allocate_resources com resourceType="Human", resourceName="Engenheiro", quantity=160, unit="horas", costPerUnit=75]
```

**Response**:

```json
{
  "success": true,
  "resource": {
    "id": "uuid...",
    "projectId": "uuid...",
    "projectName": "Edifício Central",
    "resourceType": "Human",
    "resourceName": "Engenheiro",
    "quantity": 160,
    "unit": "horas",
    "costPerUnit": 75,
    "totalCost": 12000,
    "allocationDate": "2024-01-20"
  },
  "message": "Recurso 'Engenheiro' (Human) alocado ao projeto 'Edifício Central'"
}
```

---

### 5. **track_project_budget**

Overview completo do orçamento: estimado vs real.

**Parâmetros**:

- `projectId` (obrigatório): ID do projeto

**Métricas Calculadas**:

- Orçamento estimado
- Custo real (actualCost)
- Recursos alocados (soma de project_resources.totalCost)
- Variância (estimado - real)
- % Utilização
- Over budget? (boolean)
- Orçamento restante

**Exemplo de Uso**:

```
User: "Qual é o status do orçamento do projeto CONST-2024-01?"
AssistME: [usa track_project_budget com projectId]
```

**Response**:

```json
{
  "success": true,
  "budget": {
    "projectId": "uuid...",
    "projectName": "Edifício Central",
    "projectCode": "CONST-2024-01",
    "status": "active",
    "estimatedBudget": 500000,
    "actualCost": 125000,
    "allocatedResourcesCost": 150000,
    "variance": 375000,
    "utilizationPercentage": 25.0,
    "isOverBudget": false,
    "budgetRemaining": 375000
  }
}
```

---

### 6. **generate_project_analytics**

Analytics agregadas de todos os projetos.

**Parâmetros**:

- `groupBy` (opcional): status, priority, projectType
- `dateRange` (opcional): { from: date, to: date }

**Métricas**:

- Total de projetos
- Projetos por status
- Projetos por prioridade
- Projetos por tipo (se groupBy='projectType')
- Total de orçamentos
- Total de custos
- Duração média dos projetos

**Exemplo de Uso**:

```
User: "Dá-me um resumo de todos os projetos ativos"
AssistME: [usa generate_project_analytics com dateRange]
```

**Response**:

```json
{
  "success": true,
  "analytics": {
    "totalProjects": 45,
    "projectsByStatus": {
      "planning": 8,
      "active": 12,
      "completed": 20,
      "on-hold": 3,
      "cancelled": 2
    },
    "projectsByPriority": {
      "Low": 5,
      "Medium": 25,
      "High": 12,
      "Critical": 3
    },
    "totalEstimatedBudget": 2500000,
    "totalActualCost": 1800000,
    "averageDuration": 180,
    "period": {
      "from": "2024-01-01",
      "to": "2024-12-31"
    }
  }
}
```

---

## 🌐 API Routes

O módulo expõe **28 endpoints REST** completos com validação Zod.

### **Projects Endpoints**

| Método | Endpoint                            | Handler             | Descrição                                   |
| ------ | ----------------------------------- | ------------------- | ------------------------------------------- |
| GET    | `/api/projetos/projects`            | listProjects        | Lista todos os projetos (filtros opcionais) |
| GET    | `/api/projetos/projects/:id`        | getProject          | Detalhes de um projeto                      |
| POST   | `/api/projetos/projects`            | createProject       | Cria novo projeto                           |
| PUT    | `/api/projetos/projects/:id`        | updateProject       | Atualiza projeto                            |
| DELETE | `/api/projetos/projects/:id`        | deleteProject       | Elimina projeto                             |
| PATCH  | `/api/projetos/projects/:id/status` | updateProjectStatus | Atualiza apenas status                      |

### **Phases Endpoints**

| Método | Endpoint                                   | Handler           | Descrição              |
| ------ | ------------------------------------------ | ----------------- | ---------------------- |
| GET    | `/api/projetos/projects/:projectId/phases` | listProjectPhases | Lista fases do projeto |
| POST   | `/api/projetos/projects/:projectId/phases` | createPhase       | Cria nova fase         |
| PUT    | `/api/projetos/phases/:id`                 | updatePhase       | Atualiza fase          |
| DELETE | `/api/projetos/phases/:id`                 | deletePhase       | Elimina fase           |

### **Resources Endpoints**

| Método | Endpoint                                      | Handler              | Descrição                 |
| ------ | --------------------------------------------- | -------------------- | ------------------------- |
| GET    | `/api/projetos/projects/:projectId/resources` | listProjectResources | Lista recursos do projeto |
| POST   | `/api/projetos/projects/:projectId/resources` | allocateResource     | Aloca recurso             |
| PUT    | `/api/projetos/resources/:id`                 | updateResource       | Atualiza recurso          |
| DELETE | `/api/projetos/resources/:id`                 | removeResource       | Remove recurso            |

### **Documents Endpoints**

| Método | Endpoint                                      | Handler                | Descrição         |
| ------ | --------------------------------------------- | ---------------------- | ----------------- |
| GET    | `/api/projetos/projects/:projectId/documents` | listProjectDocuments   | Lista documentos  |
| POST   | `/api/projetos/projects/:projectId/documents` | uploadDocument         | Upload documento  |
| PUT    | `/api/projetos/documents/:id`                 | updateDocumentMetadata | Atualiza metadata |
| DELETE | `/api/projetos/documents/:id`                 | deleteDocument         | Elimina documento |

### **Templates Endpoints**

| Método | Endpoint                                    | Handler       | Descrição                   |
| ------ | ------------------------------------------- | ------------- | --------------------------- |
| GET    | `/api/projetos/templates`                   | listTemplates | Lista templates disponíveis |
| GET    | `/api/projetos/templates/:templateId`       | getTemplate   | Detalhes de um template     |
| POST   | `/api/projetos/templates/:templateId/apply` | applyTemplate | Aplica template ao tenant   |

### **Configuration Endpoints**

| Método | Endpoint                               | Handler               | Descrição                            |
| ------ | -------------------------------------- | --------------------- | ------------------------------------ |
| GET    | `/api/projetos/configuration`          | getConfiguration      | Configuração atual do módulo         |
| POST   | `/api/projetos/configuration/validate` | validateConfiguration | Valida configuração antes de aplicar |
| GET    | `/api/projetos/entities`               | listEntities          | Lista entidades (core + custom)      |

---

## 🔄 Workflows

**Status Atual**: Stub implementation (planeado para próximas iterações)

### **Workflows Planeados**

#### 1. **Project Lifecycle**

Estados e transições do projeto.

```
Planning → Active → On Hold → Completed
                  ↘         ↗
                    Cancelled
```

**Estados**:

- 🔵 **Planning**: Estado inicial, planeamento
- 🟢 **Active**: Projeto ativo, em execução
- 🟡 **On Hold**: Pausado temporariamente
- ✅ **Completed**: Concluído (estado final)
- ❌ **Cancelled**: Cancelado (estado final)

**Transições**:

- `start_project`: Planning → Active
- `pause_project`: Active → On Hold
- `resume_project`: On Hold → Active
- `complete_project`: Active → Completed
- `cancel_project`: \* → Cancelled

---

#### 2. **Phase Progress**

Progresso das fases do projeto.

```
Not Started → In Progress → Completed
                          ↘
                            Delayed
```

**Estados**:

- ⚪ **Not Started**: Fase ainda não iniciada
- 🔵 **In Progress**: Fase em curso
- ✅ **Completed**: Fase concluída
- ⚠️ **Delayed**: Fase atrasada

---

#### 3. **Resource Lifecycle**

Ciclo de vida dos recursos.

```
Allocated → In Use → Released
```

**Estados**:

- 📌 **Allocated**: Recurso alocado ao projeto
- 🔄 **In Use**: Recurso em utilização
- ✅ **Released**: Recurso libertado

---

#### 4. **Document Workflow**

Aprovação de documentos.

```
Draft → Review → Approved → Published
               ↘
                 Rejected
```

---

## 🔐 Permissões

O módulo implementa **4 permissões** base:

| Chave                | Nome                  | Descrição                                      |
| -------------------- | --------------------- | ---------------------------------------------- |
| `projects.read`      | Ver projetos          | Acesso leitura a projetos e dados relacionados |
| `projects.write`     | Criar/editar projetos | Criar e modificar projetos, fases, recursos    |
| `projects.delete`    | Eliminar projetos     | Apagar projetos e dados relacionados           |
| `projetos.configure` | Configurar módulo     | Aplicar templates, modificar configuração      |

---

## ⚙️ Configuração & Extensão

### **Como Aplicar um Template**

#### **Opção 1: Via AssistBuild (Conversational)**

```
User (no Studio): "Configura o módulo de Projetos para construção"
AssistBuild: [identifica template 'construction']
AssistBuild: "Vou configurar o módulo com o template de Construção.
              Isto adiciona entidades para:
              - Informação da obra
              - Logs de segurança
              - Tracking de equipamento
              - Subcontratores

              Confirmas?"
User: "Sim"
AssistBuild: [aplica template via módulo.configure()]
```

#### **Opção 2: Via API**

```typescript
POST /api/projetos/templates/construction/apply
{
  "tenantId": "abc-123",
  "customSettings": {
    "enableSafetyLogs": true,
    "requirePermits": true
  }
}
```

#### **Opção 3: Programático**

```typescript
const projetosModule = createProjetosModule();
await projetosModule.initialize(tenantId);

await projetosModule.configure({
  templateId: "construction",
  customEntities: [
    // Entidades adicionais customizadas
  ],
  enabledFeatures: ["safety_logs", "equipment_tracking"],
});
```

---

### **Como Criar um Template Customizado**

Se nenhum template existente serve, pode criar um novo:

```json
{
  "id": "real_estate",
  "name": "Imobiliário",
  "version": "1.0.0",
  "category": "real_estate",
  "description": "Gestão de projetos imobiliários: vendas, arrendamento, manutenção",
  "suggestedFor": ["Real Estate", "Property Management", "Leasing"],
  "configuration": {
    "customEntities": [
      {
        "name": "properties",
        "schema": {
          "fields": [
            { "name": "propertyType", "type": "enum", "options": ["Apartment", "House", "Commercial"] },
            { "name": "address", "type": "text", "required": true },
            { "name": "bedrooms", "type": "number" },
            { "name": "bathrooms", "type": "number" },
            { "name": "area", "type": "decimal" },
            { "name": "price", "type": "decimal", "required": true },
            { "name": "status", "type": "enum", "options": ["Available", "Reserved", "Sold", "Rented"] }
          ],
          "timestamps": true,
          "tenantIsolation": true
        }
      }
    ],
    "customWorkflows": [...],
    "customTools": [...]
  }
}
```

Salvar em: `packages/modules/projetos/templates/real_estate.json`

---

### **Pattern Recognition (Self-Evolving)**

O sistema aprende padrões cross-tenant:

```
Tenant A (Construção) → Adiciona entity "site_safety_equipment"
Tenant B (Construção) → Adiciona entity "safety_equipment_log"
Tenant C (Construção) → Adiciona entity "construction_safety"

Pattern Recognition Engine:
→ Detecta padrão: 70% dos tenants de construção adicionam entities de "safety"
→ Sugere ao Tenant D: "Queres adicionar tracking de segurança? 70% dos tenants similares usam"
→ Opcional: Cria template "construction_v2" com safety entities incluídas
```

---

## 💡 Exemplos de Uso

### **Exemplo 1: Criar Projeto de Construção**

**Chat do Utilizador**:

```
User: "Cria um projeto de construção 'Torres Gémeas' código CONST-2025-01
       para o cliente BuildCo, início 1 março, fim 31 dezembro,
       orçamento €2.5M, prioridade alta"
```

**AssistME executa**:

```typescript
// Tool: create_project
{
  projectCode: "CONST-2025-01",
  name: "Torres Gémeas",
  clientId: "uuid-buildco",
  startDate: "2025-03-01",
  endDate: "2025-12-31",
  estimatedBudget: 2500000,
  priority: "High",
  projectType: "Construction"
}
```

**Resultado**:

```
✅ Projeto 'Torres Gémeas' criado com sucesso!

Código: CONST-2025-01
Cliente: BuildCo
Orçamento: €2,500,000
Duração: 1 Março - 31 Dezembro (10 meses)
Prioridade: Alta
Status: Planning

Próximo passo: Queres que crie as fases do projeto?
```

---

### **Exemplo 2: Alocar Recursos (Template Construction)**

**Chat do Utilizador**:

```
User: "Aloca ao projeto Torres Gémeas:
       - 1 escavadora por 30 dias a €500/dia
       - 5 pedreiros por 120 dias a €150/dia cada
       - 200 sacos de cimento a €10/saco"
```

**AssistME executa (3 calls)**:

```typescript
// 1. Equipment
{
  projectId: "uuid...",
  resourceType: "Equipment",
  resourceName: "Escavadora",
  quantity: 30,
  unit: "dias",
  costPerUnit: 500
}

// 2. Human
{
  projectId: "uuid...",
  resourceType: "Human",
  resourceName: "Pedreiros",
  quantity: 600,        // 5 pedreiros × 120 dias
  unit: "dias-homem",
  costPerUnit: 150
}

// 3. Material
{
  projectId: "uuid...",
  resourceType: "Material",
  resourceName: "Cimento",
  quantity: 200,
  unit: "sacos",
  costPerUnit: 10
}
```

**Resultado**:

```
✅ Recursos alocados com sucesso ao projeto 'Torres Gémeas':

1. Escavadora (Equipment)
   - 30 dias × €500 = €15,000

2. Pedreiros (Human)
   - 600 dias-homem × €150 = €90,000

3. Cimento (Material)
   - 200 sacos × €10 = €2,000

TOTAL RECURSOS: €107,000
Orçamento restante: €2,393,000 (95.7%)
```

---

### **Exemplo 3: Tracking de Orçamento**

**Chat do Utilizador**:

```
User: "Qual é o status do orçamento do Torres Gémeas?"
```

**AssistME executa**:

```typescript
// Tool: track_project_budget
{
  projectId: "uuid-torres-gemeas";
}
```

**Resultado**:

```
📊 Status Orçamento - Torres Gémeas (CONST-2025-01)

Orçamento Estimado: €2,500,000
Custo Real Acumulado: €350,000
Recursos Alocados: €575,000

Variância: €2,150,000
Utilização: 14% do orçamento
Status: ✅ Dentro do orçamento

Orçamento Restante: €2,150,000

Breakdown por tipo de recurso:
- Equipment: €95,000 (16.5%)
- Human: €450,000 (78.3%)
- Material: €30,000 (5.2%)
```

---

### **Exemplo 4: Analytics de Todos os Projetos**

**Chat do Utilizador**:

```
User: "Dá-me um resumo de todos os projetos de construção este ano"
```

**AssistME executa**:

```typescript
// Tool: generate_project_analytics
{
  groupBy: "projectType",
  dateRange: {
    from: "2025-01-01",
    to: "2025-12-31"
  }
}
```

**Resultado**:

```
📈 Analytics - Projetos 2025

Total de Projetos: 18

Por Status:
├─ Planning: 3 projetos
├─ Active: 8 projetos
├─ Completed: 5 projetos
├─ On Hold: 1 projeto
└─ Cancelled: 1 projeto

Por Prioridade:
├─ Critical: 2 projetos
├─ High: 6 projetos
├─ Medium: 8 projetos
└─ Low: 2 projetos

Financeiro:
├─ Orçamento Total Estimado: €12,500,000
├─ Custo Real Acumulado: €7,800,000
└─ Utilização Média: 62.4%

Duração Média: 245 dias

Projetos Over Budget: 1 (5.6%)
Projetos Atrasados: 2 (11.1%)
```

---

### **Exemplo 5: Aplicar Template via AssistBuild**

**No Studio / Configuração de Módulos**:

```
User: "Quero configurar o módulo de Projetos para gerir eventos"
AssistBuild: Encontrei o template 'Events' perfeito para ti!

Este template adiciona:
✅ Detalhes do evento (tipo, venue, capacidade)
✅ Gestão de vendors (catering, AV, decoração)
✅ Runsheet (timeline do evento)
✅ Gestão de convidados (RSVP, check-in)
✅ 3 workflows especializados

Queres aplicar?

User: "Sim, aplica"
AssistBuild: [aplica template 'events']

✅ Template aplicado com sucesso!

Agora podes criar projetos de eventos com:
- Casamentos
- Conferências
- Festivais
- Eventos corporativos

As 4 novas entidades já estão disponíveis no AssistME.
Queres que crie um projeto exemplo?
```

---

## 📊 Métricas & Analytics

### **Métricas Disponíveis**

Via `exposeData().aggregate()`:

| Métrica           | Descrição                             |
| ----------------- | ------------------------------------- |
| `total_projects`  | Total de projetos criados             |
| `active_projects` | Projetos com status=Active            |
| `total_budget`    | Soma de todos os orçamentos estimados |
| `total_phases`    | Total de fases criadas                |
| `total_resources` | Total de recursos alocados            |
| `total_documents` | Total de documentos no sistema        |

**Exemplo**:

```typescript
const activeCount = await projetosData.aggregate("active_projects");
// Output: 12
```

---

## 🔒 Segurança

### **Tenant Isolation**

✅ **Todas** as entidades core têm `tenantId`  
✅ **Todos** os queries filtram por `tenantId`  
✅ **Todas** as ferramentas AI validam tenant ownership  
✅ **Soft delete** ativo em `projects` table

**Exemplo de Validação**:

```typescript
// Na tool create_project
const existingProject = await db
  .select({ id: projects.id })
  .from(projects)
  .where(
    and(
      eq(projects.tenantId, context.tenantId), // ✅ SECURITY
      eq(projects.projectCode, projectCode)
    )
  )
  .limit(1);
```

### **Validações**

- ✅ `projectCode` único por tenant
- ✅ Foreign keys validadas (clientId, projectId)
- ✅ Quantity > 0 em resources
- ✅ Dates em formato ISO
- ✅ Enums validados via Zod

---

## 🚀 Roadmap

### **Fase 1: Core** ✅ (Concluído)

- [x] 4 entidades core
- [x] 6 AI tools genéricas
- [x] 3 templates (Construction, Events, Consulting)
- [x] API routes completas
- [x] Sistema de configuração

### **Fase 2: Workflows** 🔄 (Em Planeamento)

- [ ] Implementar workflows completos
- [ ] Automações (email, notificações)
- [ ] SLA tracking

### **Fase 3: Advanced Features** 📅 (Futuro)

- [ ] Gantt charts / Timeline view
- [ ] Resource conflict detection
- [ ] Budget forecasting (AI-powered)
- [ ] Template marketplace
- [ ] Pattern recognition engine
- [ ] Cross-project analytics
- [ ] Mobile app para field workers

---

## 📞 Suporte

**Ficheiros Relevantes**:

- Core: `packages/modules/projetos/`
- Database Schema: `shared/schema.ts` (search for "projects", "projectPhases", "projectResources")
- Frontend: `client/src/pages/projetos.tsx`
- Templates: `packages/modules/projetos/templates/`
- API Routes: Registados via módulo

**Debug Mode**:

```typescript
// Ativar logging detalhado
process.env.DEBUG_PROJETOS = "true";
```

---

**Última Atualização**: Janeiro 2025  
**Versão do Documento**: 1.0.0  
**Status**: ⭐ Primeiro Módulo Configurável do AssistOS
