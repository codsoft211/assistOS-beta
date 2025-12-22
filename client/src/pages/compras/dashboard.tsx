import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Package, AlertCircle, CheckCircle } from "lucide-react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

interface DashboardData {
  spending: {
    current: number;
    previous: number;
    trend: number;
  };
  purchaseOrders: Record<string, number>;
  onTimeDeliveryRate: number;
  pendingApprovals: number;
  recentActivity: Array<{
    id: string;
    code: string;
    supplier: string;
    status: string;
    totalAmount: number;
    orderDate: string;
    type: string;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "gray",
  pending_approval: "yellow",
  approved: "blue",
  sent: "green",
  received: "purple",
  cancelled: "red",
};

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function ComprasDashboard() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/compras/analytics/dashboard"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Compras Dashboard</h1>
          <p className="text-muted-foreground">Visão geral de procurement</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" data-testid="skeleton-kpi" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Sem dados disponíveis</p>
      </div>
    );
  }

  const spendingTrendPositive = data.spending.trend >= 0;
  const poStatusData = Object.entries(data.purchaseOrders).map(([status, count]) => ({
    name: status,
    value: count,
  }));

  const totalPOs = Object.values(data.purchaseOrders).reduce((sum, count) => sum + count, 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          Compras Dashboard
        </h1>
        <p className="text-muted-foreground">Visão geral de procurement e analytics</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Monthly Spending */}
        <Card data-testid="card-spending">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gasto Mensal</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-spending-current">
              €{data.spending.current.toLocaleString()}
            </div>
            <div className="flex items-center text-xs text-muted-foreground">
              {spendingTrendPositive ? (
                <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
              )}
              <span className={spendingTrendPositive ? "text-green-500" : "text-red-500"}>
                {Math.abs(data.spending.trend).toFixed(1)}%
              </span>
              <span className="ml-1">vs mês anterior</span>
            </div>
          </CardContent>
        </Card>

        {/* Total POs */}
        <Card data-testid="card-pos">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Purchase Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-pos">
              {totalPOs}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.purchaseOrders.approved || 0} aprovadas
            </p>
          </CardContent>
        </Card>

        {/* On-time Delivery */}
        <Card data-testid="card-delivery">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entrega On-Time</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-delivery-rate">
              {data.onTimeDeliveryRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Taxa média de fornecedores</p>
          </CardContent>
        </Card>

        {/* Pending Approvals */}
        <Card data-testid="card-approvals">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <AlertCircle className={`h-4 w-4 ${data.pendingApprovals > 10 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-count">
              {data.pendingApprovals}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.pendingApprovals > 10 ? "Atenção necessária!" : "Aguardando aprovação"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* PO Status Distribution */}
        <Card data-testid="card-chart-status">
          <CardHeader>
            <CardTitle>POs por Status</CardTitle>
            <CardDescription>Distribuição atual de purchase orders</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={poStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {poStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Activity Placeholder Chart */}
        <Card data-testid="card-chart-trend">
          <CardHeader>
            <CardTitle>Tendências de Compras</CardTitle>
            <CardDescription>Últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Dados históricos disponíveis em breve
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Table */}
      <Card data-testid="card-recent-activity">
        <CardHeader>
          <CardTitle>Atividade Recente</CardTitle>
          <CardDescription>Últimas purchase orders criadas</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentActivity.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhuma atividade recente
                  </TableCell>
                </TableRow>
              ) : (
                data.recentActivity.map((activity) => (
                  <TableRow key={activity.id} data-testid={`row-activity-${activity.id}`}>
                    <TableCell className="font-medium">{activity.code}</TableCell>
                    <TableCell>{activity.supplier}</TableCell>
                    <TableCell>
                      <Badge variant="outline" data-testid={`badge-status-${activity.status}`}>
                        {activity.status}
                      </Badge>
                    </TableCell>
                    <TableCell>€{activity.totalAmount?.toLocaleString() || 0}</TableCell>
                    <TableCell>
                      {format(new Date(activity.orderDate), "dd/MM/yyyy")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
