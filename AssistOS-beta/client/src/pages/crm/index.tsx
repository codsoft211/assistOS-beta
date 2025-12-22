import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, TrendingUp, Target, Bot } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

// ==================== TYPES ====================

interface DashboardStats {
  totalClients: number;
  newClientsThisMonth: number;
  pipelineValue: number;
  openOpportunities: number;
  conversionRate: number;
  wonOpportunities: number;
  totalOpportunities: number;
  aiAlerts: number;
  openValue: number;
  inProgressOpportunities: number;
  inProgressValue: number;
  wonValue: number;
  lostOpportunities: number;
  lostValue: number;
}

interface TopClient {
  id: string;
  name: string;
  company: string;
  totalOrders: number;
  lifetimeValue: number;
}

interface AIAlert {
  id: string;
  title: string;
  description: string;
  type: string;
  clientName: string;
  estimatedValue: number;
  probability: number;
  createdAt: string;
}

// ==================== HELPERS ====================

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR'
  }).format(value);
};

const getTypeBadgeVariant = (type: string): "default" | "secondary" | "outline" | "destructive" => {
  const typeNormalized = type.toLowerCase().replace(/_/g, '-');
  switch (typeNormalized) {
    case 'reactivation':
    case 'reativação':
      return 'default';
    case 'cross-sell':
    case 'cross_sell':
      return 'secondary';
    case 'upsell':
      return 'outline';
    case 'churn':
    case 'churn-prevention':
    case 'churn_prevention':
      return 'destructive';
    default:
      return 'secondary';
  }
};

const getTypeLabel = (type: string): string => {
  const typeNormalized = type.toLowerCase().replace(/_/g, '-');
  switch (typeNormalized) {
    case 'reactivation':
    case 'reativação':
      return 'Reativação';
    case 'cross-sell':
    case 'cross_sell':
      return 'Cross-sell';
    case 'upsell':
      return 'Upsell';
    case 'churn':
    case 'churn-prevention':
    case 'churn_prevention':
      return 'Churn';
    default:
      return type;
  }
};

// ==================== MAIN COMPONENT ====================

export default function CrmDashboard() {
  const { data: stats, isLoading: isLoadingStats } = useQuery<DashboardStats>({
    queryKey: ['/api/crm/dashboard/stats'],
  });

  const { data: topClients, isLoading: isLoadingClients } = useQuery<TopClient[]>({
    queryKey: ['/api/crm/dashboard/top-clients'],
  });

  const { data: aiAlerts, isLoading: isLoadingAlerts } = useQuery<AIAlert[]>({
    queryKey: ['/api/crm/dashboard/ai-alerts'],
  });

  const isLoading = isLoadingStats || isLoadingClients || isLoadingAlerts;

  // Pipeline data for chart
  const pipelineData = stats ? [
    { 
      stage: 'Abertas', 
      count: stats.openOpportunities, 
      value: stats.openValue 
    },
    { 
      stage: 'Em Progresso', 
      count: stats.inProgressOpportunities, 
      value: stats.inProgressValue 
    },
    { 
      stage: 'Ganhas', 
      count: stats.wonOpportunities, 
      value: stats.wonValue 
    },
    { 
      stage: 'Perdidas', 
      count: stats.lostOpportunities, 
      value: stats.lostValue 
    },
  ] : [];

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          Dashboard CRM
        </h1>
        <p className="text-muted-foreground">Visão geral comercial e pipeline de vendas</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1 - Total Clientes Ativos */}
        <Card data-testid="card-kpi-total-clientes">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-32" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-kpi-total-clientes">
                  {stats?.totalClients || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  +{stats?.newClientsThisMonth || 0} este mês
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 2 - Pipeline Total */}
        <Card data-testid="card-kpi-pipeline">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <>
                <Skeleton className="h-8 w-28 mb-2" />
                <Skeleton className="h-4 w-36" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-kpi-pipeline">
                  {formatCurrency(stats?.pipelineValue || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats?.openOpportunities || 0} oportunidades abertas
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 3 - Taxa Conversão */}
        <Card data-testid="card-kpi-taxa-conversao">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa Conversão</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-40" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-kpi-taxa-conversao">
                  {stats?.conversionRate.toFixed(1) || '0.0'}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats?.wonOpportunities || 0} ganhas de {stats?.totalOpportunities || 0} totais
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 4 - Alertas AI Recentes */}
        <Card data-testid="card-kpi-alertas-ai">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas AI</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <>
                <Skeleton className="h-8 w-12 mb-2" />
                <Skeleton className="h-4 w-24" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-kpi-alertas-ai">
                  {stats?.aiAlerts || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Últimos 7 dias
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts & Top Clients Grid */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Pipeline Chart */}
        <Card data-testid="card-grafico-pipeline">
          <CardHeader>
            <CardTitle>Funil de Vendas</CardTitle>
            <CardDescription>Distribuição de oportunidades por estágio</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={pipelineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => {
                      if (name === 'Valor €') {
                        return formatCurrency(Number(value));
                      }
                      return value;
                    }}
                  />
                  <Legend />
                  <Bar dataKey="count" fill="hsl(var(--primary))" name="Quantidade" />
                  <Bar dataKey="value" fill="hsl(var(--accent))" name="Valor €" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top 5 Clientes */}
        <Card data-testid="card-top-clientes">
          <CardHeader>
            <CardTitle>Top 5 Clientes</CardTitle>
            <CardDescription>Por valor total de encomendas</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingClients ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="text-right">Total Encomendas</TableHead>
                    <TableHead className="text-right">Lifetime Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!topClients || topClients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Sem dados disponíveis
                      </TableCell>
                    </TableRow>
                  ) : (
                    topClients.map((client, index) => (
                      <TableRow key={client.id} data-testid={`row-top-cliente-${index}`}>
                        <TableCell>
                          <Link 
                            to={`/comercial/clientes/${client.id}`} 
                            className="hover:underline"
                            data-testid={`link-cliente-${client.id}`}
                          >
                            {client.name}
                          </Link>
                        </TableCell>
                        <TableCell>{client.company || '-'}</TableCell>
                        <TableCell className="text-right">{client.totalOrders}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(client.lifetimeValue)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Alerts */}
      <Card data-testid="card-alertas-recentes">
        <CardHeader>
          <CardTitle>Alertas AI Recentes</CardTitle>
          <CardDescription>Oportunidades identificadas automaticamente</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingAlerts ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : !aiAlerts || aiAlerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum alerta AI recente</p>
            </div>
          ) : (
            <div className="space-y-4">
              {aiAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-lg border hover-elevate"
                  data-testid={`alert-ai-${alert.id}`}
                >
                  <Bot className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="font-medium">{alert.title}</h4>
                      <Badge 
                        variant={getTypeBadgeVariant(alert.type)} 
                        data-testid={`badge-tipo-${alert.type}`}
                      >
                        {getTypeLabel(alert.type)}
                      </Badge>
                    </div>
                    {alert.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {alert.description}
                      </p>
                    )}
                    <div className="flex items-center flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Cliente: {alert.clientName}</span>
                      <span>Valor: {formatCurrency(alert.estimatedValue)}</span>
                      <span>Probabilidade: {alert.probability}%</span>
                      <span>
                        {formatDistanceToNow(new Date(alert.createdAt), { 
                          addSuffix: true, 
                          locale: pt 
                        })}
                      </span>
                    </div>
                  </div>
                  <Link to={`/comercial/oportunidades/${alert.id}`}>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      data-testid={`button-ver-alerta-${alert.id}`}
                    >
                      Ver
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
