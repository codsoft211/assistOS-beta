# Configuração Gmail OAuth - Redirect URIs

## ⚠️ Problema Identificado

O redirect URI do Gmail OAuth estava usando a variável de ambiente errada (`REPL_SLUG`), o que causava o erro `DNS_PROBE_FINISHED_NXDOMAIN` ao tentar conectar contas Gmail.

## ✅ Correção Aplicada (Atualizada 2025-11-01)

Foi criado um arquivo centralizado de configuração (`apps/api/config/environment.ts`) que detecta automaticamente o ambiente correto:

- **Produção (Published)**: `https://assistos.replit.app`
- **Development (workspace)**: `https://[workspace-id].replit.dev`
- **Local**: `http://localhost:5000`

**Detecção automática**: O sistema verifica se `REPLIT_DOMAINS` contém `.replit.dev` para distinguir development de production.

## 📋 Redirect URIs a Configurar no Google Cloud Console

Para que a autenticação Gmail funcione, você precisa adicionar os seguintes **Authorized redirect URIs** no seu projeto do Google Cloud Console:

### 1. Para Produção (Published App)

```
https://assistos.replit.app/api/gmail/oauth/callback
https://assistos.replit.app/api/auth/google/callback
```

### 2. Para Development (Workspace)

```
https://[SEU-WORKSPACE].replit.dev/api/gmail/oauth/callback
https://[SEU-WORKSPACE].replit.dev/api/auth/google/callback
```

**Nota**: Substitua `[SEU-WORKSPACE]` pelo domínio do seu workspace Replit (exemplo: `5dcb289b-cd31-4fe2-b4d5-14527b10eb65-00-gcjys4g9dycp.kirk.replit.dev`)

### 3. Para Local Development (Opcional)

```
http://localhost:5000/api/gmail/oauth/callback
http://localhost:5000/api/auth/google/callback
```

## 🔧 Como Configurar no Google Cloud Console

### Passo 1: Acessar o Google Cloud Console

1. Acesse https://console.cloud.google.com/
2. Selecione seu projeto (ou crie um novo)

### Passo 2: Habilitar as APIs

1. Vá para **APIs & Services** > **Library**
2. Procure e habilite:
   - **Gmail API**
   - **Google+ API** (para login social)

### Passo 3: Configurar OAuth Consent Screen

1. Vá para **APIs & Services** > **OAuth consent screen**
2. Configure:
   - **User Type**: Externo (para produção) ou Interno (apenas para sua org)
   - **App name**: AssistOS
   - **User support email**: seu email
   - **Authorized domains**: 
     - `replit.app` (para produção)
     - `replit.dev` (para development)
   - **Scopes**: Adicione os scopes necessários:
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`

### Passo 4: Criar/Atualizar Credenciais OAuth

1. Vá para **APIs & Services** > **Credentials**
2. Clique em **+ CREATE CREDENTIALS** > **OAuth client ID**
3. Selecione **Web application**
4. Configure:
   - **Name**: AssistOS OAuth Client
   - **Authorized JavaScript origins**:
     - `https://assistos.replit.app`
     - `https://[SEU-WORKSPACE].replit.dev`
   - **Authorized redirect URIs** (ADICIONE TODOS):
     ```
     https://assistos.replit.app/api/gmail/oauth/callback
     https://assistos.replit.app/api/auth/google/callback
     https://[SEU-WORKSPACE].replit.dev/api/gmail/oauth/callback
     https://[SEU-WORKSPACE].replit.dev/api/auth/google/callback
     http://localhost:5000/api/gmail/oauth/callback
     http://localhost:5000/api/auth/google/callback
     ```

5. Clique em **CREATE**
6. **IMPORTANTE**: Copie o **Client ID** e **Client Secret** gerados

### Passo 5: Atualizar Secrets no Replit

1. No seu Replit, vá para **Tools** > **Secrets**
2. Atualize/adicione:
   - `GOOGLE_CLIENT_ID`: Cole o Client ID do Google
   - `GOOGLE_CLIENT_SECRET`: Cole o Client Secret do Google

## 🧪 Testando a Configuração

### 1. Development (Workspace)

1. Acesse `https://[SEU-WORKSPACE].replit.dev`
2. Faça login na aplicação
3. Vá para **Comunicações** > **Configurações**
4. Clique em **Conectar Conta Gmail**
5. Você deve ser redirecionado para a tela de consentimento do Google
6. Após autorizar, será redirecionado de volta para a aplicação

### 2. Produção (assistos.replit.app)

1. Acesse `https://assistos.replit.app`
2. Siga os mesmos passos acima
3. O redirect agora deve funcionar corretamente

## 🔍 Verificando os Logs

Se ainda houver problemas, verifique os logs do servidor:

```bash
# No console do servidor, procure por:
[Gmail OAuth] Generating authorization URL...
[Gmail OAuth] Authorization URL generated successfully
[Gmail OAuth] Callback error: ...
```

## 📝 Arquivos Modificados

As seguintes mudanças foram aplicadas:

1. **Criado**: `apps/api/config/environment.ts`
   - Centraliza detecção de ambiente (prod/dev/local)
   - Gera URLs corretas automaticamente

2. **Atualizado**: `apps/api/routes/gmail-oauth.ts`
   - Usa `getOAuthCallbacks().gmail` em vez de construir URL manualmente

3. **Atualizado**: `apps/api/config/passport.ts`
   - Usa `getOAuthCallbacks().google` para consistência

4. **Atualizado**: `packages/modules/compras/services/email.ts`
   - Usa `getBaseUrl()` para gerar links de submissão de invoice

5. **Atualizado**: `packages/modules/compras/tools/quick-purchase.ts`
   - Usa `getBaseUrl()` para consistência

## ✅ Próximos Passos

1. Configure os redirect URIs no Google Cloud Console conforme instruído acima
2. Atualize os secrets GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no Replit
3. Reinicie a aplicação
4. Teste a conexão Gmail tanto em dev quanto em prod

---

**Nota**: O sistema usa `assistos.replit.app` como domínio de produção. Se precisar usar um domínio customizado, atualize a linha 25 do arquivo `apps/api/config/environment.ts`.
