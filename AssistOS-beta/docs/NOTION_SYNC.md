# 🔄 Notion Sync - Sincronização Bidirecional TODO_GO_LIVE.md

## 📋 Visão Geral

Sistema de sincronização bidirecional que conecta `docs/TODO_GO_LIVE.md` com uma database do Notion, permitindo gerir bugs e tarefas de go-live em ambas as plataformas.

---

## ✅ Status Atual: **BIDIRECIONAL COMPLETO**

✅ **Markdown → Notion:** Totalmente funcional  
✅ **Notion → Markdown:** Merge automático implementado  
✅ **Conflict Detection:** Comparação real de timestamps  
✅ **6+ bugs sincronizados** com sucesso (ambas direções)

---

## 🚀 Como Usar

### **Execução Manual (Recomendado para MVP)**

```bash
npx tsx scripts/sync-notion.ts
```

**Output esperado:**
```
═══════════════════════════════════════════════════════
🔄 AssistOS - Notion Sync (Bidirectional)
═══════════════════════════════════════════════════════

🔄 Starting bidirectional sync...

🔍 Parser found 6 bugs
📄 Found 6 bugs in Markdown
📊 Found 6 pages in Notion

✅ Pushed: BUG7 → Notion
🔼 Updated: BUG1 (MD → Notion)
...

📊 Sync Summary:
   Pushed to Notion: 6
   Pulled from Notion: 0
   Conflicts detected: 0
```

---

## 🔧 Configuração (Setup Completo)

### **1. Notion Integration**
1. Aceder: https://www.notion.so/my-integrations
2. Criar: **"assistOS_GO_LIVE"** (ou nome personalizado)
3. Capabilities: ✅ Read, ✅ Insert, ✅ Update content
4. Copiar: **Internal Integration Secret**

### **2. Notion Database**
1. Criar database: **"AssistOS - GO-LIVE Tasks"**
2. Adicionar connection: **assistOS_GO_LIVE**
3. Propriedades obrigatórias:
   - **Title** (Title) - título do bug
   - **Bug ID** (Text) - identificador único
   - **Severity** (Select) - opções: 🔴 P0, 🟠 P1, 🟡 P2
   - **Status** (Select) - status atual
   - **Component** (Text) - componente afetado
   - **Reporter** (Text) - quem reportou
   - **Date** (Date) - data de criação

### **3. Secrets Replit**
```
NOTION_API_KEY=ntn_xxxxxxxxxxxxxxx (token da integration)
NOTION_DATABASE_ID=xxxxxxxxxxxxxxx (Data Source ID)
```

**⚠️ IMPORTANTE:** Usar **Data Source ID**, não Database ID!

Para obter o correto:
```bash
npx tsx scripts/test-notion-connection.ts
```

---

## 📝 Formato dos Bugs no Markdown

```markdown
### **🔴 BLOCKER #1: Frontend "Very Very Bad"**

**Severity:** 🔴 P0 BLOCKER  
**Component:** React Frontend (global)  
**Reported by:** User  
**Date:** 2025-11-10  
**Status:** 🔴 ACTIVE  
**Time Estimate:** 4-6 hours

#### **Description:**
"Frontend: very very bad" - Multiple severe UX/UI issues.

#### **Impact:**
**CRITICAL** - UX completely compromised.

#### **Exit Criteria:**
- [ ] Zero JavaScript errors
- [ ] All routes navigate
```

---

## 🔄 Workflow de Sincronização

### **Cenário 1: Adicionar Bug no Markdown**
1. Editar `docs/TODO_GO_LIVE.md`
2. Adicionar novo bug na seção apropriada
3. Executar: `npx tsx scripts/sync-notion.ts`
4. ✅ Bug criado no Notion automaticamente

### **Cenário 2: Editar Bug no Markdown**
1. Modificar bug em `docs/TODO_GO_LIVE.md`
2. Executar: `npx tsx scripts/sync-notion.ts`
3. ✅ Bug atualizado no Notion (MD → Notion)

### **Cenário 3: Editar Bug no Notion**
1. Modificar bug diretamente no Notion
2. Executar: `npx tsx scripts/sync-notion.ts`
3. ✅ Sistema detecta mudança e **merge automático para Markdown**
4. 🔍 Conflict detection compara timestamps e prioriza versão mais recente

---

## 🛠️ Arquitetura Técnica

### **Componentes Principais**

#### **1. NotionSyncService** (`apps/api/services/notion-sync.service.ts`)
```typescript
class NotionSyncService {
  syncBidirectional(): Promise<SyncResult>
  parseMarkdownBugs(): Promise<Bug[]>
  fetchNotionPages(): Promise<Bug[]>
  createNotionPage(bug: Bug): Promise<void>
  updateNotionPage(pageId: string, bug: Bug): Promise<void>
  detectConflict(mdBug: Bug, notionBug: Bug): ConflictType
}
```

#### **2. Script CLI** (`scripts/sync-notion.ts`)
Executável standalone para sincronização manual.

#### **3. Test Connection** (`scripts/test-notion-connection.ts`)
Diagnóstico de connection issues e descoberta de Data Source IDs.

---

## 📊 Propriedades Sincronizadas

| Propriedade | Tipo Notion | Sincronização |
|-------------|-------------|---------------|
| Title | Title | ✅ Bidirectional |
| Bug ID | Text | ✅ Bidirectional |
| Severity | Select | ✅ Bidirectional |
| Status | Select | ✅ Bidirectional |
| Component | Text | ✅ Bidirectional |
| Reporter | Text | ✅ MD → Notion |
| Date | Date | ✅ MD → Notion |

**Propriedades opcionais (se existirem na database):**
- Time Estimate (Text)
- Description (Text)
- Impact (Text)
- Exit Criteria (Text)
- Last Synced (Date)
- **Attachments (Files & media)** 📎 ✅ Bidirectional

---

## 📎 Attachments (Files & Media)

### **Como Funciona:**

1. **Notion → Markdown:**
   - Attachments do Notion são sincronizados como lista de links
   - Formato: `- [nome-ficheiro](url)`
   - Seção: `#### **Attachments:**`

2. **Markdown → Notion:**
   - Links no Markdown são sincronizados como external files no Notion
   - Suporta qualquer URL válida
   - Notion aceita URLs externas (sem necessidade de upload)

### **Formato Markdown:**
```markdown
### **BUG #1: Title**

**Severity:** 🔴 P0  
...

#### **Attachments:**
- [screenshot.png](https://example.com/screenshot.png)
- [error-log.txt](https://notion.so/file123.txt)
- [video-demo.mp4](https://drive.google.com/file/xxx)

---
```

### **Exemplo de Uso:**

**Adicionar attachment no Notion:**
1. Abrir bug na database
2. Campo "Attachments" → Upload ficheiro ou adicionar link
3. Executar: `npx tsx scripts/sync-notion.ts`
4. ✅ Attachment aparece no Markdown como link

**Adicionar attachment no Markdown:**
1. Editar bug em `docs/TODO_GO_LIVE.md`
2. Adicionar seção `#### **Attachments:**` com links
3. Executar: `npx tsx scripts/sync-notion.ts`
4. ✅ Links aparecem no Notion como external files

### **Notas Importantes:**
- ⚠️ Notion API aceita **URLs externas**, não uploads diretos via API
- ✅ Ficheiros uploaded no Notion UI são sincronizados normalmente
- ✅ Suporta múltiplos attachments
- ✅ Links de Google Drive, Dropbox, etc. funcionam perfeitamente

### **⚙️ Graceful Degradation (Campo Opcional):**

O campo **Attachments** é **opcional** no Notion. O sistema usa uma **abordagem híbrida** para máxima compatibilidade:

**Comportamento:**
1. **Tenta enviar** Attachments (mesmo array vazio)
2. **Se campo não existir:** Captura erro, remove Attachments, retry
3. **Log informativo:** `⚠️ Attachments property doesn't exist in database, skipping attachment sync`
4. **Sync continua normalmente** com outras propriedades

**Vantagens:**
- ✅ Funciona **COM ou SEM** campo Attachments no Notion
- ✅ Deletion de attachments funciona quando campo existe (array vazio limpa ficheiros)
- ✅ Zero erros quando campo não existe
- ✅ Fácil adicionar campo depois sem mudar código

**Para ativar Attachments completos:**
1. Abrir database no Notion
2. Adicionar coluna: Tipo **"Files & media"**, Nome **"Attachments"**
3. Próximo sync sincroniza attachments automaticamente

---

## ⚙️ Conflict Detection (IMPLEMENTADO)

```typescript
type ConflictType = 'md_newer' | 'notion_newer' | 'no_conflict';
```

**Regras implementadas:**
1. ✅ **Se Notion sem timestamp:** `md_newer` (MD sobrescreve Notion)
2. ✅ **Se MD sem timestamp:** `md_newer` (assumir edição manual)
3. ✅ **Se conteúdo idêntico:** `no_conflict` (skip sync)
4. ✅ **Se conteúdo diferente:** Comparar timestamps com tolerância de 1 segundo
5. ✅ **Versão mais recente ganha:** Auto-merge bidirecional

**Comportamento:**
- **MD mais recente →** Push para Notion
- **Notion mais recente →** Pull para Markdown (sobrescreve)
- **Iguais →** Skip (otimização)

---

## 🐛 Troubleshooting

### **Erro: "Could not find database"**
```
❌ Could not find database with ID: xxx
```
**Solução:**
1. Verificar connection no Notion (database partilhada com integration)
2. Usar **Data Source ID** (não Database ID):
   ```bash
   npx tsx scripts/test-notion-connection.ts
   ```

### **Erro: "Property does not exist"**
```
❌ Time Estimate is not a property that exists
```
**Solução:**
1. Adicionar propriedade no Notion (Type: Text)
2. Ou: Script ignora automaticamente propriedades que não existem

### **Parser encontra 0 bugs**
```
🔍 Parser found 0 bugs
```
**Solução:**
1. Verificar formato dos bugs no Markdown
2. Confirmar que bugs têm número (ex: `BUG #1`, `BLOCKER #2`)
3. Verificar estrutura de cabeçalhos (`### **...`)

---

## 📈 Próximos Passos (Post-MVP)

### **Phase 2: Melhorias** ✅ CONCLUÍDO
- [x] Implementar merge automático Notion → Markdown
- [x] Adicionar timestamps reais em bugs Markdown
- [x] Conflict detection com comparação de timestamps
- [ ] Interface de resolução de conflitos (UI)
- [ ] Sincronização de Exit Criteria (checkboxes)

### **Phase 3: Automação**
- [ ] Webhook Notion → Auto-sync
- [ ] File watcher Markdown → Auto-sync
- [ ] Scheduled sync (cron job)

### **Phase 4: Features Avançadas**
- [ ] Sincronização de comentários
- [ ] Histórico de mudanças
- [ ] Tags e categorias customizadas
- [ ] Exportação para outros formatos

---

## 📚 Recursos

- **Notion SDK:** https://github.com/makenotion/notion-sdk-js
- **Notion API Docs:** https://developers.notion.com/reference
- **Replit Secrets:** https://docs.replit.com/programming-ide/workspace-features/storing-sensitive-information-environment-variables

---

## ✅ Validação Sistema Bidirecional

**Critérios de sucesso atingidos:**
- ✅ Parser encontra 7 bugs no Markdown
- ✅ 7 páginas sincronizadas no Notion
- ✅ Updates bidirecionais funcionam (MD ↔ Notion)
- ✅ Conflict detection com timestamps reais
- ✅ Merge automático Notion → Markdown implementado
- ✅ Zero erros na execução

**Testes validados:**
- ✅ Markdown → Notion: Criação + Update
- ✅ Notion → Markdown: Pull automático
- ✅ Conflict detection: MD sem timestamp = MD mais recente
- ✅ Timestamps sincronizados em ambas direções

**Data:** 2025-11-10  
**Status:** 🟢 Production-Ready (Bidirecional Completo)
