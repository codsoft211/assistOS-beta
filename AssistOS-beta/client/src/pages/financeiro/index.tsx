import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { 
  Euro, 
  TrendingUp, 
  Receipt, 
  AlertTriangle, 
  Wallet, 
  FileText,
  Plus,
  CreditCard,
  ArrowRight
} from "lucide-react";

interface DashboardData {
  kpis: {
    faturacaoMensal: number;
    recebimentosMes: number;
    saldoReceber: number;
    faturasVencidas: number;
  };
  evolucaoMensal: Array<{
    mes: string;
    faturacao: number;
    recebimentos: number;
  }>;
  recebimentosPorMetodo: Array<{
    metodo: string;
    valor: number;
  }>;
  ultimasFaturas: Array<{
    id: string;
    numero: string;
    cliente: string;
    dataEmissao: string;
    valor: number;
    estado: string;
  }>;
  topClientes: Array<{
    id: string;
    nome: string;
    valorTotal: number;
    numeroFaturas: number;
  }>;
}

interface BankAccount {
  id: string;
  nomeConta: string;
  nomeBanco: string;
  saldoAtual: number;
  moeda: string;
  ativa: boolean;
}

interface Invoice {
  id: string;
  numero: string;
  cliente: string;
  dataEmissao: string;
  dataVencimento: string;
  valorTotal: number;
  estado: string;
}

const getStatusBadgeColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid':
    case 'paga':
      return "bg-green-500/10 text-green-500 hover:bg-green-500/20";
    case 'overdue':
    case 'vencida':
      return "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20";
    case 'sent':
    case 'enviada':
      return "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20";
    case 'draft':
    case 'rascunho':
      return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20";
    default:
      return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20";
  }
};

export default function FinanceiroDashboard() {
  const { t, i18n } = useTranslation('financeiro');
  const currentLang = i18n.language || 'pt';

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'pt-PT', {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(currentLang === 'en' ? 'en-US' : 'pt-PT').format(date);
  };

  const getStatusLabel = (status: string) => {
    const statusKey = status.toLowerCase();
    const statusMap: Record<string, string> = {
      'paid': t('dashboard.status.paid'),
      'overdue': t('dashboard.status.overdue'),
      'sent': t('dashboard.status.sent'),
      'draft': t('dashboard.status.draft'),
      'partial': t('dashboard.status.partial'),
    };
    return statusMap[statusKey] || status;
  };
  const { data: dashboardData, isLoading: loadingDashboard } = useQuery<DashboardData>({
    queryKey: ["/api/financeiro/dashboard"],
  });

  const { data: bankAccounts, isLoading: loadingBankAccounts } = useQuery<BankAccount[]>({
    queryKey: ["/api/financeiro/contas-bancarias"],
  });

  const { data: overdueInvoices, isLoading: loadingOverdue } = useQuery<Invoice[]>({
    queryKey: ["/api/financeiro/faturas", { status: 'overdue', limit: 5 }],
  });

  const { data: draftInvoices, isLoading: loadingDrafts } = useQuery<Invoice[]>({
    queryKey: ["/api/financeiro/faturas", { status: 'draft', limit: 5 }],
  });

  // Calculate total bank balance
  const totalBankBalance = bankAccounts?.reduce((sum, acc) => sum + (acc.saldoAtual || 0), 0) || 0;

  // Calculate pending invoices count
  const pendingInvoicesCount = draftInvoices?.length || 0;

  const kpiCards = [
    {
      title: t('dashboard.kpis.accountsReceivable.title'),
      description: t('dashboard.kpis.accountsReceivable.description'),
      value: dashboardData?.kpis.saldoReceber || 0,
      icon: Receipt,
      testId: "kpi-a-receber",
      isLoading: loadingDashboard,
    },
    {
      title: t('dashboard.kpis.overdueInvoices.title'),
      description: t('dashboard.kpis.overdueInvoices.description'),
      value: dashboardData?.kpis.faturasVencidas || 0,
      icon: AlertTriangle,
      testId: "kpi-faturas-vencidas",
      isCount: true,
      isLoading: loadingDashboard,
      variant: "warning" as const,
    },
    {
      title: t('dashboard.kpis.receivedThisMonth.title'),
      description: t('dashboard.kpis.receivedThisMonth.description'),
      value: dashboardData?.kpis.recebimentosMes || 0,
      icon: TrendingUp,
      testId: "kpi-recebido-mes",
      isLoading: loadingDashboard,
    },
    {
      title: t('dashboard.kpis.monthlyRevenue.title'),
      description: t('dashboard.kpis.monthlyRevenue.description'),
      value: dashboardData?.kpis.faturacaoMensal || 0,
      icon: Euro,
      testId: "kpi-faturacao-mensal",
      isLoading: loadingDashboard,
    },
    {
      title: t('dashboard.kpis.bankBalance.title'),
      description: t('dashboard.kpis.bankBalance.description'),
      value: totalBankBalance,
      icon: Wallet,
      testId: "kpi-saldo-contas",
      isLoading: loadingBankAccounts,
    },
    {
      title: t('dashboard.kpis.pendingInvoices.title'),
      description: t('dashboard.kpis.pendingInvoices.description'),
      value: pendingInvoicesCount,
      icon: FileText,
      testId: "kpi-faturas-pendentes",
      isCount: true,
      isLoading: loadingDrafts,
    },
  ];

  const quickActions = [
    {
      label: t('dashboard.quickActions.newInvoice'),
      href: "/financeiro/faturacao",
      icon: Plus,
      variant: "default" as const,
      testId: "button-nova-fatura",
    },
    {
      label: t('dashboard.quickActions.receipts'),
      href: "/financeiro/recebimentos",
      icon: CreditCard,
      variant: "outline" as const,
      testId: "button-recebimentos",
    },
  ];

  return (
    <div className="p-6 space-y-6" data-testid="page-financeiro-dashboard">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            {t('dashboard.description')}
          </p>
        </div>
        <div className="flex gap-2">
          {quickActions.map((action) => (
            <Button
              key={action.testId}
              variant={action.variant}
              asChild
              data-testid={action.testId}
            >
              <Link href={action.href}>
                <action.icon className="h-4 w-4 mr-2" />
                {action.label}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {/* Overdue Invoices Alert */}
      {!loadingOverdue && overdueInvoices && overdueInvoices.length > 0 && (
        <Alert variant="destructive" data-testid="alert-faturas-vencidas">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle data-testid="text-alert-title">{t('dashboard.alert.overdueInvoices')}</AlertTitle>
          <AlertDescription data-testid="text-alert-description">
            {t('dashboard.alert.overdueMessage', { count: overdueInvoices.length })}
            <Button
              variant="ghost"
              asChild
              className="h-auto p-0 ml-2 text-destructive hover:text-destructive hover:bg-transparent"
              data-testid="link-ver-faturas-vencidas"
            >
              <Link href="/financeiro/faturacao?status=overdue">
                {t('dashboard.alert.viewInvoices')} <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {kpiCards.map((kpi) => (
          <Card key={kpi.testId} data-testid={kpi.testId}>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
                <CardDescription className="text-xs">{kpi.description}</CardDescription>
              </div>
              <kpi.icon 
                className={`h-4 w-4 ${
                  kpi.variant === 'warning' && kpi.value > 0 
                    ? 'text-orange-500' 
                    : 'text-muted-foreground'
                }`} 
              />
            </CardHeader>
            <CardContent>
              {kpi.isLoading ? (
                <Skeleton className="h-8 w-24" data-testid={`${kpi.testId}-skeleton`} />
              ) : (
                <div className="text-2xl font-bold" data-testid={`${kpi.testId}-value`}>
                  {kpi.isCount ? kpi.value : formatCurrency(kpi.value)}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-evolucao-mensal">
          <CardHeader>
            <CardTitle>{t('dashboard.charts.cashflow.title')}</CardTitle>
            <CardDescription>{t('dashboard.charts.cashflow.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingDashboard ? (
              <div className="space-y-2">
                <Skeleton className="h-[300px] w-full" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dashboardData?.evolucaoMensal || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="mes" 
                    className="text-xs"
                  />
                  <YAxis 
                    className="text-xs"
                    tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="faturacao"
                    stroke="hsl(var(--primary))"
                    name={t('dashboard.charts.cashflow.invoicing')}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="recebimentos"
                    stroke="hsl(var(--chart-2))"
                    name={t('dashboard.charts.cashflow.receipts')}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-recebimentos-metodo">
          <CardHeader>
            <CardTitle>{t('dashboard.charts.paymentMethods.title')}</CardTitle>
            <CardDescription>{t('dashboard.charts.paymentMethods.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingDashboard ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dashboardData?.recebimentosPorMetodo || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="metodo" 
                    className="text-xs"
                  />
                  <YAxis 
                    className="text-xs"
                    tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Bar 
                    dataKey="valor" 
                    fill="hsl(var(--primary))" 
                    name={t('dashboard.charts.paymentMethods.value')}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tables Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-ultimas-faturas">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
            <div>
              <CardTitle>{t('dashboard.recentInvoices.title')}</CardTitle>
              <CardDescription>{t('dashboard.recentInvoices.description')}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild data-testid="link-ver-todas-faturas">
              <Link href="/financeiro/faturacao">
                {t('dashboard.recentInvoices.viewAll')} <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loadingDashboard ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <Table data-testid="table-ultimas-faturas">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('dashboard.recentInvoices.table.number')}</TableHead>
                      <TableHead>{t('dashboard.recentInvoices.table.client')}</TableHead>
                      <TableHead className="text-right">{t('dashboard.recentInvoices.table.value')}</TableHead>
                      <TableHead>{t('dashboard.recentInvoices.table.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboardData?.ultimasFaturas && dashboardData.ultimasFaturas.length > 0 ? (
                      dashboardData.ultimasFaturas.slice(0, 10).map((fatura) => (
                        <TableRow key={fatura.id} data-testid={`row-fatura-${fatura.id}`}>
                          <TableCell className="font-medium" data-testid={`text-numero-${fatura.id}`}>
                            {fatura.numero}
                          </TableCell>
                          <TableCell data-testid={`text-cliente-${fatura.id}`}>
                            <div className="max-w-[150px] truncate">{fatura.cliente}</div>
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-valor-${fatura.id}`}>
                            {formatCurrency(fatura.valor)}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              className={getStatusBadgeColor(fatura.estado)}
                              data-testid={`badge-estado-${fatura.id}`}
                            >
                              {getStatusLabel(fatura.estado)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          {t('dashboard.recentInvoices.empty')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-top-clientes">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
            <div>
              <CardTitle>{t('dashboard.topClients.title')}</CardTitle>
              <CardDescription>{t('dashboard.topClients.description')}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild data-testid="link-ver-clientes">
              <Link href="/crm/clients">
                {t('dashboard.topClients.viewAll')} <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loadingDashboard ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <Table data-testid="table-top-clientes">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('dashboard.topClients.table.client')}</TableHead>
                      <TableHead className="text-center">{t('dashboard.topClients.table.invoices')}</TableHead>
                      <TableHead className="text-right">{t('dashboard.topClients.table.total')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboardData?.topClientes && dashboardData.topClientes.length > 0 ? (
                      dashboardData.topClientes.slice(0, 10).map((cliente) => (
                        <TableRow key={cliente.id} data-testid={`row-cliente-${cliente.id}`}>
                          <TableCell className="font-medium" data-testid={`text-nome-${cliente.id}`}>
                            <div className="max-w-[150px] truncate">{cliente.nome}</div>
                          </TableCell>
                          <TableCell className="text-center" data-testid={`text-num-faturas-${cliente.id}`}>
                            {cliente.numeroFaturas}
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-total-${cliente.id}`}>
                            {formatCurrency(cliente.valorTotal)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          {t('dashboard.topClients.empty')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation Links */}
      <Card data-testid="card-navegacao-rapida">
        <CardHeader>
          <CardTitle>{t('dashboard.quickNavigation.title')}</CardTitle>
          <CardDescription>{t('dashboard.quickNavigation.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" asChild className="justify-start" data-testid="link-faturacao">
              <Link href="/financeiro/faturacao">
                <Receipt className="h-4 w-4 mr-2" />
                {t('dashboard.quickNavigation.invoicing')}
              </Link>
            </Button>
            <Button variant="outline" asChild className="justify-start" data-testid="link-recebimentos">
              <Link href="/financeiro/recebimentos">
                <CreditCard className="h-4 w-4 mr-2" />
                {t('dashboard.quickNavigation.receipts')}
              </Link>
            </Button>
            <Button variant="outline" asChild className="justify-start" data-testid="link-contas-bancarias">
              <Link href="/financeiro/contas-bancarias">
                <Wallet className="h-4 w-4 mr-2" />
                {t('dashboard.quickNavigation.bankAccounts')}
              </Link>
            </Button>
            <Button variant="outline" asChild className="justify-start" data-testid="link-reconciliacao">
              <Link href="/financeiro/reconciliacao">
                <TrendingUp className="h-4 w-4 mr-2" />
                {t('dashboard.quickNavigation.reconciliation')}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
