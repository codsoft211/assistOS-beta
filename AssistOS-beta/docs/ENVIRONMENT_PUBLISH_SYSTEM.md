# Environment Publish System

## Overview
Sistema de publicação de módulos do ambiente Sandbox para Production, implementado em Nov 22, 2025.

## Architecture

### Backend Endpoint
**POST /api/environment/publish**
- **Authentication**: Requer sessão ativa
- **Authorization**: Apenas `owner` e `admin` (configurators NÃO podem publicar)
- **Environment**: Apenas disponível quando user está em `sandbox`
- **Operation**: Copia TODOS os módulos ativos de sandbox → production

**Response:**
```json
{
  "success": true,
  "modulesPublished": 4,
  "modules": [
    { "moduleId": "financeiro", "isActive": true },
    { "moduleId": "crm", "isActive": true }
  ],
  "message": "Successfully published 4 module(s) to production"
}
```

### Frontend UI
**Location**: `client/src/components/AppSidebar.tsx`

**Visibility Rules**:
- ✅ Botão "Publicar para Production" visível apenas quando:
  - User está em ambiente `sandbox`
  - User tem role `owner` OU `admin` (NOT configurator)

**Dialog de Confirmação**:
- Mostra preview de todos os módulos que serão publicados
- Lista cada módulo com ícone e nome traduzido
- Aviso de que irá SUBSTITUIR todos os módulos em production
- Botões: "Cancelar" e "Confirmar Publicação"
- Loading state durante publicação

## Security

### Role Validation (Backend)
```typescript
// apps/api/routes/environment.ts:196-200
if (!['owner', 'admin'].includes(permissions.role)) {
  return res.status(403).json({ 
    error: "Only tenant owners and admins can publish to production" 
  });
}
```

### Environment Validation (Backend)
```typescript
// apps/api/routes/environment.ts:203-207
if (currentEnv !== 'sandbox') {
  return res.status(400).json({ 
    error: "Publishing is only available from sandbox environment"
  });
}
```

### Frontend Gating
```typescript
// client/src/components/AppSidebar.tsx:169
const canPublish = activeTenant?.role === 'owner' || activeTenant?.role === 'admin';

// client/src/components/AppSidebar.tsx:406
{envData?.environment === 'sandbox' && canPublish && (
  <PublishButton />
)}
```

## Workflow

1. **User trabalha em Sandbox**
   - Configura/ativa módulos no ambiente sandbox
   - Testa configurações e funcionalidades

2. **User decide publicar**
   - Clica em "Publicar para Production" no sidebar
   - Dialog mostra preview dos 4 módulos que serão copiados
   - Confirma a publicação

3. **Backend processa**
   - Valida permissões (owner/admin only)
   - Valida environment (sandbox only)
   - Delete todos os módulos existentes em production
   - Copia todos os módulos de sandbox para production
   - Mantém configurações (`config` JSONB field)

4. **Frontend atualiza**
   - Fecha dialog
   - Invalida cache de módulos (`/api/modules/sidebar`)
   - Mostra toast de sucesso com contador de módulos publicados

## Testing

### Test Scenario 1: Owner publishes from Sandbox
```
1. Login como owner (ex: geral@tailormeal.pt)
2. Verificar environment badge = "SANDBOX"
3. Verificar botão "Publicar para Production" está visível
4. Clicar no botão
5. Dialog abre mostrando 4 módulos (financeiro, lead-generation, crm, projects)
6. Clicar "Confirmar Publicação"
7. Toast success: "✅ Publicado com sucesso! 4 módulo(s) publicado(s) para production"
```

### Test Scenario 2: Admin publishes from Sandbox
```
1. Login como admin
2. Verificar comportamento idêntico ao owner
```

### Test Scenario 3: Configurator cannot publish
```
1. Login como configurator
2. Verificar environment badge = "SANDBOX"
3. Verificar botão "Publicar para Production" NÃO está visível
```

### Test Scenario 4: Cannot publish from Production
```
1. Login como owner
2. Switch para environment "production"
3. Verificar botão "Publicar para Production" NÃO está visível
```

## Database Impact

**Tables affected**: `tenant_modules`

**Operation**: 
1. DELETE all rows where `environment = 'production'`
2. INSERT copies of all `environment = 'sandbox'` rows with `environment = 'production'`

**Fields copied**:
- `moduleId` (ex: "financeiro")
- `tenantId`
- `isActive`
- `config` (JSONB with module configurations)
- `installedAt` → recalculated as `new Date()`
- `installedBy` → set to publishing user's ID

## Known Limitations

1. **No selective publish**: Sempre publica TODOS os módulos (não permite escolher quais)
2. **No rollback**: Não há sistema de rollback automático
3. **No diff preview**: Não mostra o que mudou entre sandbox e production
4. **Destructive**: Substitui completamente production (não merge)

## Future Enhancements

- [ ] Selective module publishing (escolher quais módulos publicar)
- [ ] Publish history / audit log
- [ ] Rollback system (voltar à versão anterior)
- [ ] Diff preview (mostrar mudanças antes de publicar)
- [ ] Merge strategy (publicar apenas novos/alterados)
- [ ] Data promotion (publicar dados além de módulos)
