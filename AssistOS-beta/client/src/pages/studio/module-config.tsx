import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Settings, Webhook, Clock, Bot, Workflow, BarChart3, AlertCircle } from "lucide-react";
import ProjectsConfigPanel from "@/components/ProjectsConfigPanel";

interface TenantModule {
  id: string;
  moduleId: string;
  name: string;
  description?: string;
  icon?: string;
  category: string;
  isActive: boolean;
  installedAt: Date | null; // null for catalog-only entries
  installedBy: string | null;
  config: Record<string, any> | null;
}

export default function ModuleConfig() {
  const { moduleId } = useParams();
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useQuery<{ modules: TenantModule[] }>({
    queryKey: ['/api/modules/available'],
  });

  const module = data?.modules.find(m => m.moduleId === moduleId);

  if (error) {
    return (
      <div>
        <Alert variant="destructive" data-testid="alert-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Erro ao carregar configuração do módulo.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!module) {
    return (
      <div>
        <Alert data-testid="alert-not-found">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Módulo não encontrado ou não instalado.
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          onClick={() => setLocation('/studio')}
          className="mt-4"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => setLocation('/studio')}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar aos Módulos
        </Button>
        <h1 className="text-2xl font-bold" data-testid="text-title">Configuração: {module.name}</h1>
        <p className="text-muted-foreground mt-2">
          {module.description || `Gerir configurações do módulo ${module.name}`}
        </p>
      </div>

      {/* Projects Module: Custom Configuration Panel */}
      {moduleId === 'projects' ? (
        <ProjectsConfigPanel />
      ) : (
        <Tabs defaultValue="geral" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="geral" data-testid="tab-geral">
            <Settings className="h-4 w-4 mr-2" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="webhooks" data-testid="tab-webhooks">
            <Webhook className="h-4 w-4 mr-2" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="crons" data-testid="tab-crons">
            <Clock className="h-4 w-4 mr-2" />
            Crons
          </TabsTrigger>
          <TabsTrigger value="agentes" data-testid="tab-agentes">
            <Bot className="h-4 w-4 mr-2" />
            Agentes
          </TabsTrigger>
          <TabsTrigger value="automacoes" data-testid="tab-automacoes">
            <Workflow className="h-4 w-4 mr-2" />
            Automações
          </TabsTrigger>
          <TabsTrigger value="estatisticas" data-testid="tab-estatisticas">
            <BarChart3 className="h-4 w-4 mr-2" />
            Estatísticas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="mt-6">
          <Card data-testid="card-geral">
            <CardHeader>
              <CardTitle>Configurações Gerais</CardTitle>
              <CardDescription>
                Configurações básicas do módulo {module.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">ID do Módulo</p>
                    <p className="text-sm">{module.moduleId}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Categoria</p>
                    <p className="text-sm">{module.category}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    <p className="text-sm">{module.isActive ? 'Ativo' : 'Inativo'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Instalado em</p>
                    <p className="text-sm">{module.installedAt ? new Date(module.installedAt).toLocaleDateString('pt-PT') : 'Não instalado'}</p>
                  </div>
                </div>
                <Alert>
                  <AlertDescription>
                    Configurações avançadas estarão disponíveis em breve.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {['webhooks', 'crons', 'agentes', 'automacoes', 'estatisticas'].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-6">
            <Card data-testid={`card-${tab}`}>
              <CardHeader>
                <CardTitle>{tab.charAt(0).toUpperCase() + tab.slice(1)}</CardTitle>
                <CardDescription>
                  Funcionalidade em desenvolvimento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertDescription>
                    Esta funcionalidade será implementada numa fase futura.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
      )}
    </div>
  );
}
