import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Building2, Package, Activity } from "lucide-react";

type AdminStats = {
  totalUsers: number;
  totalTenants: number;
  activeUsers: number;
  newTenantsThisMonth: number;
  message?: string;
};

export default function AdminDashboardPage() {
  const { data, isLoading, error } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  if (error) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Erro ao carregar estatísticas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Erro desconhecido"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight" data-testid="text-dashboard-title">
          Dashboard da Plataforma
        </h2>
        <p className="text-muted-foreground" data-testid="text-dashboard-description">
          Visão geral das métricas e estatísticas da plataforma AssistOS
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-total-users">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" data-testid="skeleton-total-users" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-users">
                {data?.totalUsers || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Utilizadores registados
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-tenants">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" data-testid="skeleton-total-tenants" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-tenants">
                {data?.totalTenants || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Organizações ativas
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-new-tenants">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Novos Tenants</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" data-testid="skeleton-new-tenants" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-new-tenants">
                {data?.newTenantsThisMonth || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Este mês
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-active-users">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilizadores Ativos</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" data-testid="skeleton-active-users" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-active-users">
                {data?.activeUsers || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Últimos 30 dias
            </p>
          </CardContent>
        </Card>
      </div>

      {data?.message && (
        <Card className="border-yellow-500/50">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground" data-testid="text-info-message">
              ℹ️ {data.message}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
