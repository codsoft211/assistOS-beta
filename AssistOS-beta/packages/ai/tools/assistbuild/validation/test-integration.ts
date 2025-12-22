import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { 
  apiIntegrations
} from '../../../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { insertIntoTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

const inputSchema = z.object({
  integrationId: z.string().optional(), // Test specific integration, or all if omitted
  testConnectivity: z.boolean().optional().default(true),
  testCredentials: z.boolean().optional().default(true),
});

type TestIntegrationInput = z.infer<typeof inputSchema>;

interface TestResult {
  integrationId: string;
  integrationName: string;
  integrationKey: string;
  category: string;
  test: string;
  status: 'pass' | 'fail' | 'warning' | 'skip';
  message: string;
  details?: any;
}

export class TestIntegrationTool extends ToolBase<TestIntegrationInput, any> {
  manifest: ToolManifest = {
    name: 'test_integration',
    category: 'validation',
    description: 'Tests configured integrations, validating connectivity, credentials and configurations',
    parameters: [
      { name: 'integrationId', type: 'string', description: 'Specific integration ID (optional, omit to test all)', required: false },
      { name: 'testConnectivity', type: 'boolean', description: 'Test connectivity (default: true)', required: false },
      { name: 'testCredentials', type: 'boolean', description: 'Validate credentials (default: true)', required: false },
    ],
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: TestIntegrationInput,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      const allResults: TestResult[] = [];
      
      onProgress?.(10, 'Searching integrations...');
      
      // Fetch integrations to test
      let integrations;
      if (validated.integrationId) {
        const integration = await db.query.apiIntegrations.findFirst({
          where: and(
            eq(apiIntegrations.id, validated.integrationId),
            eq(apiIntegrations.tenantId, context.tenantId)
          )
        });
        
        if (!integration) {
          return {
            success: false,
            error: `Integration ${validated.integrationId} not found in this tenant`
          };
        }
        
        integrations = [integration];
      } else {
        integrations = await db.query.apiIntegrations.findMany({
          where: eq(apiIntegrations.tenantId, context.tenantId)
        });
      }
      
      if (integrations.length === 0) {
        return {
          success: true,
          message: 'No integrations configured in this tenant',
          summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
          results: []
        };
      }
      
      onProgress?.(20, `Testing ${integrations.length} integration(s)...`);
      
      // Test each integration
      const progressPerIntegration = 70 / integrations.length;
      
      for (let i = 0; i < integrations.length; i++) {
        const integration = integrations[i] as any;
        const baseProgress = 20 + (i * progressPerIntegration);
        
        onProgress?.(baseProgress, `Testing ${integration.integrationName}...`);
        
        const integrationResults = await this.testSingleIntegration(
          integration,
          validated,
          context
        );
        
        allResults.push(...integrationResults);
      }
      
      // Calculate summary
      const byIntegration = this.groupResultsByIntegration(allResults);
      const failCount = allResults.filter(r => r.status === 'fail').length;
      const warningCount = allResults.filter(r => r.status === 'warning').length;
      const passCount = allResults.filter(r => r.status === 'pass').length;
      
      const overallStatus = failCount > 0 ? 'fail' : 
                           warningCount > 0 ? 'warning' : 'pass';
      
      onProgress?.(90, 'Recording audit log...');
      
      await insertIntoTenantTable(
        context.tenantId,
        'audit_log',
        {
          tenant_id: context.tenantId,
          actor_user_id: context.userId,
          action: 'integrations_tested',
          metadata: JSON.stringify({
            resourceType: 'api_integrations',
            integrationCount: integrations.length,
            overallStatus,
            testCount: allResults.length,
            failCount,
            warningCount,
            passCount
          })
        }
      );
      
      onProgress?.(100, 'Tests completed!');
      
      return {
        success: true,
        overallStatus,
        summary: {
          total: allResults.length,
          passed: passCount,
          failed: failCount,
          warnings: warningCount,
          integrationsTested: integrations.length
        },
        byIntegration,
        results: allResults,
        message: overallStatus === 'pass' 
          ? `✓ ${integrations.length} integration(s) tested successfully`
          : overallStatus === 'warning'
          ? `⚠ ${integrations.length} integration(s) tested with ${warningCount} warning(s)`
          : `✗ ${integrations.length} integration(s) tested - ${failCount} failure(s)`
      };
      
    } catch (error: any) {
      console.error('[test_integration] Error:', error);
      
      if (error.name === 'ZodError') {
        return {
          success: false,
          error: 'Validation error',
          details: error.errors,
          suggestion: 'Check the provided parameters'
        };
      }
      
      return {
        success: false,
        error: error.message || 'Error testing integrations',
        suggestion: 'Check the provided data and try again'
      };
    }
  }
  
  private async testSingleIntegration(
    integration: any,
    options: TestIntegrationInput,
    context: ToolExecutionContext
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Test 1: Active status
    results.push({
      integrationId: integration.id,
      integrationName: integration.integrationName,
      integrationKey: integration.integrationKey,
      category: 'Status',
      test: 'Is Active',
      status: integration.isActive ? 'pass' : 'warning',
      message: integration.isActive ? 'Integration is active' : 'Integration is inactive'
    });
    
    // Test 2: Base URL configured
    if (!integration.baseUrl || integration.baseUrl.trim() === '') {
      results.push({
        integrationId: integration.id,
        integrationName: integration.integrationName,
        integrationKey: integration.integrationKey,
        category: 'Configuration',
        test: 'Base URL',
        status: 'fail',
        message: 'Base URL not configured'
      });
    } else {
      results.push({
        integrationId: integration.id,
        integrationName: integration.integrationName,
        integrationKey: integration.integrationKey,
        category: 'Configuration',
        test: 'Base URL',
        status: 'pass',
        message: 'Base URL configured',
        details: { baseUrl: integration.baseUrl }
      });
    }
    
    // Test 3: Auth configuration
    if (options.testCredentials) {
      const authConfigured = integration.authConfig && 
                            Object.keys(integration.authConfig).length > 0;
      
      if (!authConfigured) {
        results.push({
          integrationId: integration.id,
          integrationName: integration.integrationName,
          integrationKey: integration.integrationKey,
          category: 'Authentication',
          test: 'Auth Configuration',
          status: 'fail',
          message: 'Authentication configuration missing',
          details: { authType: integration.authType }
        });
      } else {
        // Check if required fields are present based on auth type
        const authStatus = this.validateAuthConfig(
          integration.authType,
          integration.authConfig
        );
        
        results.push({
          integrationId: integration.id,
          integrationName: integration.integrationName,
          integrationKey: integration.integrationKey,
          category: 'Authentication',
          test: 'Auth Configuration',
          status: authStatus.status,
          message: authStatus.message,
          details: authStatus.details
        });
      }
      
      // Check credential reference
      if (!integration.credentialId) {
        results.push({
          integrationId: integration.id,
          integrationName: integration.integrationName,
          integrationKey: integration.integrationKey,
          category: 'Authentication',
          test: 'Credentials Reference',
          status: 'warning',
          message: 'No credential linked (using authConfig directly)'
        });
      } else {
        results.push({
          integrationId: integration.id,
          integrationName: integration.integrationName,
          integrationKey: integration.integrationKey,
          category: 'Authentication',
          test: 'Credentials Reference',
          status: 'pass',
          message: 'Credential linked',
          details: { credentialId: integration.credentialId }
        });
      }
    }
    
    // Test 4: Endpoints configured
    const endpoints = integration.endpoints || [];
    if (endpoints.length === 0) {
      results.push({
        integrationId: integration.id,
        integrationName: integration.integrationName,
        integrationKey: integration.integrationKey,
        category: 'Configuration',
        test: 'Endpoints',
        status: 'warning',
        message: 'No endpoints configured'
      });
    } else {
      results.push({
        integrationId: integration.id,
        integrationName: integration.integrationName,
        integrationKey: integration.integrationKey,
        category: 'Configuration',
        test: 'Endpoints',
        status: 'pass',
        message: `${endpoints.length} endpoint(s) configured`,
        details: { endpointCount: endpoints.length }
      });
    }
    
    // Test 5: Environment
    if (!integration.environment || integration.environment.trim() === '') {
      results.push({
        integrationId: integration.id,
        integrationName: integration.integrationName,
        integrationKey: integration.integrationKey,
        category: 'Configuration',
        test: 'Environment',
        status: 'fail',
        message: 'Environment not defined'
      });
    } else {
      results.push({
        integrationId: integration.id,
        integrationName: integration.integrationName,
        integrationKey: integration.integrationKey,
        category: 'Configuration',
        test: 'Environment',
        status: 'pass',
        message: `Environment: ${integration.environment}`,
        details: { environment: integration.environment }
      });
    }
    
    // Test 6: Connectivity (basic URL validation)
    if (options.testConnectivity && integration.baseUrl) {
      const connectivityTest = this.validateUrlFormat(integration.baseUrl);
      results.push({
        integrationId: integration.id,
        integrationName: integration.integrationName,
        integrationKey: integration.integrationKey,
        category: 'Connectivity',
        test: 'URL Format',
        status: connectivityTest.status,
        message: connectivityTest.message,
        details: connectivityTest.details
      });
    }
    
    return results;
  }
  
  private validateAuthConfig(
    authType: string,
    authConfig: any
  ): { status: 'pass' | 'fail' | 'warning'; message: string; details?: any } {
    // Validate authType is supported
    const supportedAuthTypes = ['bearer', 'api_key', 'oauth', 'basic'];
    
    if (!authType || authType.trim() === '') {
      return {
        status: 'fail',
        message: 'Authentication type not defined'
      };
    }
    
    if (!supportedAuthTypes.includes(authType)) {
      return {
        status: 'fail',
        message: `Authentication type "${authType}" not supported`,
        details: { authType, supportedTypes: supportedAuthTypes }
      };
    }
    
    if (!authConfig) {
      return {
        status: 'fail',
        message: 'Authentication configuration missing'
      };
    }
    
    const requiredFields: Record<string, string[]> = {
      bearer: ['token'],
      api_key: ['apiKey'],
      oauth: ['clientId', 'clientSecret'],
      basic: ['username', 'password']
    };
    
    const required = requiredFields[authType];
    const configKeys = Object.keys(authConfig);
    const missing = required.filter(field => !configKeys.includes(field));
    
    if (missing.length > 0) {
      return {
        status: 'fail',
        message: `Required fields missing: ${missing.join(', ')}`,
        details: { authType, missing }
      };
    }
    
    // Check if fields have values
    const emptyFields = required.filter(field => {
      const value = authConfig[field];
      return !value || (typeof value === 'string' && value.trim() === '');
    });
    
    if (emptyFields.length > 0) {
      return {
        status: 'fail',
        message: `Empty fields: ${emptyFields.join(', ')}`,
        details: { authType, emptyFields }
      };
    }
    
    return {
      status: 'pass',
      message: `Authentication ${authType} configured correctly`,
      details: { authType, fieldsConfigured: required }
    };
  }
  
  private validateUrlFormat(url: string): { 
    status: 'pass' | 'fail' | 'warning'; 
    message: string; 
    details?: any 
  } {
    try {
      const parsed = new URL(url);
      
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return {
          status: 'fail',
          message: 'URL must use HTTP or HTTPS protocol',
          details: { protocol: parsed.protocol }
        };
      }
      
      if (parsed.protocol === 'http:') {
        return {
          status: 'warning',
          message: 'URL uses insecure HTTP (HTTPS recommended)',
          details: { url: parsed.href }
        };
      }
      
      return {
        status: 'pass',
        message: 'Valid and secure URL (HTTPS)',
        details: { url: parsed.href }
      };
      
    } catch (error) {
      return {
        status: 'fail',
        message: 'Invalid URL',
        details: { error: (error as Error).message }
      };
    }
  }
  
  private groupResultsByIntegration(results: TestResult[]): Record<string, {
    integrationName: string;
    integrationKey: string;
    status: 'pass' | 'fail' | 'warning';
    tests: TestResult[];
  }> {
    const grouped: Record<string, any> = {};
    
    for (const result of results) {
      if (!grouped[result.integrationId]) {
        grouped[result.integrationId] = {
          integrationName: result.integrationName,
          integrationKey: result.integrationKey,
          tests: [],
          status: 'pass'
        };
      }
      
      grouped[result.integrationId].tests.push(result);
      
      // Update overall status for this integration
      if (result.status === 'fail') {
        grouped[result.integrationId].status = 'fail';
      } else if (result.status === 'warning' && grouped[result.integrationId].status !== 'fail') {
        grouped[result.integrationId].status = 'warning';
      }
    }
    
    return grouped;
  }
}
