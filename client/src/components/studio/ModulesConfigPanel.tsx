import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Package, Settings, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

interface TenantModule {
  id: string;
  moduleId: string;
  name: string;
  description?: string;
  icon?: string;
  category: string;
  isActive: boolean;
  installedAt: Date | null; // null for catalog-only entries (not yet installed)
  installedBy: string | null;
  config: Record<string, any> | null;
}

export default function ModulesConfigPanel() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useQuery<{ modules: TenantModule[] }>({
    queryKey: ['/api/modules/available'],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ moduleId, isActive }: { moduleId: string; isActive: boolean }) => {
      return await apiRequest('PATCH', `/api/modules/${moduleId}/status`, { isActive });
    },
    onSuccess: (_, variables) => {
      // Invalidate all module-related queries
      queryClient.invalidateQueries({ queryKey: ['/api/modules/available'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules/tenant'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules/sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules'] });
      // Module activation/deactivation also affects custom tables
      queryClient.invalidateQueries({ queryKey: ['/api/custom-tables'] });
      toast({
        title: variables.isActive ? "Módulo ativado" : "Módulo desativado",
        description: `O módulo foi ${variables.isActive ? 'ativado' : 'desativado'} com sucesso.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao atualizar módulo.",
        variant: "destructive",
      });
    },
  });

  if (error) {
    return (
      <Alert variant="destructive" data-testid="alert-error-modules">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Erro ao carregar módulos. {(error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} data-testid={`skeleton-module-${i}`}>
            <CardHeader>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full mt-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (data?.modules.length === 0) {
    return (
      <Card data-testid="card-no-modules">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum módulo instalado</h3>
          <p className="text-muted-foreground text-center">
            Os módulos serão instalados automaticamente conforme necessário.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {data?.modules.map((module) => (
        <Card key={module.moduleId} data-testid={`card-module-${module.moduleId}`}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  {module.name}
                </CardTitle>
                <CardDescription className="mt-1">
                  {module.description || `Módulo ${module.category}`}
                </CardDescription>
              </div>
              <Badge variant={module.isActive ? "default" : "secondary"} data-testid={`badge-status-${module.moduleId}`}>
                {module.isActive ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Switch
                checked={module.isActive}
                onCheckedChange={(checked) =>
                  updateStatusMutation.mutate({ moduleId: module.moduleId, isActive: checked })
                }
                disabled={updateStatusMutation.isPending}
                data-testid={`switch-status-${module.moduleId}`}
              />
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation(`/studio/modules/${module.moduleId}/config`)}
              data-testid={`button-config-${module.moduleId}`}
            >
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
