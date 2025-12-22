import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Euro, TrendingUp, TrendingDown, Receipt, AlertTriangle, Wallet, CreditCard, FileText, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

interface DashboardData {
  // AR KPIs
  arKpis: {
    totalReceivables: number;
    overdueInvoices: number;
    receivedThisMonth: number;
    dso: number; // Days Sales Outstanding
  };
  
  // AP KPIs
  apKpis: {
    totalPayables: number;
    overdueBills: number;
    paidThisMonth: number;
    dpo: number; // Days Payable Outstanding
  };
  
  // Treasury KPIs
  treasuryKpis: {
    totalBalance: number;
    activeAccounts: number;
    pendingReconciliations: number;
    cashflowToday: number;
  };
  
  // AR Aging
  arAging: Array<{
    period: string;
    amount: number;
    count: number;
  }>;
  
  // AP Aging
  apAging: Array<{
    period: string;
    amount: number;
    count: number;
  }>;
  
  // Cashflow Forecast
  cashflowForecast: Array<{
    date: string;
    inflow: number;
    outflow: number;
    balance: number;
  }>;
  
  // Recent Activity
  recentActivity: Array<{
    id: string;
    type: 'invoice' | 'payment' | 'bill' | 'reconciliation';
    description: string;
    amount: number;
    date: string;
    status: string;
  }>;
  
  // Alerts
  alerts: Array<{
    id: string;
    type: 'warning' | 'error' | 'info';
    message: string;
    action?: string;
    actionUrl?: string;
  }>;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("pt-PT").format(date);
};

const formatCompactNumber = (value: number) => {
  if (value >= 1000000) {
    return `€${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `€${(value / 1000).toFixed(0)}K`;
  }
  return formatCurrency(value);
};

export default function FinanceiroDashboard() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/financeiro/dashboard"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Financeiro</h1>
          <p className="text-muted-foreground">Visão geral completa da situação financeira</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const arKpiCards = [
    {
      title: "Contas a Receber",
      value: data?.arKpis.totalReceivables || 0,
      icon: FileText,
      testId: "kpi-ar-total",
      trend: "positive",
      description: "Total pendente",
    },
    {
      title: "Faturas Vencidas",
      value: data?.arKpis.overdueInvoices || 0,
      icon: AlertTriangle,
      testId: "kpi-ar-overdue",
      isCount: true,
      trend: "negative",
      description: "Requerem atenção",
    },
    {
      title: "Recebido este Mês",
      value: data?.arKpis.receivedThisMonth || 0,
      icon: TrendingUp,
      testId: "kpi-ar-received",
      trend: "positive",
      description: "Pagamentos recebidos",
    },
    {
      title: "DSO (Dias)",
      value: data?.arKpis.dso || 0,
      icon: Clock,
      testId: "kpi-ar-dso",
      isCount: true,
      description: "Prazo médio recebimento",
    },
  ];

  const apKpiCards = [
    {
      title: "Contas a Pagar",
      value: data?.apKpis.totalPayables || 0,
      icon: CreditCard,
      testId: "kpi-ap-total",
      trend: "neutral",
      description: "Total a pagar",
    },
    {
      title: "Faturas Vencidas",
      value: data?.apKpis.overdueBills || 0,
      icon: AlertTriangle,
      testId: "kpi-ap-overdue",
      isCount: true,
      trend: "negative",
      description: "Pagamento atrasado",
    },
    {
      title: "Pago este Mês",
      value: data?.apKpis.paidThisMonth || 0,
      icon: TrendingDown,
      testId: "kpi-ap-paid",
      description: "Pagamentos efetuados",
    },
    {
      title: "DPO (Dias)",
      value: data?.apKpis.dpo || 0,
      icon: Clock,
      testId: "kpi-ap-dpo",
      isCount: true,
      description: "Prazo médio pagamento",
    },
  ];

  const treasuryKpiCards = [
    {
      title: "Saldo Total",
      value: data?.treasuryKpis.totalBalance || 0,
      icon: Wallet,
      testId: "kpi-treasury-balance",
      trend: "positive",
      description: "Todas as contas",
    },
    {
      title: "Contas Ativas",
      value: data?.treasuryKpis.activeAccounts || 0,
      icon: Receipt,
      testId: "kpi-treasury-accounts",
      isCount: true,
      description: "Contas bancárias",
    },
    {
      title: "Reconciliações Pendentes",
      value: data?.treasuryKpis.pendingReconciliations || 0,
      icon: AlertTriangle,
      testId: "kpi-treasury-pending",
      isCount: true,
      trend: "warning",
      description: "Requerem revisão",
    },
    {
      title: "Fluxo de Caixa Hoje",
      value: data?.treasuryKpis.cashflowToday || 0,
      icon: Euro,
      testId: "kpi-treasury-cashflow",
      description: "Entradas vs Saídas",
    },
  ];

  return (
    <div className="p-6 space-y-6" data-testid="page-dashboard-financeiro">
      {/* Header */}
      <div className="flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Dashboard Financeiro</h1>
          <p className="text-muted-foreground">Visão geral completa da situação financeira (AR + AP + Treasury)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" data-testid="button-refresh">
            Atualizar
          </Button>
          <Button variant="default" size="sm" data-testid="button-export">
            Exportar Relatório
          </Button>
        </div>
      </div>

      {/* Alerts Section */}
      {data?.alerts && data.alerts.length > 0 && (
        <div className="space-y-2" data-testid="section-alerts">
          {data.alerts.map((alert) => (
            <Card key={alert.id} className={`border-l-4 ${
              alert.type === 'error' ? 'border-l-red-500' :
              alert.type === 'warning' ? 'border-l-yellow-500' : 'border-l-blue-500'
            }`} data-testid={`alert-${alert.id}`}>
              <CardContent className="flex flex-row items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className={`h-5 w-5 ${
                    alert.type === 'error' ? 'text-red-500' :
                    alert.type === 'warning' ? 'text-yellow-500' : 'text-blue-500'
                  }`} />
                  <span className="text-sm font-medium">{alert.message}</span>
                </div>
                {alert.action && alert.actionUrl && (
                  <Button variant="ghost" size="sm" data-testid={`button-alert-action-${alert.id}`}>
                    {alert.action}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* AR KPIs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Contas a Receber (AR)</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {arKpiCards.map((kpi) => (
            <Card key={kpi.testId} data-testid={kpi.testId} className="hover-elevate">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
                  <CardDescription className="text-xs">{kpi.description}</CardDescription>
                </div>
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid={`${kpi.testId}-value`}>
                  {kpi.isCount ? kpi.value : formatCompactNumber(kpi.value)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* AP KPIs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Contas a Pagar (AP)</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {apKpiCards.map((kpi) => (
            <Card key={kpi.testId} data-testid={kpi.testId} className="hover-elevate">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
                  <CardDescription className="text-xs">{kpi.description}</CardDescription>
                </div>
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid={`${kpi.testId}-value`}>
                  {kpi.isCount ? kpi.value : formatCompactNumber(kpi.value)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Treasury KPIs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Tesouraria (Treasury)</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {treasuryKpiCards.map((kpi) => (
            <Card key={kpi.testId} data-testid={kpi.testId} className="hover-elevate">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
                  <CardDescription className="text-xs">{kpi.description}</CardDescription>
                </div>
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid={`${kpi.testId}-value`}>
                  {kpi.isCount ? kpi.value : formatCompactNumber(kpi.value)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Separator />

      {/* Charts Section */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* AR Aging */}
        <Card data-testid="card-ar-aging">
          <CardHeader>
            <CardTitle>Aging AR (Contas a Receber)</CardTitle>
            <CardDescription>Distribuição por período de vencimento</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data?.arAging || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="amount" fill="hsl(var(--chart-1))" name="Valor" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* AP Aging */}
        <Card data-testid="card-ap-aging">
          <CardHeader>
            <CardTitle>Aging AP (Contas a Pagar)</CardTitle>
            <CardDescription>Distribuição por período de vencimento</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data?.apAging || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="amount" fill="hsl(var(--chart-2))" name="Valor" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cashflow Forecast */}
        <Card className="lg:col-span-2" data-testid="card-cashflow-forecast">
          <CardHeader>
            <CardTitle>Previsão de Fluxo de Caixa (30 dias)</CardTitle>
            <CardDescription>Entradas vs Saídas previstas</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data?.cashflowForecast || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="inflow"
                  stackId="1"
                  stroke="hsl(var(--chart-1))"
                  fill="hsl(var(--chart-1))"
                  name="Entradas"
                />
                <Area
                  type="monotone"
                  dataKey="outflow"
                  stackId="2"
                  stroke="hsl(var(--chart-2))"
                  fill="hsl(var(--chart-2))"
                  name="Saídas"
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  name="Saldo"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card data-testid="card-recent-activity">
        <CardHeader>
          <CardTitle>Atividade Recente</CardTitle>
          <CardDescription>Últimas 10 transações</CardDescription>
        </CardHeader>
        <CardContent>
          <Table data-testid="table-recent-activity">
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.recentActivity && data.recentActivity.length > 0 ? (
                data.recentActivity.map((activity) => (
                  <TableRow key={activity.id} data-testid={`row-activity-${activity.id}`}>
                    <TableCell>
                      <Badge variant="outline" data-testid={`badge-type-${activity.id}`}>
                        {activity.type === 'invoice' && 'Fatura'}
                        {activity.type === 'payment' && 'Pagamento'}
                        {activity.type === 'bill' && 'Fatura Fornecedor'}
                        {activity.type === 'reconciliation' && 'Reconciliação'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`text-desc-${activity.id}`}>{activity.description}</TableCell>
                    <TableCell data-testid={`text-date-${activity.id}`}>{formatDate(activity.date)}</TableCell>
                    <TableCell className="text-right" data-testid={`text-amount-${activity.id}`}>
                      {formatCurrency(activity.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={activity.status === 'completed' ? 'default' : 'secondary'}
                        data-testid={`badge-status-${activity.id}`}
                      >
                        {activity.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Sem atividade recente
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
