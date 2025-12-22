// Migrated from AssistOS legacy - Phase 4.1
// Source: /tmp/assistos-legacy/server/routes/permissions.ts

import { Router } from 'express';
import { db } from '../db';
import { userTenants } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole } from '../middleware/auth.middleware';
import { getUserPermissions } from '../permissions';
import type { UserModulePermissions } from '../../../shared/schema';

const router = Router();

// Module structure helpers (imported from legacy utils/permissions)
function getModuleStructure() {
  return {
    commercial: {
      name: 'Comercial',
      areas: {
        leads: { name: 'Leads', description: 'Gestão de oportunidades comerciais' },
        quotes: { name: 'Orçamentos', description: 'Criação e gestão de orçamentos' },
        projects: { name: 'Projetos', description: 'Projetos comerciais' },
      }
    },
    financial: {
      name: 'Financeiro',
      areas: {
        accountsReceivable: { name: 'Contas a Receber', description: 'Gestão de recebimentos' },
        accountsPayable: { name: 'Contas a Pagar', description: 'Gestão de pagamentos' },
        invoicing: { name: 'Faturação', description: 'Emissão de faturas' },
        cashFlow: { name: 'Fluxo de Caixa', description: 'Gestão de tesouraria' },
        bankReconciliation: { name: 'Reconciliação Bancária', description: 'Reconciliação de extratos' },
      }
    },
    production: {
      name: 'Produção',
      areas: {
        tasks: { name: 'Tarefas', description: 'Gestão de tarefas de produção' },
        inventory: { name: 'Inventory', description: 'Stock management' },
        suppliers: { name: 'Fornecedores', description: 'Gestão de fornecedores' },
      }
    },
    email: {
      name: 'Email',
      areas: {
        inbox: { name: 'Inbox', description: 'Caixa de entrada' },
        classification: { name: 'Classificação', description: 'Classificação de emails' },
        autoResponse: { name: 'Resposta Automática', description: 'Respostas automáticas' },
      }
    },
    configuration: {
      name: 'Configuração',
      areas: {
        users: { name: 'Utilizadores', description: 'Gestão de utilizadores' },
        modules: { name: 'Módulos', description: 'Gestão de módulos' },
        integrations: { name: 'Integrações', description: 'Gestão de integrações' },
      }
    }
  };
}

function validatePermissions(permissions: UserModulePermissions): string[] {
  const errors: string[] = [];
  const validLevels = ['none', 'read', 'write', 'full'];
  
  // Validate structure
  if (!permissions || typeof permissions !== 'object') {
    errors.push('Permissions must be an object');
    return errors;
  }
  
  // Validate each module
  const structure = getModuleStructure();
  for (const [moduleKey, module] of Object.entries(structure)) {
    const modulePerms = (permissions as any)[moduleKey];
    if (!modulePerms) continue;
    
    for (const areaKey of Object.keys((module as any).areas)) {
      const level = modulePerms[areaKey];
      if (level && !validLevels.includes(level)) {
        errors.push(`Invalid permission level for ${moduleKey}.${areaKey}: ${level}`);
      }
    }
  }
  
  return errors;
}

function getFullAccessPermissions(): UserModulePermissions {
  return {
    commercial: { leads: 'full', quotes: 'full', projects: 'full' },
    financial: {
      accountsReceivable: 'full',
      accountsPayable: 'full',
      invoicing: 'full',
      cashFlow: 'full',
      bankReconciliation: 'full',
    },
    production: { tasks: 'full', inventory: 'full', suppliers: 'full' },
    email: { inbox: 'full', classification: 'full', autoResponse: 'full' },
    configuration: { users: 'full', modules: 'full', integrations: 'full' },
  };
}

/**
 * GET /api/permissions/structure
 * Get module structure with all available areas for permissions configuration
 */
router.get('/structure', requireRole(['admin', 'config', 'owner']) as any, (req, res) => {
  try {
    const structure = getModuleStructure();
    
    res.json({
      success: true,
      structure,
      permissionLevels: [
        { value: 'none', label: 'Sem Acesso', description: 'Não pode ver nem aceder' },
        { value: 'read', label: 'Apenas Leitura', description: 'Pode ver mas não editar' },
        { value: 'write', label: 'Leitura e Escrita', description: 'Pode ver, criar e editar' },
        { value: 'full', label: 'Acesso Completo', description: 'Pode ver, criar, editar e apagar' },
      ],
    });
  } catch (error) {
    console.error('[GET /permissions/structure] Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao obter estrutura de permissões' 
    });
  }
});

/**
 * GET /api/permissions/user/:userId
 * Get user's current permissions
 * Only admin/owner/config can view user permissions
 */
router.get('/user/:userId', requireRole(['admin', 'config', 'owner']) as any, async (req, res) => {
  try {
    const { userId } = req.params;
    const tenantId = req.session.activeTenantId!;

    const permissions = await getUserPermissions(userId, tenantId);

    if (!permissions) {
      return res.status(404).json({ 
        success: false,
        error: 'Utilizador não encontrado ou não pertence a este tenant' 
      });
    }

    res.json({
      success: true,
      userId,
      role: permissions.role,
      permissions: permissions.permissions,
    });
  } catch (error) {
    console.error('[GET /permissions/user/:userId] Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao obter permissões do utilizador' 
    });
  }
});

/**
 * PUT /api/permissions/user/:userId
 * Update user's permissions
 * SECURITY: Only owner/config can change roles; admins can only change permissions
 */
router.put('/user/:userId', requireRole(['admin', 'config', 'owner']) as any, async (req, res) => {
  try {
    const { userId } = req.params;
    const tenantId = req.session.activeTenantId!;
    const callerUserId = req.session.userId!;
    const { permissions, role } = req.body as { 
      permissions: UserModulePermissions;
      role?: string;
    };

    // Get caller's role
    const callerPerms = await getUserPermissions(callerUserId, tenantId);
    const callerRole = callerPerms?.role;

    // Validate permissions structure
    const validationErrors = validatePermissions(permissions);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Permissões inválidas',
        details: validationErrors
      });
    }

    // Check if user membership exists
    const membership = await db.query.userTenants.findFirst({
      where: and(
        eq(userTenants.userId, userId),
        eq(userTenants.tenantId, tenantId)
      ),
    });

    if (!membership) {
      return res.status(404).json({ 
        success: false,
        error: 'Utilizador não pertence a este tenant' 
      });
    }

    // SECURITY: Only owner/config can change roles
    // Admins can only update permissions, not roles
    const updateData: any = { permissions };
    
    if (role && role !== membership.role) {
      // Trying to change role
      if (callerRole !== 'owner' && callerRole !== 'config') {
        return res.status(403).json({ 
          success: false,
          error: 'Apenas owners e configuradores podem alterar roles' 
        });
      }

      // Validate role value
      if (!['owner', 'config', 'admin', 'user'].includes(role)) {
        return res.status(400).json({ 
          success: false,
          error: 'Role inválido' 
        });
      }

      // Prevent self-escalation to owner (only existing owners can create new owners)
      if (role === 'owner' && callerRole !== 'owner') {
        return res.status(403).json({ 
          success: false,
          error: 'Apenas owners podem criar novos owners' 
        });
      }

      updateData.role = role;
    }

    await db.update(userTenants)
      .set(updateData)
      .where(and(
        eq(userTenants.userId, userId),
        eq(userTenants.tenantId, tenantId)
      ));

    res.json({
      success: true,
      message: 'Permissões atualizadas com sucesso',
      userId,
      permissions,
      role: updateData.role || membership.role,
    });

  } catch (error) {
    console.error('[PUT /permissions/user/:userId] Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao atualizar permissões' 
    });
  }
});

/**
 * POST /api/permissions/user/:userId/grant-full
 * Grant full access to all modules for a user
 * Quick action for admin to give complete access
 */
router.post('/user/:userId/grant-full', requireRole(['admin', 'config', 'owner']) as any, async (req, res) => {
  try {
    const { userId } = req.params;
    const tenantId = req.session.activeTenantId!;

    const fullPermissions = getFullAccessPermissions();

    await db.update(userTenants)
      .set({ permissions: fullPermissions })
      .where(and(
        eq(userTenants.userId, userId),
        eq(userTenants.tenantId, tenantId)
      ));

    res.json({
      success: true,
      message: 'Acesso completo concedido com sucesso',
      userId,
      permissions: fullPermissions,
    });

  } catch (error) {
    console.error('[POST /permissions/user/:userId/grant-full] Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao conceder acesso completo' 
    });
  }
});

/**
 * POST /api/permissions/user/:userId/revoke-all
 * Revoke all permissions from a user
 * Sets all permissions to 'none'
 */
router.post('/user/:userId/revoke-all', requireRole(['admin', 'config', 'owner']) as any, async (req, res) => {
  try {
    const { userId } = req.params;
    const tenantId = req.session.activeTenantId!;

    await db.update(userTenants)
      .set({ 
        permissions: {
          commercial: { leads: 'none', quotes: 'none', projects: 'none' },
          financial: {
            accountsReceivable: 'none',
            accountsPayable: 'none',
            invoicing: 'none',
            cashFlow: 'none',
            bankReconciliation: 'none',
          },
          production: { tasks: 'none', inventory: 'none', suppliers: 'none' },
          email: { inbox: 'none', classification: 'none', autoResponse: 'none' },
          configuration: { users: 'none', modules: 'none', integrations: 'none' },
        }
      })
      .where(and(
        eq(userTenants.userId, userId),
        eq(userTenants.tenantId, tenantId)
      ));

    res.json({
      success: true,
      message: 'Todas as permissões revogadas',
      userId,
    });

  } catch (error) {
    console.error('[POST /permissions/user/:userId/revoke-all] Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao revogar permissões' 
    });
  }
});

/**
 * GET /api/permissions/me
 * Get current user's own permissions
 * Any authenticated user can check their own permissions
 */
router.get('/me', async (req, res) => {
  try {
    const userId = req.session.userId;
    const tenantId = req.session.activeTenantId;

    if (!userId || !tenantId) {
      return res.status(401).json({ 
        success: false,
        error: 'Não autenticado' 
      });
    }

    const permissions = await getUserPermissions(userId, tenantId);

    if (!permissions) {
      return res.status(404).json({ 
        success: false,
        error: 'Permissões não encontradas' 
      });
    }

    res.json({
      success: true,
      userId,
      role: permissions.role,
      permissions: permissions.permissions,
    });

  } catch (error) {
    console.error('[GET /permissions/me] Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao obter permissões' 
    });
  }
});

export default router;
