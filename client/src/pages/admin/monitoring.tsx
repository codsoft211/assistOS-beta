import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Zap, Bot, CheckCircle, XCircle, Clock, BarChart3 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ExecutionRecord {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  error?: string;
  automationId?: string;
  automationName?: string;
  workflowId?: string;
  workflowName?: string;
  agentId?: string;
  agentName?: string;
}

interface ExecutionsResponse {
  executions: ExecutionRecord[];
  total: number;
}

interface StatsResponse {
  stats: {
    status: string;
    count: number;
  }[];
  period: string;
}

export default function AdminMonitoringPage() {
  const [activeTab, setActiveTab] = useState<"automations" | "workflows" | "agents">("automations");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [statsPeriod, setStatsPeriod] = useState<"7d" | "30d" | "90d">("7d");
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data: statsData, isLoading: loadingStats } = useQuery<StatsResponse>({
    queryKey: ["/api/executions/stats", { period: statsPeriod }],
    queryFn: async () => {
      const res = await fetch(`/api/executions/stats?period=${statsPeriod}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: executionsData, isLoading: loadingExecutions } = useQuery<ExecutionsResponse>({
    queryKey: ["/api/executions", activeTab, { status: statusFilter, page, limit }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(statusFilter !== "all" && { status: statusFilter }),
      });
      
      const res = await fetch(`/api/executions/${activeTab}?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch executions");
      return res.json();
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", icon: any }> = {
      pending: { variant: "outline", icon: Clock },
      running: { variant: "default", icon: Activity },
      completed: { variant: "secondary", icon: CheckCircle },
      failed: { variant: "destructive", icon: XCircle },
    };
    const config = variants[status] || variants.pending;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1" data-testid={`badge-status-${status}`}>
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const totalPages = Math.ceil((executionsData?.total || 0) / limit);

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-monitoring-title">
            <BarChart3 className="h-8 w-8" />
            Execution Monitoring
          </h2>
          <p className="text-muted-foreground mt-1" data-testid="text-monitoring-description">
            Monitorize automações, workflows e agentes em tempo real
          </p>
        </div>
        
        <Select value={statsPeriod} onValueChange={(v: any) => setStatsPeriod(v)}>
          <SelectTrigger className="w-32" data-testid="select-stats-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
            <SelectItem value="90d">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {loadingStats ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" data-testid={`skeleton-stat-${i}`} />
          ))
        ) : (
          <>
            {["pending", "running", "completed", "failed"].map((status) => {
              const stat = statsData?.stats.find(s => s.status === status);
              const count = stat?.count || 0;
              const icons: Record<string, any> = {
                pending: Clock,
                running: Activity,
                completed: CheckCircle,
                failed: XCircle,
              };
              const Icon = icons[status];
              
              return (
                <Card key={status} data-testid={`card-stat-${status}`}>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium capitalize">{status}</CardTitle>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid={`text-stat-${status}`}>
                      {count}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Últimos {statsPeriod === "7d" ? "7" : statsPeriod === "30d" ? "30" : "90"} dias
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </div>

      <Card data-testid="card-executions-list">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle data-testid="text-executions-title">Execuções</CardTitle>
              <CardDescription>
                Histórico de execuções com filtros por status
              </CardDescription>
            </div>
            
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v: any) => { setActiveTab(v); setPage(1); }}>
            <TabsList className="grid w-full grid-cols-3" data-testid="tabs-execution-type">
              <TabsTrigger value="automations" className="gap-2" data-testid="tab-automations">
                <Zap className="h-4 w-4" />
                Automações
              </TabsTrigger>
              <TabsTrigger value="workflows" className="gap-2" data-testid="tab-workflows">
                <Activity className="h-4 w-4" />
                Workflows
              </TabsTrigger>
              <TabsTrigger value="agents" className="gap-2" data-testid="tab-agents">
                <Bot className="h-4 w-4" />
                Agentes
              </TabsTrigger>
            </TabsList>

            {["automations", "workflows", "agents"].map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-4">
                {loadingExecutions ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" data-testid={`skeleton-execution-${i}`} />
                    ))}
                  </div>
                ) : (
                  <>
                    <Table data-testid={`table-${tab}`}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Iniciado</TableHead>
                          <TableHead>Duração</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {executionsData?.executions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                              Nenhuma execução encontrada
                            </TableCell>
                          </TableRow>
                        ) : (
                          executionsData?.executions.map((execution) => {
                            const name = execution.automationName || execution.workflowName || execution.agentName || "N/A";
                            const duration = execution.completedAt 
                              ? `${Math.round((new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000)}s`
                              : "-";
                            
                            return (
                              <TableRow key={execution.id} data-testid={`row-execution-${execution.id}`}>
                                <TableCell className="font-mono text-xs" data-testid={`text-id-${execution.id}`}>
                                  {execution.id.substring(0, 8)}...
                                </TableCell>
                                <TableCell data-testid={`text-name-${execution.id}`}>{name}</TableCell>
                                <TableCell>{getStatusBadge(execution.status)}</TableCell>
                                <TableCell className="text-sm text-muted-foreground" data-testid={`text-started-${execution.id}`}>
                                  {formatDistanceToNow(new Date(execution.startedAt), { 
                                    addSuffix: true,
                                    locale: ptBR 
                                  })}
                                </TableCell>
                                <TableCell className="text-sm" data-testid={`text-duration-${execution.id}`}>
                                  {duration}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                          Página {page} de {totalPages} ({executionsData?.total || 0} total)
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1 text-sm border rounded hover-elevate active-elevate-2 disabled:opacity-50"
                            data-testid="button-prev-page"
                          >
                            Anterior
                          </button>
                          <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-3 py-1 text-sm border rounded hover-elevate active-elevate-2 disabled:opacity-50"
                            data-testid="button-next-page"
                          >
                            Próxima
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
