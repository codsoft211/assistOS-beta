import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  CheckCircle, AlertCircle, Loader2, Upload, 
  Database, Workflow
} from "lucide-react";

interface CustomEntity {
  id: string;
  entityKey: string;
  displayName: string;
  displayNamePlural: string;
  description?: string;
  icon?: string;
  color?: string;
  category: string;
  environment: 'sandbox' | 'production';
  metadata?: any;
}

interface PreviewPanelProps {
  entities: CustomEntity[];
  onPublish: () => void;
  error?: Error | null;
}

export default function PreviewPanel({ entities, onPublish, error }: PreviewPanelProps) {
  const { toast } = useToast();

  if (error) {
    return (
      <Alert variant="destructive" data-testid="alert-preview-error">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Erro ao carregar entidades. {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  const publishMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/modules/projects/templates/publish', {
        environment: 'production'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'sandbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'production'] });
      onPublish();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao publicar",
        description: error.message || "Falha ao promover configuração para produção.",
        variant: "destructive",
      });
    },
  });

  const sandboxEntities = entities.filter(e => e.environment === 'sandbox');
  const productionEntities = entities.filter(e => e.environment === 'production');

  if (sandboxEntities.length === 0) {
    return (
      <Alert data-testid="alert-no-config">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Nenhuma configuração sandbox encontrada. Aplique um template primeiro.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6" data-testid="preview-panel">
      {/* Sandbox Configuration */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-yellow-600" />
          <h3 className="text-lg font-semibold">Configuração Sandbox</h3>
          <Badge variant="outline" className="ml-auto" data-testid="badge-sandbox-count">
            {sandboxEntities.length} Entities
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sandboxEntities.map((entity) => {
            const fields = entity.metadata?.fields || [];
            const workflows = entity.metadata?.workflows || [];
            
            return (
              <div 
                key={entity.id} 
                className="p-4 border rounded-lg space-y-2"
                data-testid={`card-entity-${entity.entityKey}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium" data-testid={`text-name-${entity.entityKey}`}>
                      {entity.displayName}
                    </h4>
                    <p className="text-sm text-muted-foreground">{entity.entityKey}</p>
                  </div>
                  <Badge variant="secondary" data-testid={`badge-env-${entity.entityKey}`}>
                    {entity.environment}
                  </Badge>
                </div>

                <Separator />

                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Database className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {fields.length} campos
                    </span>
                  </div>
                  {workflows.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Workflow className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {workflows.length} workflows
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Production Configuration */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <h3 className="text-lg font-semibold">Configuração Produção</h3>
          <Badge variant="outline" className="ml-auto" data-testid="badge-prod-count">
            {productionEntities.length} Entities
          </Badge>
        </div>

        {productionEntities.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Nenhuma configuração em produção. Publique a configuração sandbox para ativar.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {productionEntities.map((entity) => {
              const fields = entity.metadata?.fields || [];
              
              return (
                <div 
                  key={entity.id} 
                  className="p-4 border rounded-lg border-green-200 dark:border-green-900 space-y-2"
                  data-testid={`card-prod-entity-${entity.entityKey}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium">{entity.displayName}</h4>
                      <p className="text-sm text-muted-foreground">{entity.entityKey}</p>
                    </div>
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                      Ativo
                    </Badge>
                  </div>

                  <Separator />

                  <div className="flex items-center gap-2 text-sm">
                    <Database className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {fields.length} campos
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Separator />

      {/* Publish Action */}
      <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
        <div>
          <h4 className="font-medium">Publicar para Produção</h4>
          <p className="text-sm text-muted-foreground">
            Promove {sandboxEntities.length} entidades sandbox → production
          </p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              disabled={sandboxEntities.length === 0 || publishMutation.isPending}
              data-testid="button-publish"
            >
              {publishMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Publicando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Publish to Production
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent data-testid="dialog-confirm-publish">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Publicação</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja promover a configuração sandbox para produção?
                Esta ação irá:
              </AlertDialogDescription>
            </AlertDialogHeader>

            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>Criar {sandboxEntities.length} entidades em produção</li>
              <li>Tornar as entities disponíveis para uso no módulo Projects</li>
              <li>Aplicar todos workflows e custom fields configurados</li>
            </ul>

            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-publish">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => publishMutation.mutate()}
                data-testid="button-confirm-publish"
              >
                Confirmar Publicação
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
