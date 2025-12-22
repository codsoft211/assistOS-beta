# Análise Completa: Fluxo de Onboarding de Tenant (Do Zero)

**Data:** 18 Novembro 2025  
**Status:** ✅ Servidor rodando sem erros  
**Objetivo:** Documentar o que falta para ter um tenant completamente funcional desde o registo inicial

---

## 📋 FASE 1: Registo Inicial (✅ IMPLEMENTADO)

### 1.1 Conversa de Onboarding (Pré-Registo)
**Rota:** `POST /api/onboarding/chat`  
**Status:** ✅ Totalmente funcional  
**Componente:** AssistStart (GPT-4o)

**Fluxo:**
1. Utilizador inicia conversa sem autenticação
2. AssistStart pergunta sobre empresa/negócio
3. Deteta automaticamente nome de empresa via NLP
4. Pesquisa informação online (Perplexity - STUB)
5. Guarda contexto em `onboarding_cache` (por sessionId)
6. Quando pronto, mostra formulário de registo

**Ferramentas AI:**
- ✅ `search_company_info` - Pesquisa Perplexity (stub)
- ✅ `save_onboarding_context` - Guarda dados temporários
- ✅ `show_register_form` - Aciona UI de registo

**Dados Guardados em Cache:**
```typescript
{
  companyName: string;
  industry?: string;
  businessType?: string;
  notes?: string;
}
```

### 1.2 Criação de Conta + Tenant
**Rota:** `POST /api/auth/register`  
**Status:** ✅ Totalmente funcional

**Dados Necessários:**
```typescript
{
  email: string;                 // ✅ Campo obrigatório
  firstName: string;             // ✅ Campo obrigatório
  lastName: string;              // ✅ Campo obrigatório
  password: string;              // ✅ Min 6 caracteres
  organizationName: string;      // ✅ Campo obrigatório
}
```

**O que acontece automaticamente:**
1. ✅ Cria utilizador em `users`
2. ✅ Verifica se é primeiro utilizador → `isPlatformAdmin: true`
3. ✅ Cria tenant em `tenants` com:
   - `name`: organizationName
   - `slug`: auto-gerado (unique)
   - `status`: "active"
   - `tier`: "default"
   - `country`: "PT"
   - `currency`: "EUR"
   - `timezone`: "Europe/Lisbon"
   - `accountingStandard`: "SNC"
4. ✅ Adiciona utilizador ao tenant em `user_tenants`:
   - `role`: "owner"
   - `scopes`: Default owner scopes
   - `activeEnvironment`: "sandbox" (para Configuration Studio)
5. ✅ Cria storage provider local em `tenant_storage_providers`
6. ⚠️ Converte `onboarding_cache` → `company_info` (DESATIVADO - tenant-storage em _legacy/)
7. ✅ Cria sessão autenticada
8. ✅ Retorna user + tenant

---

## ❌ FASE 2: Pós-Registo - O QUE FALTA

### 2.1 Informação da Empresa (❌ INCOMPLETO)

**Tabela:** `company_info`  
**Status:** ⚠️ NÃO é criada automaticamente no registo

**Campos Essenciais Faltando:**
```typescript
{
  tenantId: string;              // ✅ Preenchido automaticamente
  name: string;                  // ❌ Vazio (deve vir de organizationName)
  brandName?: string;            // ❌ Vazio
  legalName?: string;            // ❌ Vazio
  nif?: string;                  // ❌ CRÍTICO para Portugal
  address?: string;              // ❌ Necessário
  city?: string;                 // ❌ Necessário
  postalCode?: string;           // ❌ Necessário
  country?: string;              // ✅ Default "Portugal"
  phone?: string;                // ❌ Útil
  email?: string;                // ❌ Email de contato empresa
  website?: string;              // ❌ Útil
  sector?: string;               // ⚠️ Pode vir de onboarding_cache
  businessType?: string;         // ⚠️ Pode vir de onboarding_cache
  businessDescription?: string;  // ❌ Útil
  onboardingContext?: {          // ⚠️ Pode vir de onboarding_cache
    businessType?: string;
    mainChallenges?: string[];
    currentProcess?: string;
    goals?: string[];
    teamSize?: number;
  }
}
```

**Problema Atual:**
- ❌ `company_info` NÃO é criada durante registo
- ❌ Conversão de `onboarding_cache` está DESATIVADA (tenant-storage em _legacy/)
- ❌ Utilizador fica sem informação de empresa configurada

**Solução Necessária:**
1. ✅ Reativar conversão `onboarding_cache` → `company_info`
2. ✅ Criar wizard pós-registo para preencher dados faltantes
3. ✅ Usar `bootstrap_tenant` AI tool (existe mas não é chamado)

### 2.2 Módulos Ativos (❌ VAZIO)

**Campo:** `tenants.activeModules`  
**Tipo:** `jsonb` (array de strings)  
**Status:** ❌ Array vazio por default

**Módulos Disponíveis:**
```typescript
[
  "crm",              // ✅ Registrado
  "financial",        // ✅ Registrado
  "logistics",        // ✅ Registrado
  "projects",         // ✅ Registrado
  "purchasing",       // ✅ Registrado
  "lead-generation",  // ✅ Registrado
  "hr",               // ✅ Registrado
  "production",       // ✅ Registrado
  "accounting"        // ✅ Registrado
]
```

**Problema Atual:**
- ❌ Nenhum módulo é ativado automaticamente
- ❌ Utilizador precisa ativar manualmente (como?)
- ❌ Não há wizard de seleção de módulos

**Solução Necessária:**
1. ✅ Criar wizard "Que módulos precisa?" após registo
2. ✅ Ativar módulos via AI tool `activate_module` (existe)
3. ✅ Ou ativar módulos básicos por padrão (CRM, Financial, Projects)

### 2.3 Warehouse Padrão (⚠️ DESATIVADO)

**Tabela:** `warehouses`  
**Status:** ⚠️ Criação está COMENTADA no código

```typescript
// QUARANTINED: inventory service not yet migrated
// TODO: Re-enable after inventory service migration (Phase 4.x)
// await inventoryService.createWarehouse({
//   tenantId: tenant.id,
//   name: 'Armazém Principal',
//   code: 'MAIN',
//   description: 'Armazém principal da organização',
//   isDefault: true,
// });
```

**Problema:**
- ❌ Módulo Logistics precisa de warehouse
- ❌ `inventoryService` não está migrado

**Solução:**
1. ✅ Migrar `inventoryService` 
2. ✅ Criar warehouse padrão automaticamente
3. ✅ Ou usar AI tool `configure_warehouse` (existe)

### 2.4 Primeiros Dados de Teste (❌ NENHUM)

**Status:** ❌ Tenant fica completamente vazio

**O que falta:**
- ❌ Clientes de exemplo
- ❌ Produtos de exemplo
- ❌ Projetos de exemplo
- ❌ Dados de demonstração

**Solução:**
1. ✅ Criar seed data opcional (flag "Incluir dados de exemplo?")
2. ✅ Usar AI tools para popular via AssistBuild

---

## ✅ FASE 3: Ferramentas AI Disponíveis (Para Bootstrap)

### 3.1 Configuration Tools (AssistBuild)

**Disponíveis:**
1. ✅ `bootstrap_tenant` - Inicializa tenant (cria company_info + blueprint)
2. ✅ `configure_company_info` - Atualiza informação da empresa
3. ✅ `activate_module` - Ativa módulo
4. ✅ `deactivate_module` - Desativa módulo
5. ✅ `configure_module_settings` - Configura módulo
6. ✅ `setup_connector` - Configura integração externa
7. ✅ `validate_tenant_configuration` - Valida configuração

**Problema:**
- ⚠️ Tools existem mas NÃO são chamadas automaticamente
- ⚠️ Utilizador precisa ir ao Studio manualmente
- ⚠️ Não há wizard guiado

### 3.2 Logistics Configuration Tools

**Disponíveis:**
1. ✅ `configure_logistics_module` - Configura módulo logística
2. ✅ `configure_warehouse` - Cria/configura armazém
3. ✅ `setup_reorder_rules` - Regras de reabastecimento

---

## 🔧 FLUXO IDEAL (O QUE DEVERIA ACONTECER)

### Passo 1: Conversa de Onboarding ✅
- Utilizador conversa com AssistStart
- Sistema recolhe: nome empresa, setor, tipo negócio
- Guarda em `onboarding_cache`

### Passo 2: Registo de Conta ✅
- Utilizador preenche: email, nome, password, nome organização
- Sistema cria: user + tenant + user_tenants + storage_provider

### Passo 3: Conversão de Dados ❌ FALTA
**Atual:** Desativado  
**Ideal:**
1. Converter `onboarding_cache` → `company_info`
2. Popular campos: name, sector, businessType, onboardingContext

### Passo 4: Wizard de Configuração ❌ FALTA
**Atual:** Não existe  
**Ideal:**
1. Wizard multi-step após primeiro login:
   - **Passo 1:** Confirmar dados da empresa (NIF, morada, etc)
   - **Passo 2:** Selecionar módulos necessários
   - **Passo 3:** Configurar integrações (opcional)
   - **Passo 4:** Dados de exemplo? (Sim/Não)

### Passo 5: Bootstrap Automático via AI ❌ FALTA
**Atual:** Manual via Studio  
**Ideal:**
1. Chamar `bootstrap_tenant` automaticamente
2. Ativar módulos selecionados via `activate_module`
3. Criar warehouse via `configure_warehouse` (se Logistics ativo)
4. Popular dados exemplo (se selecionado)

### Passo 6: Primeiro Tour Guiado ❌ FALTA
**Atual:** Utilizador fica perdido  
**Ideal:**
1. Tour interativo pelos módulos ativos
2. Explicar AssistME vs AssistBuild
3. Mostrar como fazer primeira tarefa

---

## 📊 RESUMO: O QUE FALTA

### ❌ CRÍTICO (Bloqueia uso básico)
1. **Criação automática de `company_info`**
   - Reativar conversão `onboarding_cache`
   - Ou criar via `bootstrap_tenant` após registo

2. **Ativação de módulos**
   - Wizard de seleção
   - Ou ativar defaults (CRM, Financial, Projects)

3. **Warehouse padrão**
   - Migrar `inventoryService`
   - Criar automaticamente ou via wizard

### ⚠️ IMPORTANTE (Melhora experiência)
4. **Wizard pós-registo**
   - Confirmar/completar dados empresa
   - Selecionar módulos
   - Configurar basics

5. **Dados de exemplo**
   - Seed data opcional
   - Acelera aprendizado

### ✅ NICE-TO-HAVE (Futuro)
6. **Tour guiado**
   - Onboarding interativo
   - Primeiros passos

7. **Templates de indústria**
   - Pre-configs por setor
   - Workflows pré-definidos

---

## 🎯 PRÓXIMOS PASSOS RECOMENDADOS

### Opção A: Mínimo Viável (Rápido)
1. ✅ Criar `company_info` automaticamente no registo
2. ✅ Ativar 3 módulos por default: CRM, Financial, Projects
3. ✅ Criar warehouse padrão (quando inventoryService migrado)

### Opção B: Experiência Completa (Ideal)
1. ✅ Wizard pós-registo (4 passos)
2. ✅ Integração com `bootstrap_tenant` AI tool
3. ✅ Dados de exemplo opcionais
4. ✅ Tour guiado interativo

---

## 💡 DECISÃO NECESSÁRIA

**Pergunta para o utilizador:**
> Qual abordagem prefere para o onboarding de tenants?
> 
> **A) Mínimo Viável** - Criar company_info + 3 módulos default automaticamente (1-2h)
> 
> **B) Experiência Completa** - Wizard guiado + AI bootstrap + dados exemplo (1-2 dias)
> 
> **C) Híbrido** - Defaults automáticos + wizard opcional depois

---

## 📝 NOTAS TÉCNICAS

### Tabelas Envolvidas
- ✅ `users` - Utilizador criado
- ✅ `tenants` - Tenant criado
- ✅ `user_tenants` - Relação criada
- ✅ `tenant_storage_providers` - Storage criado
- ⚠️ `company_info` - **NÃO criada**
- ⚠️ `warehouses` - **NÃO criada** (desativado)
- ✅ `onboarding_cache` - Dados temporários (não convertidos)

### Serviços/Rotas Relevantes
- ✅ `POST /api/auth/register` - Criação de conta
- ✅ `POST /api/onboarding/chat` - Conversa pré-registo
- ⚠️ `onboarding-to-tenant-converter` - **QUARANTINED** (_legacy/)
- ⚠️ `inventoryService` - **NÃO MIGRADO**
- ✅ AI Tools (26 config tools disponíveis)

### Flags de Controlo
```typescript
// em tenant.service.ts
// QUARANTINED: onboarding converter moved to _legacy/
// QUARANTINED: inventory service not yet migrated

// em auth.ts
// DISABLED: Onboarding cache conversion temporarily disabled
```
