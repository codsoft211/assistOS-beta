import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';

export class GetIntegrationsCatalogTool extends ToolBase<{}, any> {
  manifest: ToolManifest = {
    name: 'get_integrations_catalog',
    category: 'discovery',
    description: 'Lists all integrations available in the platform and how to configure them',
    parameters: [],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: {}, context: ToolExecutionContext): Promise<any> {
    const integrations = [
      {
        id: 'gmail_oauth',
        name: 'Gmail OAuth 2.0',
        category: 'communication',
        description: 'Gmail integration via OAuth 2.0 for sending emails (USER-LEVEL configuration only)',
        status: 'available',
        setupMethod: 'oauth',
        howToSetup: {
          description: 'IMPORTANT: Gmail always connects per user in Settings. There is no shared corporate email option.',
          steps: [
            '1. Go to Settings → Communication',
            '2. Click the "Connect Gmail" button',
            '3. You will be redirected to secure Google login',
            '4. Authenticate with your Gmail account',
            '5. Authorize AssistOS to access Gmail (send only)',
            '6. You are redirected back with the account connected'
          ],
          location: 'Settings → Communication',
          maxAccounts: 2,
          notes: [
            'Each user connects their own Gmail accounts',
            'Maximum 2 Gmail accounts per user',
            'One account can be marked as Primary',
            'Tokens are encrypted with AES-256-GCM',
            'Automatic token refresh'
          ]
        },
        advantages: [
          '✅ Revocable access at any time',
          '✅ Google manages all security',
          '✅ Automatic token refresh',
          '✅ Limited scopes (email send only)',
          '✅ Zero passwords stored in AssistOS',
          '✅ Supports multi-tenant and multi-user'
        ],
        vsAlternatives: {
          'Application Password': {
            comparison: 'OAuth is MUCH more secure',
            reasons: [
              'OAuth: Revocable access | Password: Permanent',
              'OAuth: Google manages | Password: You store',
              'OAuth: Auto-refresh token | Password: Expires',
              'OAuth: Limited scopes | Password: Full access'
            ]
          }
        },
        features: [
          'Send emails through Gmail',
          'Support for multiple accounts per user',
          'Automatic token refresh',
          'Integration with Execution Engine (SendEmailGmailAction)',
          'Support for attachments and HTML'
        ],
        technicalDetails: {
          scopes: ['https://www.googleapis.com/auth/gmail.send'],
          encryption: 'AES-256-GCM for tokens',
          security: 'Cryptographically random state tokens (32 bytes)',
          tokenExpiration: 'Auto-refresh before expiration',
          tenantIsolation: 'Strict tenant isolation'
        }
      },
      {
        id: 'jasmin',
        name: 'Jasmin (Primavera BSS)',
        category: 'erp',
        description: 'Jasmin integration for ERP data synchronization',
        status: 'planned',
        setupMethod: 'api_key',
        howToSetup: {
          tenantLevel: {
            description: 'Jasmin API Key configuration',
            steps: [
              '1. Get API Key from Jasmin',
              '2. In /studio, ask AssistBuild to configure Jasmin',
              '3. Provide: API Key, Jasmin Tenant ID, Company Key',
              '4. AssistBuild tests the connection',
              '5. Activate automatic synchronization'
            ]
          }
        },
        features: [
          'Product synchronization',
          'Customer synchronization',
          'Order management',
          'Invoice integration'
        ]
      },
      {
        id: 'phc',
        name: 'PHC Software',
        category: 'erp',
        description: 'PHC integration for business management',
        status: 'planned',
        setupMethod: 'api_key'
      },
      {
        id: 'sap',
        name: 'SAP',
        category: 'erp',
        description: 'SAP integration for large enterprises',
        status: 'planned',
        setupMethod: 'api_key'
      },
      {
        id: 'stripe',
        name: 'Stripe Payments',
        category: 'payments',
        description: 'Online payment processing',
        status: 'planned',
        setupMethod: 'api_key'
      },
      {
        id: 'twilio',
        name: 'Twilio SMS',
        category: 'communication',
        description: 'SMS and notification sending',
        status: 'planned',
        setupMethod: 'api_key'
      }
    ];

    const byCategory = integrations.reduce((acc, integration) => {
      if (!acc[integration.category]) {
        acc[integration.category] = [];
      }
      acc[integration.category].push(integration);
      return acc;
    }, {} as Record<string, any[]>);

    const byStatus = integrations.reduce((acc, integration) => {
      if (!acc[integration.status]) {
        acc[integration.status] = [];
      }
      acc[integration.status].push(integration.name);
      return acc;
    }, {} as Record<string, string[]>);

    return {
      success: true,
      integrations,
      byCategory,
      byStatus,
      total: integrations.length,
      available: integrations.filter(i => i.status === 'available').length,
      planned: integrations.filter(i => i.status === 'planned').length,
      summary: `${integrations.length} cataloged integrations: ${byStatus.available?.length || 0} available, ${byStatus.planned?.length || 0} planned`
    };
  }
}
