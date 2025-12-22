# 🚀 AssistOS - Guia de Produção

**Data:** 09 Novembro 2025  
**Objetivo:** Ir live com 10 tenants de forma SÓLIDA e escalável

## ✅ Estado Atual

**Database:** ✅ Neon PostgreSQL (ep-cool-art-afvt18zu.c-2.us-west-2.aws.neon.tech)  
**Git Backup:** ⚠️ Apenas local (gitsafe-backup) - **AÇÃO NECESSÁRIA**  
**Redis:** ✅ Upstash Redis CONFIGURADO (Oregon us-west-2) - 13+ commands executed  
**BullMQ:** ✅ AssistBuild Queue inicializada (apps/api & apps/worker)  
**Monitoring:** ❌ Não configurado

---

## 📋 CHECKLIST DE PRODUÇÃO

### FASE 1: BACKUP & SEGURANÇA (15 min)

#### 1.1 Setup GitHub Backup ⏳
```bash
# Você faz (via Replit Git Pane ou Shell):
1. Criar repo privado: https://github.com/new
   Nome: assistos-erp
   Visibilidade: Private
   
2. No Replit Shell:
   git remote add origin https://github.com/SEU-USERNAME/assistos-erp.git
   git push -u origin main
   
3. Criar branch de trabalho:
   git checkout -b restore-features
   git push -u origin restore-features
```

**✅ CHECKPOINT:** Código no GitHub, branch `restore-features` criada

---

### FASE 2: INFRAESTRUTURA REDIS (20 min)

#### 2.1 Upstash Redis - ✅ CONFIGURADO
```bash
✅ STATUS: Configurado em 09/11/2025
✅ REGIÃO: Oregon (us-west-2) - próximo ao Neon PostgreSQL
✅ URL: rediss://default:XXXXX@dominant-flea-19063.upstash.io:6379
✅ COMANDOS EXECUTADOS: 13+ (verificado via dashboard)
✅ BULLMQ QUEUES: assistbuild (API + Worker)

# Configuração feita:
1. ✅ Criado database no Upstash (Oregon us-west-2)
2. ✅ REDIS_URL adicionado aos Replit Secrets
3. ✅ apps/worker/config/redis.ts - getRedisConnection() com TLS
4. ✅ apps/api/queues/assistbuild.ts - BullMQ Queue inicializada
5. ✅ apps/worker/index.ts - BullMQ Worker aguardando jobs
6. ✅ Verificação: Dashboard Upstash mostra conexões ativas

# Arquitetura Redis:
- Connection pooling via ioredis
- TLS obrigatório (rediss://)
- Graceful degradation se Redis falhar
- Logs estruturados via pino
```

**✅ CHECKPOINT COMPLETO:** Redis funcionando, 13+ comandos executados

#### 2.2 Neon: Ativar pgBouncer (Connection Pooling)
```bash
1. Aceder: https://console.neon.tech/
2. Ir para projeto AssistOS
3. Settings > Connection Pooling
4. Enable pgBouncer
5. Copiar nova DATABASE_URL (com pgbouncer no hostname)
6. Atualizar Replit Secret: DATABASE_URL
```

**✅ CHECKPOINT:** pgBouncer ativado, DATABASE_URL atualizada

#### 2.3 Distributed Cron Locks - ⏳ PRÓXIMO PASSO
```bash
🎯 OBJETIVO: Garantir que apenas 1 instância execute cron jobs em multi-instance deployment

# Arquitetura Atual (apps/api/index.ts):
- node-cron agendado (digestões diárias/semanais, cleanup)
- ❌ SEM LOCKS: Múltiplas instâncias executariam jobs duplicados
- ❌ RISCO: Emails duplicados, processamento redundante, race conditions

# Solução: Redis-based Distributed Locks
## Implementação Recomendada:

1. **Instalar dependência:**
   npm install redlock

2. **Criar serviço de locks (apps/api/services/cron-lock.ts):**
   import Redlock from 'redlock';
   import { redisConnection } from '../../worker/config/redis.js';
   import logger from '../logger.js';

   const redlock = new Redlock([redisConnection], {
     driftFactor: 0.01,
     retryCount: 3,
     retryDelay: 200,
   });

   export async function withCronLock<T>(
     lockKey: string,
     duration: number,
     fn: () => Promise<T>
   ): Promise<T | null> {
     try {
       const lock = await redlock.acquire([`cron:${lockKey}`], duration);
       try {
         const result = await fn();
         await lock.release();
         return result;
       } catch (error) {
         await lock.release();
         throw error;
       }
     } catch (error) {
       if (error.name === 'LockError') {
         logger.info({ lockKey }, 'Cron job skipped - outro nó já está executando');
         return null;
       }
       throw error;
     }
   }

3. **Atualizar cron jobs (apps/api/index.ts):**
   import { withCronLock } from './services/cron-lock.js';
   
   // Daily digest (8 AM)
   cron.schedule('0 8 * * *', async () => {
     await withCronLock('daily-digest', 3600000, async () => {
       await digestService.sendDailyDigests();
     });
   });
   
   // Weekly digest (Monday 8 AM)
   cron.schedule('0 8 * * 1', async () => {
     await withCronLock('weekly-digest', 3600000, async () => {
       await digestService.sendWeeklyDigests();
     });
   });

4. **Verificação:**
   - Deployar 2+ instâncias
   - Logs devem mostrar apenas 1 executando, outras skipando
   - Dashboard Upstash deve mostrar keys "cron:*" com TTL

# Benefícios:
✅ Zero duplicação de jobs em multi-instance
✅ Auto-healing: Lock expira se nó crashar
✅ Observable: Keys visíveis no Redis
✅ Low-latency: <10ms overhead por job
✅ Production-ready: Retry logic + drift compensation
```

**⏳ PRÓXIMO PASSO:** Implementar distributed cron locks antes do deployment

---

### FASE 3: VARIÁVEIS DE AMBIENTE (10 min)

Verificar/adicionar no Replit Secrets (🔒):

```env
# Database
DATABASE_URL=postgresql://user:pass@ep-xxx.c-2.us-west-2.aws.neon.tech:5432/neondb?sslmode=require&pgbouncer=true

# Redis
REDIS_URL=redis://default:XXXX@global.upstash.io:6379

# Sessions
SESSION_SECRET=<gerar: openssl rand -base64 32>

# AI
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Google Cloud (Document AI + Storage)
GOOGLE_PROJECT_ID=assistos-production
GOOGLE_CLIENT_EMAIL=assistos@assistos-production.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_BUCKET_NAME=assistos-documents

# Gmail OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://SEU-REPL.repl.co/api/oauth/google/callback

# WhatsApp
WHATSAPP_ACCESS_TOKEN=xxx
WHATSAPP_PHONE_NUMBER_ID=xxx
WHATSAPP_VERIFY_TOKEN=<gerar: openssl rand -hex 16>
WHATSAPP_BUSINESS_ACCOUNT_ID=xxx

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=assistos@yourdomain.com
SMTP_PASS=xxx

# Cron Jobs (apenas 1 instância)
ENABLE_CRON_JOBS=true

# Monitoring (adicionar depois)
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

**✅ CHECKPOINT:** Todas as variáveis configuradas

---

### FASE 4: DEPLOYMENT (Replit Autoscale)

#### 4.1 Configurar Deployment
```bash
1. No Replit, clicar em "Publish" → "Autoscale"
2. Configuração:
   - CPU: 2 vCPU
   - RAM: 4 GB
   - Min instances: 1
   - Max instances: 3
   - Scale on: Request Rate (>100 req/min)

3. Advanced:
   - Keep-alive: Enabled
   - Environment: Production
```

#### 4.2 Database Migration
```bash
# Rodar ANTES do primeiro deploy:
npm run db:push --force
```

**✅ CHECKPOINT:** Schema sincronizado com Neon

---

### FASE 5: MONITORING & OBSERVABILITY

#### 5.1 Sentry (Error Tracking)
```bash
1. Criar conta: https://sentry.io/signup/
2. Criar projeto: AssistOS (Platform: Node.js + React)
3. Copiar DSN
4. Adicionar ao Replit Secrets: SENTRY_DSN
```

#### 5.2 UptimeRobot (Health Monitoring)
```bash
1. Criar conta: https://uptimerobot.com/
2. Add Monitor:
   - Type: HTTP(s)
   - URL: https://SEU-REPL.repl.co/api/health/basic
   - Interval: 5 minutes
   - Alert: Email when down
```

#### 5.3 Neon Monitoring
```bash
1. Neon Console > Monitoring
2. Configurar alertas:
   - Connection count > 80
   - Query duration p95 > 25ms
   - Storage > 80%
```

#### 5.4 Upstash Monitoring
```bash
1. Upstash Dashboard > Metrics
2. Monitorar:
   - Commands/sec
   - Latency p95
   - Memory usage
```

**✅ CHECKPOINT:** Monitoring configurado

---

## 🔄 RESTAURO DE FEATURES (Progressivo)

### Ordem de Restauro (1 de cada vez):

1. **Notifications** (mais simples)
   - Ativar ENABLE_CRON_JOBS=true
   - Testar digest generation
   - ✅ CHECKPOINT: Email digest recebido

2. **Gmail OAuth**
   - Remover quarantine de `apps/api/routes/oauth.ts`
   - Testar OAuth flow completo
   - ✅ CHECKPOINT: Gmail conectado

3. **Document Hub**
   - Testar upload → GCS → AI classification
   - ✅ CHECKPOINT: Documento classificado

4. **Google Document AI (OCR)**
   - Testar invoice processing
   - ✅ CHECKPOINT: Fatura processada, fornecedor criado

5. **Sandbox Promotion**
   - Ativar promotion jobs (BullMQ)
   - Testar sandbox → production
   - ✅ CHECKPOINT: Dados promovidos com FK preservation

6. **AssistME Performance**
   - Otimizar SmartToolSelector
   - ✅ CHECKPOINT: Chat responde rápido e bem

7. **WhatsApp Integration**
   - Verificar webhooks
   - ✅ CHECKPOINT: Mensagem enviada/recebida

---

## 🧪 TESTES DE PRODUÇÃO

### Smoke Tests (antes de onboarding)
```bash
1. Health Check: curl https://SEU-REPL.repl.co/api/health/basic
2. Auth: Login + criar tenant
3. Notification: Enviar notificação teste
4. Document: Upload ficheiro
5. AI Chat: Perguntar ao AssistME
6. WhatsApp: Enviar mensagem
7. Gmail: Conectar conta
```

**✅ CHECKPOINT:** Todos os testes passam

---

## 👥 ONBOARDING DE TENANTS

### BETA Fase 1 (3 tenants - 48h monitorização intensiva)
```bash
Dia 1: Onboard tenant 1 - acompanhar de perto
Dia 2: Onboard tenant 2
Dia 3: Onboard tenant 3
Dias 4-5: Monitorizar 24/7, resolver issues
```

### BETA Fase 2 (7 tenants restantes - 1 semana)
```bash
Usar runbook refinado da Fase 1
Monitorização activa mas menos intensiva
```

---

## ⚠️ PROBLEMAS CONHECIDOS & SOLUÇÕES

### 1. Port Conflict (EADDRINUSE :5000)
**Causa:** API e Worker tentam usar mesma porta  
**Solução:** Worker não tem servidor HTTP, apenas processa jobs. Erro ocorre se workflow restart duplicado.

### 2. Redis Unavailable
**Causa:** REDIS_URL não configurado  
**Solução:** Configurar Upstash Redis (Fase 2.1)

### 3. OAuth Quarantine
**Causa:** Dependência de tenant-storage legacy  
**Solução:** Migrar para storage atual (task restore-2)

### 4. Gmail Sync Disabled
**Causa:** Cron comentado  
**Solução:** Descomentar após OAuth restaurado

### 5. BullMQ Jobs Failing
**Causa:** Redis down ou falta idempotency  
**Solução:** Redis + idempotency keys + DLQ

---

## 📊 MÉTRICAS DE SUCESSO

### Dia 1 (Go-Live)
- ✅ Zero downtime
- ✅ Todos health checks verdes
- ✅ 3 tenants onboarded

### Semana 1
- ✅ 10 tenants activos
- ✅ <1% error rate
- ✅ p95 latency <200ms
- ✅ 99.9% uptime

### Mês 1
- ✅ 10-50 tenants
- ✅ <0.5% error rate
- ✅ p95 latency <150ms
- ✅ 99.95% uptime

---

## 🆘 PLANO DE EMERGÊNCIA

### Se algo quebrar durante onboarding:
```bash
1. Parar novos onboardings
2. Rollback Git: git reset --hard <último-commit-bom>
3. Redeploy no Replit
4. Investigar logs (Sentry + Replit Console)
5. Fix + test em branch separada
6. Merge apenas depois de testes passarem
```

### Contactos de Emergência:
- Neon Support: https://neon.tech/docs/introduction/support
- Upstash Support: support@upstash.com
- Sentry: https://sentry.io/support/

---

## ✅ PRÓXIMOS PASSOS

**AGORA (Você):**
1. [ ] Criar repo GitHub privado
2. [ ] Push código para GitHub
3. [ ] Criar branch `restore-features`
4. [ ] Configurar Upstash Redis
5. [ ] Ativar pgBouncer no Neon
6. [ ] Adicionar variáveis ambiente (Secrets)

**DEPOIS (Eu - Replit Agent):**
7. [ ] Separar portas API/Worker (se necessário)
8. [ ] Re-ativar BullMQ queues
9. [ ] Implementar distributed locks
10. [ ] Restaurar features 1 por 1
11. [ ] Criar E2E tests
12. [ ] Setup monitoring completo

---

**Última atualização:** 09 Nov 2025  
**Status:** 🟡 Aguardando Fase 1 (GitHub + Redis setup)
