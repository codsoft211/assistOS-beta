import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Warehouse, AlertTriangle, Truck, Wrench, Euro, Package, ArrowUpDown } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

// ==================== TYPES ====================

interface DashboardStats {
  totalWarehouses: number;
  lowStockItems: number;
  pendingTransfers: number;
  equipmentInUse: number;
  totalInventoryValue: number;
  totalProducts: number;
}

interface StockByWarehouse {
  warehouseName: string;
  totalItems: number;
  totalValue: number;
}

interface RecentMovement {
  date: string;
  inCount: number;
  outCount: number;
  adjustmentCount: number;
}

interface LowStockAlert {
  productId: string;
  name: string;
  currentStock: number;
  reorderPoint: number;
  warehouseName: string;
}

interface PendingTransfer {
  id: string;
  productName: string;
  fromWarehouse: string;
  toWarehouse: string;
  quantity: number;
  createdAt: string;
}

interface RecentMovementItem {
  id: string;
  type: string;
  productName: string;
  quantity: number;
  warehouseName: string;
  createdAt: string;
}

interface DashboardData {
  stats: DashboardStats;
  charts: {
    stockByWarehouse: StockByWarehouse[];
    recentMovements: RecentMovement[];
  };
  tables: {
    lowStockAlerts: LowStockAlert[];
    pendingTransfers: PendingTransfer[];
    recentMovements: RecentMovementItem[];
  };
}

// ==================== HELPERS ====================

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR'
  }).format(value);
};

const getTypeLabel = (type: string): string => {
  switch (type) {
    case 'in':
      return 'Entrada';
    case 'out':
      return 'Saída';
    case 'adjustment':
      return 'Ajuste';
    case 'transfer':
      return 'Transferência';
    default:
      return type;
  }
};

const getTypeBadgeVariant = (type: string): "default" | "secondary" | "outline" | "destructive" => {
  switch (type) {
    case 'in':
      return 'default';
    case 'out':
      return 'destructive';
    case 'adjustment':
      return 'secondary';
    case 'transfer':
      return 'outline';
    default:
      return 'secondary';
  }
};

// ==================== MAIN COMPONENT ====================

export default function LogisticaDashboard() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['/api/logistica/dashboard'],
  });

  const stats = data?.stats;
  const charts = data?.charts;
  const tables = data?.tables;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          Dashboard Logística
        </h1>
        <p className="text-muted-foreground">Visão geral de armazéns, inventário e equipamentos</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {/* Card 1 - Total Armazéns */}
        <Card data-testid="card-kpi-total-armazens">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Armazéns</CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-32" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-kpi-total-armazens">
                  {stats?.totalWarehouses || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Armazéns ativos
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 2 - Stock Baixo */}
        <Card data-testid="card-kpi-stock-baixo">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Baixo</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-36" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-kpi-stock-baixo">
                  {stats?.lowStockItems || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Produtos abaixo reorder point
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 3 - Transferências Pendentes */}
        <Card data-testid="card-kpi-transferencias-pendentes">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transferências Pendentes</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-28" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-kpi-transferencias-pendentes">
                  {stats?.pendingTransfers || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Aguardando processamento
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 4 - Equipamentos em Uso */}
        <Card data-testid="card-kpi-equipamentos-uso">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Equipamentos em Uso</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-32" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-kpi-equipamentos-uso">
                  {stats?.equipmentInUse || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Atualmente alocados
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 5 - Valor Total Inventário */}
        <Card data-testid="card-kpi-valor-total">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total Inventário</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-4 w-36" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-kpi-valor-total">
                  {formatCurrency(stats?.totalInventoryValue || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Valor em stock
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 6 - Total Produtos */}
        <Card data-testid="card-kpi-total-produtos">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Produtos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-28" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-kpi-total-produtos">
                  {stats?.totalProducts || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Produtos ativos
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Bar Chart - Stock por Armazém */}
        <Card data-testid="card-chart-stock-armazem">
          <CardHeader>
            <CardTitle>Stock por Armazém</CardTitle>
            <CardDescription>Quantidade total de itens por armazém</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={charts?.stockByWarehouse || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="warehouseName" />
                  <YAxis />
                  <RechartsTooltip />
                  <Legend />
                  <Bar dataKey="totalItems" fill="hsl(var(--primary))" name="Total Itens" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Line Chart - Movimentos Recentes */}
        <Card data-testid="card-chart-movimentos-recentes">
          <CardHeader>
            <CardTitle>Movimentos Recentes (7 dias)</CardTitle>
            <CardDescription>Entradas, saídas e ajustes de stock</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={charts?.recentMovements || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <RechartsTooltip />
                  <Legend />
                  <Line type="monotone" dataKey="inCount" stroke="#22c55e" name="Entradas" strokeWidth={2} />
                  <Line type="monotone" dataKey="outCount" stroke="#ef4444" name="Saídas" strokeWidth={2} />
                  <Line type="monotone" dataKey="adjustmentCount" stroke="#f59e0b" name="Ajustes" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card data-testid="card-quick-actions">
        <CardHeader>
          <CardTitle>Ações Rápidas</CardTitle>
          <CardDescription>Funcionalidades disponíveis brevemente</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" disabled data-testid="button-nova-transferencia">
                  <Truck className="h-4 w-4 mr-2" />
                  Nova Transferência
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Disponível brevemente</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" disabled data-testid="button-ajuste-stock">
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  Ajuste Stock
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Disponível brevemente</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" disabled data-testid="button-checkout-equipamento">
                  <Wrench className="h-4 w-4 mr-2" />
                  Checkout Equipamento
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Disponível brevemente</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Tables Section */}
      <div className="grid gap-4 grid-cols-1">
        {/* Table - Alertas Stock Baixo */}
        <Card data-testid="card-table-alertas-stock">
          <CardHeader>
            <CardTitle>Alertas Stock Baixo</CardTitle>
            <CardDescription>Produtos abaixo do reorder point</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : tables?.lowStockAlerts && tables.lowStockAlerts.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead data-testid="table-head-produto">Produto</TableHead>
                      <TableHead data-testid="table-head-stock-atual">Stock Atual</TableHead>
                      <TableHead data-testid="table-head-reorder-point">Reorder Point</TableHead>
                      <TableHead data-testid="table-head-armazem">Armazém</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tables.lowStockAlerts.map((alert) => (
                      <TableRow key={alert.productId} data-testid={`row-alert-${alert.productId}`}>
                        <TableCell className="font-medium" data-testid={`text-produto-${alert.productId}`}>
                          {alert.name}
                        </TableCell>
                        <TableCell data-testid={`text-stock-atual-${alert.productId}`}>
                          <Badge variant="destructive">{alert.currentStock}</Badge>
                        </TableCell>
                        <TableCell data-testid={`text-reorder-point-${alert.productId}`}>
                          {alert.reorderPoint}
                        </TableCell>
                        <TableCell data-testid={`text-armazem-${alert.productId}`}>
                          {alert.warehouseName}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum produto abaixo do reorder point
              </p>
            )}
          </CardContent>
        </Card>

        {/* Table - Transferências Pendentes */}
        <Card data-testid="card-table-transferencias">
          <CardHeader>
            <CardTitle>Transferências Pendentes</CardTitle>
            <CardDescription>Últimas 5 transferências aguardando processamento</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : tables?.pendingTransfers && tables.pendingTransfers.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead data-testid="table-head-produto-transfer">Produto</TableHead>
                      <TableHead data-testid="table-head-de">De</TableHead>
                      <TableHead data-testid="table-head-para">Para</TableHead>
                      <TableHead data-testid="table-head-quantidade">Quantidade</TableHead>
                      <TableHead data-testid="table-head-data">Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tables.pendingTransfers.map((transfer) => (
                      <TableRow key={transfer.id} data-testid={`row-transfer-${transfer.id}`}>
                        <TableCell className="font-medium" data-testid={`text-produto-transfer-${transfer.id}`}>
                          {transfer.productName}
                        </TableCell>
                        <TableCell data-testid={`text-de-${transfer.id}`}>
                          {transfer.fromWarehouse}
                        </TableCell>
                        <TableCell data-testid={`text-para-${transfer.id}`}>
                          {transfer.toWarehouse}
                        </TableCell>
                        <TableCell data-testid={`text-quantidade-${transfer.id}`}>
                          {transfer.quantity}
                        </TableCell>
                        <TableCell data-testid={`text-data-${transfer.id}`}>
                          {formatDistanceToNow(new Date(transfer.createdAt), { 
                            addSuffix: true, 
                            locale: pt 
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma transferência pendente
              </p>
            )}
          </CardContent>
        </Card>

        {/* Table - Movimentos Recentes */}
        <Card data-testid="card-table-movimentos">
          <CardHeader>
            <CardTitle>Movimentos Recentes</CardTitle>
            <CardDescription>Últimas 10 transações de inventário</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : tables?.recentMovements && tables.recentMovements.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead data-testid="table-head-tipo">Tipo</TableHead>
                      <TableHead data-testid="table-head-produto-mov">Produto</TableHead>
                      <TableHead data-testid="table-head-quantidade-mov">Quantidade</TableHead>
                      <TableHead data-testid="table-head-armazem-mov">Armazém</TableHead>
                      <TableHead data-testid="table-head-data-mov">Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tables.recentMovements.map((movement) => (
                      <TableRow key={movement.id} data-testid={`row-movement-${movement.id}`}>
                        <TableCell data-testid={`badge-tipo-${movement.id}`}>
                          <Badge variant={getTypeBadgeVariant(movement.type)}>
                            {getTypeLabel(movement.type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-produto-mov-${movement.id}`}>
                          {movement.productName}
                        </TableCell>
                        <TableCell data-testid={`text-quantidade-mov-${movement.id}`}>
                          {movement.quantity}
                        </TableCell>
                        <TableCell data-testid={`text-armazem-mov-${movement.id}`}>
                          {movement.warehouseName}
                        </TableCell>
                        <TableCell data-testid={`text-data-mov-${movement.id}`}>
                          {formatDistanceToNow(new Date(movement.createdAt), { 
                            addSuffix: true, 
                            locale: pt 
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum movimento registrado
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
