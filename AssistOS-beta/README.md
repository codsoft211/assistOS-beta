# AssistOS - AI-First Enterprise ERP Platform

**AssistOS** é uma plataforma empresarial inteligente que substitui sistemas ERP tradicionais por uma arquitetura AI-first, com três pilares fundamentais:

- **AssistME**: Assistente operacional para tarefas do dia-a-dia
- **AssistBuild**: Criador conversacional de features para configuração da plataforma
- **Self-Evolving Platform**: Base modular que aprende padrões cross-tenant

---

## 🎯 **Visão do Projeto**

AssistOS resolve 7 gaps críticos dos ERPs tradicionais:

1. ✅ **Core Protection** - Anti-regressão de componentes core (COMPLETO)
2. 🔄 **Code Generation & Validation** - Geração de código AI com validação multi-stage
3. 🔄 **Schema Evolution** - Migrações versionadas com rollback
4. 🔄 **Pattern Recognition** - Aprendizagem anónima cross-tenant
5. 🔄 **Sandbox Isolation** - Teste seguro em sandbox antes de produção (COMPLETO)
6. 🔄 **Resource Quotas** - Prevenção de evolução descontrolada
7. 🔄 **Rollback System** - Reverter alterações que quebram o sistema

---

## 🏗️ **Arquitetura**

### **Stack Tecnológica**
- **Backend**: Node.js 20, Express, TypeScript
- **Frontend**: React 18, Wouter, TanStack Query, Tailwind CSS, Shadcn UI
- **Database**: PostgreSQL (Drizzle ORM)
- **AI Models**: 
  - OpenAI GPT-5 (AssistME - tarefas operacionais)
  - Anthropic Claude 3.5 Sonnet (AssistBuild - configuração da plataforma)
- **Job Queue**: BullMQ + Redis
- **Storage**: Google Cloud Storage
- **Auth**: Passport.js (Local + Google OAuth)

### **Estrutura do Projeto**
```
workspace/
├── apps/
│   ├── api/              # Express API server
│   │   ├── bootstrap/    # Core assets auto-registration
│   │   ├── middleware/   # Core protection, tenant isolation
│   │   └── services/     # Business logic
│   └── worker/           # BullMQ background jobs
├── packages/
│   ├── core/             # Core assets manifest (modules, tools, schemas)
│   ├── modules/          # Business modules (Financeiro, Compras, etc.)
│   └── platform/         # Platform services (Dynamic Forms, Notifications)
├── client/
│   └── src/              # React frontend
├── shared/
│   └── schema.ts         # Drizzle database schema
└── server/
    └── index.ts          # Application entry point
```

---

## 🚀 **Quick Start**

### **Pré-requisitos**
- Node.js 20+
- PostgreSQL 14+
- Redis (para BullMQ)

### **Instalação**
```bash
# Clonar o repositório
git clone https://github.com/seu-usuario/assistos.git
cd assistos

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com as tuas credenciais

# Inicializar base de dados
npm run db:push

# Iniciar servidor de desenvolvimento
npm run dev
```

### **Variáveis de Ambiente Essenciais**
```env
DATABASE_URL=postgresql://user:password@host:5432/database
SESSION_SECRET=generate-strong-secret-here
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
REDIS_URL=redis://localhost:6379
```

---

## 📦 **Features Implementadas**

### ✅ **Core Protection System (Gap #1)**
Sistema anti-regressão que protege componentes core da plataforma:
- **19 assets protegidos**: 6 módulos, 7 ferramentas, 6 schemas
- **Políticas de mutabilidade**: `immutable` (schemas) vs. `clone_only` (módulos/tools)
- **Bootstrap idempotente**: Auto-registo em cada startup com fail-safe enforcement
- **Middleware de proteção**: Validação pre-mutação + audit trail

### ✅ **Sandbox Isolation System (Sprint 2.2)**
Isolamento de ambientes para testes seguros:
- **252 tabelas** com coluna `environment` (production/sandbox)
- **Data Access Layer** com 4 query utilities environment-aware
- **Promotion Workflow** com snapshot → diff → dedupe → apply pipeline
- **46+ testes** passando (8 promotion + 18 isolation + 20 middleware)

### ✅ **Dynamic Forms Service**
Sistema de formulários personalizáveis para recolha externa de dados:
- **AI Field Mapping**: Auto-sugestões de mapeamento campo → entidade
- **Multi-Channel**: Distribuição via Email e WhatsApp
- **Public Access**: URLs seguras com tokens para submissão sem autenticação
- **Automated Processing**: Criação automática de entidades (fornecedores, clientes, projetos)

### ✅ **Notification Center Service**
Roteamento multi-canal de notificações:
- **4 canais**: In-app, Email, WhatsApp, SMS
- **User Preferences**: Enable/disable por canal, quiet hours, digest frequency
- **Priority Levels**: low, medium, high, urgent com routing inteligente
- **Retry Logic**: 3 tentativas com exponential backoff

### ✅ **Procurement Module (ComprasModule)**
Gestão de compras AI-driven:
- **Quick Purchase Flow**: Fluxo rápido com OCR de faturas
- **3-Way Matching**: PO → Receção → Fatura
- **Supplier Scoring**: Avaliação automática de fornecedores
- **Demand Forecasting**: Previsão de necessidades

### ✅ **WhatsApp Cloud API Integration**
Comunicação multi-tenant via WhatsApp Business API:
- **Multi-tenant/multi-user**: Configuração dedicada por tenant/utilizador
- **AI Message Classification**: Claude 3.5 Sonnet para categorização
- **Secure Webhooks**: Validação de assinatura Meta

---

## 🧪 **Testing**

```bash
# Testes unitários
npm run test

# Testes de integração
npm run test:integration

# Coverage
npm run test:coverage
```

---

## 📊 **Database Schema**

O projeto usa **Drizzle ORM** com PostgreSQL. Para aplicar alterações ao schema:

```bash
# Sincronizar schema (desenvolvimento)
npm run db:push

# Forçar sincronização (se houver conflitos)
npm run db:push --force
```

**⚠️ NUNCA escrever migrações SQL manualmente!** Usar sempre `db:push`.

---

## 🛡️ **Segurança**

- **Tenant Isolation**: Isolamento rigoroso multi-tenant
- **Core Protection**: Assets core protegidos contra modificação acidental
- **AES-256-GCM**: Encriptação de tokens OAuth
- **Session Management**: Sessões seguras com PostgreSQL store
- **RBAC**: Role-based access control (owner/admin/user)

---

## 📝 **Contribuir**

1. Fork o projeto
2. Cria uma branch para a feature (`git checkout -b feature/amazing-feature`)
3. Commit as alterações (`git commit -m 'Add amazing feature'`)
4. Push para a branch (`git push origin feature/amazing-feature`)
5. Abre um Pull Request

---

## 📄 **Licença**

Este projeto está sob licença MIT. Ver ficheiro `LICENSE` para mais detalhes.

---

## 🤝 **Contacto**

**Projeto**: AssistOS - AI-First Enterprise ERP Platform  
**Documentação Técnica**: Ver `replit.md` para detalhes de arquitetura  
**Status**: MVP Core em desenvolvimento (Semanas 3-5 de 12)

---

## 🗺️ **Roadmap**

### **Fase 1: MVP Core (Semanas 3-5)** ✅ Em Progresso
- [x] Core Protection System (Gap #1)
- [x] Sandbox Isolation System
- [x] Dynamic Forms Service
- [x] Notification Center Service
- [ ] Code Generation & Validation (Gap #2)
- [ ] Schema Evolution (Gap #3)

### **Fase 2: Expansion (Semanas 6-12)**
- [ ] Pattern Recognition (Gap #4)
- [ ] Resource Quotas (Gap #5)
- [ ] Rollback System (Gap #7)
- [ ] Advanced Analytics Dashboard
- [ ] Mobile App (React Native)

---

**Construído com ❤️ para revolucionar ERPs tradicionais**
