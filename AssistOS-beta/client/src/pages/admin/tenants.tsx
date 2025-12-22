import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export default function AdminTenantsPage() {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <Card data-testid="card-tenants-placeholder">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl" data-testid="text-tenants-title">
                Em breve: Gestão de Tenants
              </CardTitle>
              <CardDescription data-testid="text-tenants-description">
                Esta funcionalidade está em desenvolvimento
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground" data-testid="text-tenants-info">
            A página de gestão de tenants permitirá visualizar, criar e administrar todas as organizações da plataforma. 
            Funcionalidades previstas:
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-4">
            <li>Listagem completa de todos os tenants</li>
            <li>Visualização de detalhes e métricas por tenant</li>
            <li>Gestão de estado (ativo, suspenso, eliminado)</li>
            <li>Configuração de quotas e limites</li>
            <li>Histórico de atividade e auditoria</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
