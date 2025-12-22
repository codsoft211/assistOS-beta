import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { 
  apiIntegrations,
  departments,
  suppliers,
  clients,
  products,
  chartOfAccounts,
  taxRates
} from '../../../../../shared/schema';
import { eq, and, count, sql } from 'drizzle-orm';
import { z } from 'zod';
import { selectOneFromTenantTable, insertIntoTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

// Module IDs aligned with actual module registry (see packages/modules/register-modules.ts)
const inputSchema = z.object({
  moduleName: z.enum(['comercial', 'financeiro', 'logistica', 'projetos', 'compras'], {
    errorMap: () => ({ message: 'Módulo inválido. Use: comercial, financeiro, logistica, projetos, compras' })
  }),
  includeDataValidation: z.boolean().optional().default(true),
  includeConnectorTests: z.boolean().optional().default(true),
});

type TestModuleInput = z.infer<typeof inputSchema>;

interface TestResult {
  category: string;
  test: string;
  status: 'pass' | 'fail' | 'warning' | 'skip';
  message: string;
  details?: any;
}

// Module-to-Integration mapping: defines which integrations each module requires
const MODULE_INTEGRATION_REQUIREMENTS: Record<string, string[]> = {
  comercial: [], // No required integrations for basic operation
  financeiro: [], // No required integrations for basic operation
  logistica: [], // No required integrations for basic operation
  projetos: [], // No required integrations for basic operation
  compras: [], // No required integrations for basic operation (email connectors are optional)
};

export class TestModuleTool extends ToolBase<TestModuleInput, any> {
  manifest: ToolManifest = {
    name: 'test_module',
    category: 'validation',
    description: 'Valida que módulo ativado está funcionando corretamente, verificando configurações, dados essenciais e integrações necessárias',
    parameters: [
      { name: 'moduleName', type: 'string', description: 'Nome do módulo a testar (comercial, financeiro, logistica, projetos, compras)', required: true },
      { name: 'includeDataValidation', type: 'boolean', description: 'Validar dados necessários (default: true)', required: false },
      { name: 'includeConnectorTests', type: 'boolean', description: 'Testar conectores vinculados (default: true)', required: false },
    ],
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: TestModuleInput,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      const results: TestResult[] = [];
      
      onProgress?.(10, 'Iniciando testes do módulo...');
      
      // Test 1: Module is activated (from tenant-scoped table)
      onProgress?.(20, 'Verificando ativação do módulo...');
      
      const module = await selectOneFromTenantTable<{
        id: string;
        module_id: string;
        is_active: boolean;
        config: Record<string, any>;
      }>(
        context.tenantId,
        'tenant_modules',
        sql`module_id = ${validated.moduleName}`
      );
      
      if (!module) {
        return {
          success: false,
          error: `Módulo "${validated.moduleName}" não está ativado neste tenant`,
          suggestion: 'Use activate_module para ativar o módulo primeiro'
        };
      }
      
      if (!module.is_active) {
        results.push({
          category: 'Activation',
          test: 'Module Active',
          status: 'fail',
          message: 'Módulo está desativado'
        });
      } else {
        results.push({
          category: 'Activation',
          test: 'Module Active',
          status: 'pass',
          message: 'Módulo está ativado'
        });
      }
      
      // Test 2: Configuration exists
      onProgress?.(30, 'Verificando configurações...');
      
      const config = module.config || {};
      const configKeys = Object.keys(config);
      
      if (configKeys.length === 0) {
        results.push({
          category: 'Configuration',
          test: 'Has Configuration',
          status: 'warning',
          message: 'No specific configuration found',
          details: { suggestion: 'Configure using configure_module_settings if needed' }
        });
      } else {
        results.push({
          category: 'Configuration',
          test: 'Has Configuration',
          status: 'pass',
          message: `${configKeys.length} configuração(ões) encontrada(s)`,
          details: { configs: config }
        });
      }
      
      // Test 3: Essential module-specific validations
      onProgress?.(50, 'Validando configurações específicas do módulo...');
      
      const moduleSpecificTests = await this.testModuleSpecific(
        validated.moduleName,
        context.tenantId,
        config
      );
      results.push(...moduleSpecificTests);
      
      // Test 4: Connector tests (if enabled)
      if (validated.includeConnectorTests) {
        onProgress?.(70, 'Testando conectores vinculados...');
        
        const connectorTests = await this.testConnectors(
          validated.moduleName,
          context.tenantId
        );
        results.push(...connectorTests);
      }
      
      // Test 5: Data validation (if enabled)
      if (validated.includeDataValidation) {
        onProgress?.(80, 'Validando dados necessários...');
        
        const dataTests = await this.testRequiredData(
          validated.moduleName,
          context.tenantId
        );
        results.push(...dataTests);
      }
      
      // Calculate overall status
      const failCount = results.filter(r => r.status === 'fail').length;
      const warningCount = results.filter(r => r.status === 'warning').length;
      const passCount = results.filter(r => r.status === 'pass').length;
      
      const overallStatus = failCount > 0 ? 'fail' : 
                           warningCount > 0 ? 'warning' : 'pass';
      
      onProgress?.(90, 'Registrando auditoria...');
      
      await insertIntoTenantTable(
        context.tenantId,
        'audit_log',
        {
          tenant_id: context.tenantId,
          actor_user_id: context.userId,
          action: 'module_tested',
          metadata: JSON.stringify({
            resourceType: 'module',
            resourceId: module.id,
            moduleName: validated.moduleName,
            overallStatus,
            testCount: results.length,
            failCount,
            warningCount,
            passCount
          })
        }
      );
      
      onProgress?.(100, 'Testes concluídos!');
      
      return {
        success: true,
        moduleName: validated.moduleName,
        overallStatus,
        summary: {
          total: results.length,
          passed: passCount,
          failed: failCount,
          warnings: warningCount
        },
        results,
        message: overallStatus === 'pass' 
          ? `✓ Módulo "${validated.moduleName}" está funcionando corretamente`
          : overallStatus === 'warning'
          ? `⚠ Módulo "${validated.moduleName}" tem ${warningCount} aviso(s)`
          : `✗ Módulo "${validated.moduleName}" falhou em ${failCount} teste(s)`
      };
      
    } catch (error: any) {
      console.error('[test_module] Error:', error);
      
      if (error.name === 'ZodError') {
        return {
          success: false,
          error: 'Erro de validação',
          details: error.errors,
          suggestion: 'Verifique os parâmetros fornecidos'
        };
      }
      
      return {
        success: false,
        error: error.message || 'Erro ao testar módulo',
        suggestion: 'Verifique os dados fornecidos e tente novamente'
      };
    }
  }
  
  private async testModuleSpecific(
    moduleName: string,
    tenantId: string,
    config: Record<string, any>
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Validate actual database data based on module type
    switch (moduleName) {
      case 'financeiro':
        // Check for chart of accounts ENTRIES (not just config)
        const accountsResult = await db
          .select({ count: count() })
          .from(chartOfAccounts)
          .where(and(
            eq(chartOfAccounts.tenantId, tenantId),
            eq(chartOfAccounts.isActive, true)
          ));
        
        const accountsCount = accountsResult[0]?.count || 0;
        
        if (accountsCount === 0) {
          results.push({
            category: 'Module Data',
            test: 'Chart of Accounts',
            status: 'fail',
            message: 'Nenhuma conta contábil configurada - módulo financeiro não pode funcionar sem plano de contas',
            details: { 
              found: 0,
              required: 'minimum 1',
              suggestion: 'Configure o plano de contas usando configure_module_settings ou importe um template'
            }
          });
        } else {
          results.push({
            category: 'Module Data',
            test: 'Chart of Accounts',
            status: 'pass',
            message: `${accountsCount} conta(s) contábil(is) configurada(s)`,
            details: { accountsCount }
          });
        }
        
        // Check fiscal year configuration
        if (!config.fiscalYear) {
          results.push({
            category: 'Module Configuration',
            test: 'Fiscal Year',
            status: 'fail',
            message: 'Ano fiscal não configurado',
            details: { suggestion: 'Configure usando configure_module_settings' }
          });
        } else {
          results.push({
            category: 'Module Configuration',
            test: 'Fiscal Year',
            status: 'pass',
            message: 'Ano fiscal configurado',
            details: { fiscalYear: config.fiscalYear }
          });
        }
        break;
        
      case 'compras':
        // Check for suppliers DATA
        const suppliersResult = await db
          .select({ count: count() })
          .from(suppliers)
          .where(eq(suppliers.tenantId, tenantId));
        
        const suppliersCount = suppliersResult[0]?.count || 0;
        
        if (suppliersCount === 0) {
          results.push({
            category: 'Module Data',
            test: 'Suppliers',
            status: 'fail',
            message: 'Nenhum fornecedor cadastrado - módulo de compras precisa de fornecedores',
            details: { 
              found: 0,
              required: 'minimum 1',
              suggestion: 'Cadastre fornecedores usando as ferramentas de compras ou importe de planilha'
            }
          });
        } else {
          results.push({
            category: 'Module Data',
            test: 'Suppliers',
            status: 'pass',
            message: `${suppliersCount} fornecedor(es) cadastrado(s)`,
            details: { suppliersCount }
          });
        }
        
        // Check approval workflow configuration
        if (!config.approvalWorkflow) {
          results.push({
            category: 'Module Configuration',
            test: 'Approval Workflow',
            status: 'warning',
            message: 'Workflow de aprovação não configurado',
            details: { suggestion: 'Configure usando configure_module_settings para automação de aprovações' }
          });
        } else {
          results.push({
            category: 'Module Configuration',
            test: 'Approval Workflow',
            status: 'pass',
            message: 'Workflow de aprovação configurado',
            details: { workflowType: config.approvalWorkflow }
          });
        }
        break;
        
      case 'comercial':
        // Check for clients/customers DATA
        const clientsResult = await db
          .select({ count: count() })
          .from(clients)
          .where(eq(clients.tenantId, tenantId));
        
        const clientsCount = clientsResult[0]?.count || 0;
        
        if (clientsCount === 0) {
          results.push({
            category: 'Module Data',
            test: 'Clients/Customers',
            status: 'warning',
            message: 'Nenhum cliente cadastrado',
            details: { 
              found: 0,
              suggestion: 'Cadastre clientes para usar funcionalidades do módulo comercial'
            }
          });
        } else {
          results.push({
            category: 'Module Data',
            test: 'Clients/Customers',
            status: 'pass',
            message: `${clientsCount} cliente(s) cadastrado(s)`,
            details: { clientsCount }
          });
        }
        
        // Check for products DATA
        const productsResult = await db
          .select({ count: count() })
          .from(products)
          .where(and(
            eq(products.tenantId, tenantId),
            eq(products.isActive, true)
          ));
        
        const productsCount = productsResult[0]?.count || 0;
        
        if (productsCount === 0) {
          results.push({
            category: 'Module Data',
            test: 'Products',
            status: 'warning',
            message: 'Nenhum produto cadastrado',
            details: { 
              found: 0,
              suggestion: 'Cadastre produtos para criar orçamentos e vendas'
            }
          });
        } else {
          results.push({
            category: 'Module Data',
            test: 'Products',
            status: 'pass',
            message: `${productsCount} produto(s) cadastrado(s)`,
            details: { productsCount }
          });
        }
        
        // Check tax configuration
        const taxRatesResult = await db
          .select({ count: count() })
          .from(taxRates)
          .where(eq(taxRates.tenantId, tenantId));
        
        const taxRatesCount = taxRatesResult[0]?.count || 0;
        
        if (taxRatesCount === 0) {
          results.push({
            category: 'Module Data',
            test: 'Tax Configuration',
            status: 'fail',
            message: 'Nenhuma taxa fiscal configurada - necessário para faturação',
            details: { 
              found: 0,
              required: 'minimum 1',
              suggestion: 'Configure taxas fiscais (IVA, etc.) usando configure_module_settings'
            }
          });
        } else {
          results.push({
            category: 'Module Data',
            test: 'Tax Configuration',
            status: 'pass',
            message: `${taxRatesCount} taxa(s) fiscal(is) configurada(s)`,
            details: { taxRatesCount }
          });
        }
        break;
        
      case 'logistica':
      case 'projetos':
        // These modules have flexible configuration
        results.push({
          category: 'Module Specific',
          test: 'Module Configuration',
          status: 'pass',
          message: `Module ${moduleName} is operational (flexible configuration)`,
          details: { 
            note: 'This module does not require specific mandatory configuration',
            configKeys: Object.keys(config)
          }
        });
        break;
        
      default:
        results.push({
          category: 'Module Specific',
          test: 'Module Configuration',
          status: 'skip',
          message: 'Módulo não reconhecido ou sem validações específicas'
        });
    }
    
    return results;
  }
  
  private async testConnectors(
    moduleName: string,
    tenantId: string
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Get required integrations for this module
    const requiredIntegrations = MODULE_INTEGRATION_REQUIREMENTS[moduleName] || [];
    
    // If module doesn't require any integrations, skip this test
    if (requiredIntegrations.length === 0) {
      results.push({
        category: 'Integrations',
        test: 'Required Integrations',
        status: 'skip',
        message: `Módulo ${moduleName} não requer integrações específicas`,
        details: { note: 'Integrações opcionais podem melhorar funcionalidades' }
      });
      return results;
    }
    
    // Query active integrations
    const integrations = await db.query.apiIntegrations.findMany({
      where: and(
        eq(apiIntegrations.tenantId, tenantId),
        eq(apiIntegrations.isActive, true)
      )
    });
    
    const activeIntegrationKeys = integrations.map((i: any) => i.integrationKey);
    const missingIntegrations = requiredIntegrations.filter(
      key => !activeIntegrationKeys.includes(key)
    );
    
    if (missingIntegrations.length > 0) {
      results.push({
        category: 'Integrations',
        test: 'Required Integrations',
        status: 'fail',
        message: `Integrações necessárias faltando: ${missingIntegrations.join(', ')}`,
        details: { 
          required: requiredIntegrations,
          found: activeIntegrationKeys,
          missing: missingIntegrations,
          suggestion: 'Configure as integrações necessárias usando setup_connector'
        }
      });
    } else {
      results.push({
        category: 'Integrations',
        test: 'Required Integrations',
        status: 'pass',
        message: 'Todas as integrações necessárias estão ativas',
        details: { 
          required: requiredIntegrations,
          active: integrations.map((i: any) => ({ 
            key: i.integrationKey, 
            name: i.integrationName
          })) 
        }
      });
    }
    
    return results;
  }
  
  private async testRequiredData(
    moduleName: string,
    tenantId: string
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Check organization structure (important for most modules)
    const deptsResult = await db
      .select({ count: count() })
      .from(departments)
      .where(eq(departments.tenantId, tenantId));
    
    const deptsCount = deptsResult[0]?.count || 0;
    
    // Departments are not critical for all modules, just a warning
    if (deptsCount === 0) {
      results.push({
        category: 'Organization Structure',
        test: 'Departments',
        status: 'warning',
        message: 'Nenhum departamento configurado',
        details: { 
          suggestion: 'Configure estrutura organizacional usando setup_organization_structure para melhor gestão'
        }
      });
    } else {
      results.push({
        category: 'Organization Structure',
        test: 'Departments',
        status: 'pass',
        message: `${deptsCount} departamento(s) configurado(s)`,
        details: { deptsCount }
      });
    }
    
    // Module-specific data requirements
    switch (moduleName) {
      case 'financeiro':
        // Additional check: cost centers (if needed for advanced accounting)
        // Note: Cost centers are typically part of chartOfAccounts in modern systems
        // or stored in a separate costCenters table - this is just a placeholder
        // for future expansion when cost centers table is fully implemented
        results.push({
          category: 'Advanced Data',
          test: 'Cost Centers',
          status: 'skip',
          message: 'Centros de custo não implementados nesta versão',
          details: { note: 'Funcionalidade será adicionada em versão futura' }
        });
        break;
        
      case 'compras':
        // Already validated suppliers in testModuleSpecific
        // Could add validation for purchase categories, payment terms templates, etc.
        break;
        
      case 'comercial':
        // Already validated clients, products, and tax rates in testModuleSpecific
        break;
        
      case 'logistica':
      case 'projetos':
        // These modules work with flexible data structures
        results.push({
          category: 'Module Data',
          test: 'Data Requirements',
          status: 'pass',
          message: `Módulo ${moduleName} pronto para uso`,
          details: { note: 'Módulo funciona com dados criados dinamicamente' }
        });
        break;
    }
    
    return results;
  }
}
