import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Wallet,
  TrendingUp,
  Bot,
  MessageSquare,
  Download,
  Calendar,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

interface AnalyticsData {
  currentBalance: number;
  reserved: number;
  lifetimeUsage: number;
  lifetimePurchases: number;
  monthlySpend: number;
  topModel: {
    name: string | null;
    credits: number;
  };
  avgCreditsPerConversation: number;
  conversationsThisMonth: number;
  lowBalanceThreshold: number;
  lowBalanceNotified: boolean;
}

interface BalanceData {
  balance: number;
  reserved: number;
  lifetimeUsage: number;
  dailyTrend: Array<{
    date: string;
    creditsUsed: number;
    eventCount: number;
  }>;
}

interface BreakdownData {
  modelBreakdown: Array<{
    resourceName: string;
    totalCredits: number;
    totalEvents: number;
    avgCreditsPerEvent: number;
  }>;
  topConversations: Array<{
    conversationId: string;
    conversationTitle: string | null;
    totalCredits: number;
    eventCount: number;
    lastActivity: string;
  }>;
  topUsers: Array<{
    userId: string;
    userName: string | null;
    userEmail: string | null;
    totalCredits: number;
    eventCount: number;
  }>;
}

interface HistoryData {
  history: Array<{
    id: string;
    resourceType: string;
    resourceName: string;
    unitType: string;
    quantity: string;
    internalCost: string | null;
    creditsDeducted: number;
    userId: string | null;
    userName: string | null;
    userEmail: string | null;
    conversationId: string | null;
    conversationTitle: string | null;
    orchestratorType: string | null;
    createdAt: string;
    metadata: any;
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export default function CreditsAnalytics() {
  const [days, setDays] = useState<number>(30);

  // Fetch analytics overview
  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/credits/analytics", days],
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(`/api/credits/analytics?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  // Fetch balance and trends
  const { data: balance, isLoading: balanceLoading } = useQuery<BalanceData>({
    queryKey: ["/api/credits/balance", days],
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(`/api/credits/balance?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch balance");
      return res.json();
    },
  });

  // Fetch breakdown
  const { data: breakdown, isLoading: breakdownLoading } = useQuery<BreakdownData>({
    queryKey: ["/api/credits/breakdown", days],
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(`/api/credits/breakdown?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch breakdown");
      return res.json();
    },
  });

  // Fetch history
  const { data: history, isLoading: historyLoading } = useQuery<HistoryData>({
    queryKey: ["/api/credits/history"],
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch("/api/credits/history?limit=50");
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
  });

  const handleExportCSV = () => {
    if (!history?.history) return;

    const csvRows = [
      [
        "Data",
        "Recurso",
        "Tipo",
        "Quantidade",
        "Custo Interno (EUR)",
        "Créditos Deduzidos",
        "Utilizador",
        "Conversa",
        "Orquestrador",
      ],
      ...history.history.map((event) => [
        new Date(event.createdAt).toLocaleString("pt-PT"),
        event.resourceName,
        event.unitType,
        event.quantity,
        event.internalCost || "N/A",
        event.creditsDeducted.toString(),
        event.userName || event.userEmail || "N/A",
        event.conversationTitle || "N/A",
        event.orchestratorType || "N/A",
      ]),
    ];

    const csvContent = csvRows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `credit-usage-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const formatCredits = (value: number) => {
    return new Intl.NumberFormat("pt-PT").format(value);
  };

  const isLowBalance = analytics && analytics.currentBalance < analytics.lowBalanceThreshold;

  return (
    <div className="flex-1 space-y-6 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Análise de Créditos
          </h1>
          <p className="text-muted-foreground">
            Monitorize o consumo e custos de IA
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger className="w-[180px]" data-testid="select-date-range">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={!history?.history?.length}
            data-testid="button-export-csv"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-balance">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Atual</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="h-8 bg-muted animate-pulse rounded" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${isLowBalance ? "text-destructive" : ""}`}>
                  {formatCredits(analytics?.currentBalance || 0)} créditos
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isLowBalance ? "⚠️ Saldo baixo" : "Saldo disponível"}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-monthly-spend">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Gasto</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="h-8 bg-muted animate-pulse rounded" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCredits(analytics?.monthlySpend || 0)} créditos
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {analytics?.conversationsThisMonth || 0} conversas
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-top-model">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Modelo Mais Usado</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="h-8 bg-muted animate-pulse rounded" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {analytics?.topModel.name || "N/A"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCredits(analytics?.topModel.credits || 0)} créditos
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* <Card data-testid="card-avg-cost">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Média por Conversa</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="h-8 bg-muted animate-pulse rounded" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCredits(analytics?.avgCreditsPerConversation || 0)} créditos
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Média dos últimos 30 dias
                </p>
              </>
            )}
          </CardContent>
        </Card> */}
      </div>

      {/* Charts and Tables */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends" data-testid="tab-trends">Tendências</TabsTrigger>
          <TabsTrigger value="breakdown" data-testid="tab-breakdown">Breakdown</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">Histórico</TabsTrigger>
        </TabsList>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Consumo Diário de Créditos</CardTitle>
              <CardDescription>
                Evolução do consumo nos últimos {days} dias
              </CardDescription>
            </CardHeader>
            <CardContent>
              {balanceLoading ? (
                <div className="h-[300px] bg-muted animate-pulse rounded" />
              ) : balance?.dailyTrend && balance.dailyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={balance.dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getDate()}/${date.getMonth() + 1}`;
                      }}
                    />
                    <YAxis />
                    <Tooltip
                      formatter={(value: any) => [formatCredits(value as number), "Créditos"]}
                      labelFormatter={(label) => new Date(label).toLocaleDateString("pt-PT")}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="creditsUsed"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      name="Créditos Gastos"
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Sem dados disponíveis
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Model Breakdown Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Breakdown por Modelo</CardTitle>
                <CardDescription>Distribuição de custos por modelo de IA</CardDescription>
              </CardHeader>
              <CardContent>
                {breakdownLoading ? (
                  <div className="h-[300px] bg-muted animate-pulse rounded" />
                ) : breakdown?.modelBreakdown && breakdown.modelBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={breakdown.modelBreakdown}
                        dataKey="totalCredits"
                        nameKey="resourceName"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={(entry) => `${entry.resourceName} (${formatCredits(entry.totalCredits)})`}
                      >
                        {breakdown.modelBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => [formatCredits(value as number), "Créditos"]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Sem dados disponíveis
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Conversations Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Conversas</CardTitle>
                <CardDescription>Conversas com maior consumo de créditos</CardDescription>
              </CardHeader>
              <CardContent>
                {breakdownLoading ? (
                  <div className="h-[300px] bg-muted animate-pulse rounded" />
                ) : breakdown?.topConversations && breakdown.topConversations.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={breakdown.topConversations.slice(0, 5)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="conversationTitle"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis />
                      <Tooltip
                        formatter={(value: any) => [formatCredits(value as number), "Créditos"]}
                      />
                      <Bar dataKey="totalCredits" fill="#3b82f6" name="Créditos Gastos" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Sem dados disponíveis
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Transações</CardTitle>
              <CardDescription>
                Últimas {history?.history?.length || 0} transações de créditos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : history?.history && history.history.length > 0 ? (
                <div className="relative overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left">Data</th>
                        <th className="px-4 py-3 text-left">Recurso</th>
                        <th className="px-4 py-3 text-left">Tipo</th>
                        <th className="px-4 py-3 text-right">Quantidade</th>
                        <th className="px-4 py-3 text-right">Créditos</th>
                        <th className="px-4 py-3 text-left">Utilizador</th>
                        <th className="px-4 py-3 text-left">Conversa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.history.map((event) => (
                        <tr key={event.id} className="border-b hover-elevate">
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formatDistanceToNow(new Date(event.createdAt), {
                              addSuffix: true,
                              locale: pt,
                            })}
                          </td>
                          <td className="px-4 py-3">{event.resourceName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{event.unitType}</td>
                          <td className="px-4 py-3 text-right">
                            {parseFloat(event.quantity).toFixed(3)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatCredits(event.creditsDeducted)}
                          </td>
                          <td className="px-4 py-3">
                            {event.userName || event.userEmail || "—"}
                          </td>
                          <td className="px-4 py-3 truncate max-w-[200px]">
                            {event.conversationTitle || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  Sem transações registadas
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
