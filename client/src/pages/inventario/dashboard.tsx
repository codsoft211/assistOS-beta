import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Package, AlertTriangle, Warehouse, TrendingUp, Euro, Box } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";

interface DashboardData {
  stats: {
    totalWarehouses: number;
    lowStockItems: number;
    pendingTransfers: number;
    equipmentInUse: number;
    totalInventoryValue: number;
    totalProducts: number;
  };
  charts: {
    stockByWarehouse: Array<{
      warehouseName: string;
      totalItems: number;
      totalValue: number;
    }>;
    recentMovements: Array<{
      date: string;
      inCount: number;
      outCount: number;
      adjustmentCount: number;
    }>;
  };
  tables: {
    lowStockAlerts: Array<{
      productId: string;
      name: string;
      currentStock: number;
      reorderPoint: number;
      warehouseName: string;
    }>;
    pendingTransfers: Array<{
      id: string;
      productName: string;
      fromWarehouse: string;
      toWarehouse: string;
      qty: number;
      requestedBy: string;
    }>;
    recentMovements: Array<{
      id: string;
      type: string;
      productName: string;
      quantity: number;
      warehouseName: string;
      createdAt: string;
    }>;
  };
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat("pt-PT").format(value);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

export default function InventarioDashboard() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/inventory/dashboard"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Inventory Dashboard</h1>
          <p className="text-muted-foreground">Central view of items, stock levels, and operations</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
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

  const kpiCards = [
    {
      title: "Total Products",
      value: data?.stats?.totalProducts || 0,
      icon: Package,
      testId: "kpi-total-products",
      description: "Items in catalog",
      format: "number"
    },
    {
      title: "Inventory Value",
      value: data?.stats?.totalInventoryValue || 0,
      icon: Euro,
      testId: "kpi-inventory-value",
      description: "Total stock value",
      format: "currency"
    },
    {
      title: "Warehouses",
      value: data?.stats?.totalWarehouses || 0,
      icon: Warehouse,
      testId: "kpi-warehouses",
      description: "Active locations",
      format: "number"
    },
    {
      title: "Low Stock Alerts",
      value: data?.stats?.lowStockItems || 0,
      icon: AlertTriangle,
      testId: "kpi-low-stock",
      description: "Need replenishment",
      format: "number",
      variant: "warning"
    },
    {
      title: "Pending Transfers",
      value: data?.stats?.pendingTransfers || 0,
      icon: TrendingUp,
      testId: "kpi-pending-transfers",
      description: "Awaiting processing",
      format: "number"
    },
    {
      title: "Equipment In Use",
      value: data?.stats?.equipmentInUse || 0,
      icon: Box,
      testId: "kpi-equipment-use",
      description: "Currently allocated",
      format: "number"
    }
  ];

  return (
    <div className="p-6 space-y-6" data-testid="page-inventario-dashboard">
      <div className="flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Inventory Dashboard</h1>
          <p className="text-muted-foreground">Central view of items, stock levels, and operations</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            data-testid="button-view-items"
            onClick={() => setLocation("/inventario/items")}
          >
            <Package className="h-4 w-4 mr-2" />
            View Items
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            data-testid="button-new-item"
            onClick={() => setLocation("/inventario/items/new")}
          >
            Add Item
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((kpi) => (
          <Card key={kpi.testId} data-testid={kpi.testId}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.variant === 'warning' ? 'text-yellow-500' : 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid={`${kpi.testId}-value`}>
                {kpi.format === 'currency' 
                  ? formatCurrency(kpi.value)
                  : formatNumber(kpi.value)}
              </div>
              <p className="text-xs text-muted-foreground">{kpi.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-stock-by-warehouse">
          <CardHeader>
            <CardTitle>Stock by Warehouse</CardTitle>
            <CardDescription>Distribution of items across locations</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.charts?.stockByWarehouse && data.charts.stockByWarehouse.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.charts.stockByWarehouse}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="warehouseName" />
                  <YAxis yAxisId="left" orientation="left" stroke="#3B82F6" />
                  <YAxis yAxisId="right" orientation="right" stroke="#10B981" />
                  <Tooltip formatter={(value: number, name: string) => {
                    if (name === 'totalValue') return formatCurrency(value);
                    return formatNumber(value);
                  }} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="totalItems" fill="#3B82F6" name="Total Items" />
                  <Bar yAxisId="right" dataKey="totalValue" fill="#10B981" name="Total Value" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No warehouse data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-recent-movements">
          <CardHeader>
            <CardTitle>Movement Trends</CardTitle>
            <CardDescription>Inventory movement activity over time</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.charts?.recentMovements && data.charts.recentMovements.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.charts.recentMovements}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="inCount" fill="#10B981" name="Entries" />
                  <Bar dataKey="outCount" fill="#EF4444" name="Exits" />
                  <Bar dataKey="adjustmentCount" fill="#F59E0B" name="Adjustments" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No movement data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-low-stock-alerts">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Low Stock Alerts
            </CardTitle>
            <CardDescription>Items below reorder point</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.tables?.lowStockAlerts && data.tables.lowStockAlerts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Reorder Point</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tables.lowStockAlerts.slice(0, 5).map((item) => (
                    <TableRow key={item.productId} data-testid={`row-low-stock-${item.productId}`}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.warehouseName}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="destructive">{formatNumber(item.currentStock)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(item.reorderPoint)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No low stock alerts
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-recent-transactions">
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Latest inventory movements</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.tables?.recentMovements && data.tables.recentMovements.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tables.recentMovements.slice(0, 5).map((tx) => (
                    <TableRow key={tx.id} data-testid={`row-transaction-${tx.id}`}>
                      <TableCell>
                        <Badge variant={tx.type === 'in' ? 'default' : tx.type === 'out' ? 'secondary' : 'outline'}>
                          {tx.type === 'in' ? 'Entry' : tx.type === 'out' ? 'Exit' : 'Adjustment'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{tx.productName}</TableCell>
                      <TableCell className="text-right">
                        <span className={tx.type === 'in' ? 'text-green-600' : tx.type === 'out' ? 'text-red-600' : ''}>
                          {tx.type === 'in' ? '+' : tx.type === 'out' ? '-' : ''}{formatNumber(tx.quantity)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(tx.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No recent transactions
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
