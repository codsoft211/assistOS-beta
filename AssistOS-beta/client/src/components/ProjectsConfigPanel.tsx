import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  FileText, Link as LinkIcon, Eye, AlertCircle, Loader2,
  CheckCircle, FolderKanban, Settings
} from "lucide-react";
import TemplateSelector from "@/components/projects/TemplateSelector";
import FieldManager from "@/components/projects/FieldManager";
import PreviewPanel from "@/components/projects/PreviewPanel";
import EntityConfigDialog from "@/components/EntityConfigDialog";
import LinkConfirmDialog from "@/components/LinkConfirmDialog";

interface ModuleTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  suggestedFor: string[];
  configuration: {
    customEntities: any[];
    customWorkflows: any[];
    enabledFeatures: string[];
  };
}

interface CustomEntity {
  id: string;
  tenantId: string;
  entityKey: string;
  displayName: string;
  displayNamePlural: string;
  description?: string;
  icon?: string;
  color?: string;
  category: string;
  environment: 'sandbox' | 'production';
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

type PageType = 'phases' | 'resources' | 'tasks' | 'documents' | 'activities' | 'invoices' | 'bills' | 'warehouses';
type EntityType = 'phases' | 'resources' | 'tasks' | 'documents' | 'warehouses';
type LinkType = 'activities' | 'invoices' | 'bills';

const isLinkType = (type: PageType): type is LinkType => {
  return ['activities', 'invoices', 'bills'].includes(type);
};

export default function ProjectsConfigPanel() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('manual');
  const [entityDialogOpen, setEntityDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState<EntityType>('phases');
  const [selectedLinkType, setSelectedLinkType] = useState<LinkType>('activities');

  // Mutation para ativar uma página com configuração padrão
  const activatePageMutation = useMutation({
    mutationFn: async ({ pageType, config }: { pageType: PageType; config: any }) => {
      return await apiRequest('POST', '/api/modules/projects/entities', config);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'sandbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'production'] });
      toast({
        title: "Página ativada!",
        description: `A página foi adicionada com configuração padrão. Use "Configurar" para personalizar.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao ativar página.",
        variant: "destructive",
      });
    },
  });

  const handleActivatePage = (pageType: PageType) => {
    // Configuração padrão para cada tipo de página
    const defaultConfigs: Record<PageType, any> = {
      phases: {
        entityKey: 'project_phases',
        displayName: 'Phases & Milestones',
        displayNamePlural: 'Phases & Milestones',
        description: 'Gerenciamento de fases e marcos do projeto',
        icon: 'FolderKanban',
        color: '#3B82F6',
        environment: 'sandbox',
        metadata: {
          defaultItems: [
            { name: 'Planning', description: 'Planejamento inicial' },
            { name: 'Execution', description: 'Execução do projeto' },
            { name: 'Closing', description: 'Encerramento' }
          ]
        }
      },
      resources: {
        entityKey: 'project_resources',
        displayName: 'Resources',
        displayNamePlural: 'Resources',
        description: 'Gestão de recursos do projeto',
        icon: 'Users',
        color: '#10B981',
        environment: 'sandbox',
        metadata: {
          defaultItems: [
            { name: 'Team Members', description: 'Membros da equipe' },
            { name: 'Equipment', description: 'Equipamentos' },
            { name: 'Materials', description: 'Materiais' }
          ]
        }
      },
      documents: {
        entityKey: 'project_documents',
        displayName: 'Documents',
        displayNamePlural: 'Documents',
        description: 'Documentos e arquivos do projeto',
        icon: 'FileText',
        color: '#F59E0B',
        environment: 'sandbox',
        metadata: {
          defaultItems: [
            { name: 'Contract', description: 'Contratos' },
            { name: 'Proposal', description: 'Propostas' },
            { name: 'Report', description: 'Relatórios' }
          ]
        }
      },
      tasks: {
        entityKey: 'project_tasks',
        displayName: 'Tasks & Deliverables',
        displayNamePlural: 'Tasks & Deliverables',
        description: 'Tarefas e entregas do projeto',
        icon: 'CheckCircle',
        color: '#8B5CF6',
        environment: 'sandbox',
        metadata: {
          defaultItems: [
            { name: 'To Do', description: 'A fazer' },
            { name: 'In Progress', description: 'Em andamento' },
            { name: 'Done', description: 'Concluído' }
          ]
        }
      },
      warehouses: {
        entityKey: 'project_warehouses',
        displayName: 'Warehouses',
        displayNamePlural: 'Warehouses',
        description: 'Armazéns e locais de armazenamento',
        icon: 'Building2',
        color: '#EF4444',
        environment: 'sandbox',
        metadata: {
          defaultItems: [
            { name: 'Main Storage', description: 'Armazém principal' },
            { name: 'Project Site', description: 'Local da obra' }
          ]
        }
      },
      activities: {
        entityKey: 'crm_activities_link',
        displayName: 'Activities',
        displayNamePlural: 'Activities',
        description: 'Atividades do CRM vinculadas ao projeto',
        icon: 'Link',
        color: '#06B6D4',
        environment: 'sandbox',
        metadata: { 
          linkType: 'activities', 
          sourceModule: 'crm',
          isIntegration: true 
        }
      },
      invoices: {
        entityKey: 'financial_invoices_link',
        displayName: 'Invoices',
        displayNamePlural: 'Invoices',
        description: 'Faturas do módulo financeiro vinculadas ao projeto',
        icon: 'Link',
        color: '#EC4899',
        environment: 'sandbox',
        metadata: { 
          linkType: 'invoices', 
          sourceModule: 'financial',
          isIntegration: true 
        }
      },
      bills: {
        entityKey: 'financial_bills_link',
        displayName: 'Bills',
        displayNamePlural: 'Bills',
        description: 'Contas a pagar do módulo financeiro vinculadas ao projeto',
        icon: 'Link',
        color: '#F97316',
        environment: 'sandbox',
        metadata: { 
          linkType: 'bills', 
          sourceModule: 'financial',
          isIntegration: true 
        }
      }
    };

    activatePageMutation.mutate({ 
      pageType, 
      config: defaultConfigs[pageType] 
    });
  };

  const handleOpenConfigDialog = (pageType: PageType) => {
    if (isLinkType(pageType)) {
      setSelectedLinkType(pageType);
      setLinkDialogOpen(true);
    } else {
      setSelectedEntityType(pageType);
      setEntityDialogOpen(true);
    }
  };

  // Fetch available templates
  const { data: templatesData, isLoading: templatesLoading, error: templatesError } = useQuery<{ templates: ModuleTemplate[] }>({
    queryKey: ['/api/modules/projects/templates'],
  });

  // Fetch current custom entities (sandbox environment)
  const { data: entitiesData, isLoading: entitiesLoading, error: entitiesError, refetch: refetchEntities } = useQuery<{ entities: CustomEntity[] }>({
    queryKey: ['/api/modules/projects/entities', 'sandbox'],
  });

  const templates = templatesData?.templates || [];
  const customEntities = entitiesData?.entities || [];
  const hasConfiguration = customEntities.length > 0;

  // Helper para verificar se uma página já está ativa
  const isPageActive = (pageType: PageType): boolean => {
    const entityKeyMap: Record<PageType, string> = {
      phases: 'project_phases',
      resources: 'project_resources',
      documents: 'project_documents',
      tasks: 'project_tasks',
      warehouses: 'project_warehouses',
      activities: 'crm_activities_link',
      invoices: 'financial_invoices_link',
      bills: 'financial_bills_link'
    };
    return customEntities.some(entity => entity.entityKey === entityKeyMap[pageType]);
  };

  return (
    <div className="space-y-6" data-testid="panel-projects-config">
      {/* Status Banner */}
      {hasConfiguration && (
        <Alert data-testid="alert-config-status">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription>
            Configuração ativa com <strong>{customEntities.length}</strong> entidades personalizadas.
            Use a tab "Preview" para visualizar e publicar para produção.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="manual" data-testid="tab-manual">
            <Settings className="h-4 w-4 mr-2" />
            Manual
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">
            <FileText className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="fields" data-testid="tab-fields" disabled={!hasConfiguration}>
            <LinkIcon className="h-4 w-4 mr-2" />
            Fields & Links
          </TabsTrigger>
          <TabsTrigger value="preview" data-testid="tab-preview" disabled={!hasConfiguration}>
            <Eye className="h-4 w-4 mr-2" />
            Preview & Publish
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mt-6">
          <Card data-testid="card-manual">
            <CardHeader>
              <CardTitle>Configuração Manual</CardTitle>
              <CardDescription>
                Crie entidades personalizadas manualmente. Depois pode aplicar templates ou publicar diretamente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert data-testid="alert-manual-help">
                  <FolderKanban className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Page Builder:</strong> Adicione páginas/tabs ao módulo Projects. Cada página pode ter campos próprios e links cross-module (CRM, Financial, Logistics).
                  </AlertDescription>
                </Alert>

                <div className="space-y-6">
                  {/* Active Pages Section */}
                  {hasConfiguration && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-lg">Páginas Ativas ({customEntities.length})</h3>
                        <Badge variant="default">Configuradas</Badge>
                      </div>
                      <div className="grid gap-3">
                        {customEntities.map((entity) => {
                          const reverseMap: Record<string, PageType> = {
                            'project_phases': 'phases',
                            'project_resources': 'resources',
                            'project_documents': 'documents',
                            'project_tasks': 'tasks',
                            'project_warehouses': 'warehouses',
                            'crm_activities_link': 'activities',
                            'financial_invoices_link': 'invoices',
                            'financial_bills_link': 'bills'
                          };
                          const pageType = reverseMap[entity.entityKey];
                          
                          return (
                            <Card key={entity.id} className="hover-elevate" data-testid={`card-active-${entity.entityKey}`}>
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                    <div>
                                      <h4 className="font-semibold">{entity.displayName}</h4>
                                      <p className="text-xs text-muted-foreground">{entity.entityKey}</p>
                                    </div>
                                  </div>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => pageType && handleOpenConfigDialog(pageType)}
                                    data-testid={`button-configure-${entity.entityKey}`}
                                  >
                                    <Settings className="h-4 w-4 mr-2" />
                                    Configurar
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Available Pages Catalog */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg">Páginas Disponíveis</h3>
                      <Badge variant="secondary">Catálogo</Badge>
                    </div>
                  
                  <div className="grid gap-3">
                    {/* Core Pages */}
                    <Card className="hover-elevate" data-testid="card-page-projects">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <FolderKanban className="h-5 w-5 text-primary" />
                              <h4 className="font-semibold">Projects Dashboard</h4>
                              <Badge variant="outline">Core</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              Listagem e gestão de projetos: código, cliente, datas, orçamento, status, prioridade
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="secondary" className="text-xs">projectCode</Badge>
                              <Badge variant="secondary" className="text-xs">clientId</Badge>
                              <Badge variant="secondary" className="text-xs">status</Badge>
                              <Badge variant="secondary" className="text-xs">priority</Badge>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => handleActivatePage('phases')}
                            disabled={isPageActive('phases')}
                            data-testid="button-activate-projects"
                          >
                            {isPageActive('phases') ? 'Ativada' : 'Ativar'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="hover-elevate" data-testid="card-page-phases">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <CheckCircle className="h-5 w-5 text-primary" />
                              <h4 className="font-semibold">Phases & Milestones</h4>
                              <Badge variant="outline">Core</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              Fases/etapas do projeto: nome, datas, status, % conclusão, orçamento
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="secondary" className="text-xs">phaseName</Badge>
                              <Badge variant="secondary" className="text-xs">status</Badge>
                              <Badge variant="secondary" className="text-xs">percentComplete</Badge>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => handleActivatePage('phases')}
                            disabled={isPageActive('phases')}
                            data-testid="button-activate-phases"
                          >
                            {isPageActive('phases') ? 'Ativada' : 'Ativar'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="hover-elevate" data-testid="card-page-resources">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Settings className="h-5 w-5 text-primary" />
                              <h4 className="font-semibold">Resources</h4>
                              <Badge variant="outline">Core</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              Recursos alocados: humanos, equipamentos, materiais, externos
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="secondary" className="text-xs">resourceType</Badge>
                              <Badge variant="secondary" className="text-xs">quantity</Badge>
                              <Badge variant="secondary" className="text-xs">costPerUnit</Badge>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => handleActivatePage('resources')}
                            disabled={isPageActive('resources')}
                            data-testid="button-activate-resources"
                          >
                            {isPageActive('resources') ? 'Ativada' : 'Ativar'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="hover-elevate" data-testid="card-page-documents">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <FileText className="h-5 w-5 text-primary" />
                              <h4 className="font-semibold">Documents</h4>
                              <Badge variant="outline">Core</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              Gestão de documentos: contratos, propostas, relatórios, desenhos
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="secondary" className="text-xs">documentType</Badge>
                              <Badge variant="secondary" className="text-xs">fileUrl</Badge>
                              <Badge variant="secondary" className="text-xs">category</Badge>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => handleActivatePage('documents')}
                            disabled={isPageActive('documents')}
                            data-testid="button-activate-documents"
                          >
                            {isPageActive('documents') ? 'Ativada' : 'Ativar'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Cross-Module Pages */}
                    <div className="col-span-full">
                      <h4 className="font-semibold text-sm text-muted-foreground mb-3 mt-2">Cross-Module Integration</h4>
                    </div>

                    <Card className="hover-elevate" data-testid="card-page-activities">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <AlertCircle className="h-5 w-5 text-blue-600" />
                              <h4 className="font-semibold">Activities</h4>
                              <Badge variant="secondary">CRM Link</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              Reuniões, calls, emails linkados ao projeto (integração com CRM Activities)
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="secondary" className="text-xs">activityType</Badge>
                              <Badge variant="secondary" className="text-xs">linkedProjectId</Badge>
                              <Badge variant="secondary" className="text-xs">participants</Badge>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => handleActivatePage('activities')}
                            disabled={isPageActive('activities')}
                            data-testid="button-activate-activities"
                          >
                            {isPageActive('activities') ? 'Ativada' : 'Ativar'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="hover-elevate" data-testid="card-page-invoices">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <FileText className="h-5 w-5 text-green-600" />
                              <h4 className="font-semibold">Invoices</h4>
                              <Badge variant="secondary">Financial Link</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              Faturas emitidas para o projeto (integração com Financial AR)
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="secondary" className="text-xs">invoiceNumber</Badge>
                              <Badge variant="secondary" className="text-xs">linkedProjectId</Badge>
                              <Badge variant="secondary" className="text-xs">totalAmount</Badge>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => handleActivatePage('invoices')}
                            disabled={isPageActive('invoices')}
                            data-testid="button-activate-invoices"
                          >
                            {isPageActive('invoices') ? 'Ativada' : 'Ativar'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="hover-elevate" data-testid="card-page-bills">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <FileText className="h-5 w-5 text-orange-600" />
                              <h4 className="font-semibold">Bills & Expenses</h4>
                              <Badge variant="secondary">Financial Link</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              Despesas e contas do projeto (integração com Financial AP)
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="secondary" className="text-xs">billNumber</Badge>
                              <Badge variant="secondary" className="text-xs">linkedProjectId</Badge>
                              <Badge variant="secondary" className="text-xs">category</Badge>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => handleActivatePage('bills')}
                            disabled={isPageActive('bills')}
                            data-testid="button-activate-bills"
                          >
                            {isPageActive('bills') ? 'Ativada' : 'Ativar'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="hover-elevate" data-testid="card-page-warehouses">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Settings className="h-5 w-5 text-purple-600" />
                              <h4 className="font-semibold">Project Warehouses</h4>
                              <Badge variant="secondary">Logistics Link</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              Armazéns/inventário do projeto (integração com Logistics)
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="secondary" className="text-xs">warehouseId</Badge>
                              <Badge variant="secondary" className="text-xs">linkedProjectId</Badge>
                              <Badge variant="secondary" className="text-xs">stockItems</Badge>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => handleActivatePage('warehouses')}
                            disabled={isPageActive('warehouses')}
                            data-testid="button-activate-warehouses"
                          >
                            {isPageActive('warehouses') ? 'Ativada' : 'Ativar'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <Card data-testid="card-templates">
            <CardHeader>
              <CardTitle>Templates (Opcional)</CardTitle>
              <CardDescription>
                Aplique templates pré-configurados para adicionar entidades rapidamente
              </CardDescription>
            </CardHeader>
            <CardContent>
              {templatesError ? (
                <Alert variant="destructive" data-testid="alert-templates-error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Erro ao carregar templates. {(templatesError as Error).message}
                  </AlertDescription>
                </Alert>
              ) : templatesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : (
                <TemplateSelector 
                  templates={templates} 
                  onTemplateApplied={() => {
                    refetchEntities();
                    toast({
                      title: "Template aplicado!",
                      description: "Entidades criadas com sucesso. Navegue para 'Fields & Links' para configurar.",
                    });
                  }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fields" className="mt-6">
          <Card data-testid="card-fields">
            <CardHeader>
              <CardTitle>Gerenciar Campos Personalizados</CardTitle>
              <CardDescription>
                Configure links cross-module (CRM, Financial, Compras) para campos personalizados
              </CardDescription>
            </CardHeader>
            <CardContent>
              {entitiesError ? (
                <Alert variant="destructive" data-testid="alert-entities-error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Erro ao carregar entidades. {(entitiesError as Error).message}
                  </AlertDescription>
                </Alert>
              ) : entitiesLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <FieldManager 
                  entities={customEntities}
                  onLinkCreated={() => {
                    queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'sandbox'] });
                    queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/links'] });
                    toast({
                      title: "Link criado!",
                      description: "Campo linkado com sucesso.",
                    });
                  }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="mt-6">
          <Card data-testid="card-preview">
            <CardHeader>
              <CardTitle>Preview & Publish</CardTitle>
              <CardDescription>
                Visualize a configuração sandbox antes de publicar para produção
              </CardDescription>
            </CardHeader>
            <CardContent>
              {entitiesLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <PreviewPanel 
                  entities={customEntities}
                  error={entitiesError as Error | undefined}
                  onPublish={() => {
                    queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'sandbox'] });
                    queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'production'] });
                    toast({
                      title: "Publicado!",
                      description: "Configuração promovida para produção com sucesso.",
                    });
                  }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Entity Configuration Dialog (phases, resources, documents, tasks, warehouses) */}
      <EntityConfigDialog
        open={entityDialogOpen}
        onOpenChange={setEntityDialogOpen}
        entityType={selectedEntityType}
        moduleId="projects"
      />

      {/* Link Confirmation Dialog (activities, invoices, bills) */}
      <LinkConfirmDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        linkType={selectedLinkType}
        moduleId="projects"
      />
    </div>
  );
}
