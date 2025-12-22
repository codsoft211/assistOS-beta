import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  FolderKanban, 
  Calendar, 
  TrendingUp, 
  Euro, 
  Clock, 
  Plus,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  CalendarDays
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface ProjectMetrics {
  total: number;
  byStatus: Record<string, number>;
  thisMonth: number;
  upcoming: number;
  totalBudget: number;
  conversionRate: number;
}

interface ProjectSummary {
  id: string;
  name: string;
  projectCode: string;
  status: string;
  date?: string;
  startDate?: string;
  plannedBudget?: number;
  createdAt: string;
}

interface DashboardData {
  metrics: ProjectMetrics;
  recentProjects: ProjectSummary[];
  upcomingProjects: ProjectSummary[];
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-green-500/20 text-green-600 border-green-500/30",
  in_progress: "bg-blue-500/20 text-blue-600 border-blue-500/30",
  planning: "bg-purple-500/20 text-purple-600 border-purple-500/30",
  proposal_sent: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30",
  completed: "bg-gray-500/20 text-gray-600 border-gray-500/30",
  cancelled: "bg-red-500/20 text-red-600 border-red-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  planning: "Planeamento",
  proposal_sent: "Proposta Enviada",
  confirmed: "Confirmado",
  in_progress: "Em Progresso",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export default function ProjectsDashboard() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['/api/modules/projects/dashboard'],
  });

  const metrics = data?.metrics || {
    total: 0,
    byStatus: {},
    thisMonth: 0,
    upcoming: 0,
    totalBudget: 0,
    conversionRate: 0
  };

  const stats = [
    {
      title: "Total Projetos",
      value: metrics.total,
      icon: FolderKanban,
      description: "Todos os projetos"
    },
    {
      title: "Este Mês",
      value: metrics.thisMonth,
      icon: CalendarDays,
      description: "Novos projetos"
    },
    {
      title: "Próximos 7 Dias",
      value: metrics.upcoming,
      icon: Clock,
      description: "Eventos agendados"
    },
    {
      title: "Volume Total",
      value: new Intl.NumberFormat('pt-PT', { 
        style: 'currency', 
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(metrics.totalBudget),
      icon: Euro,
      description: "Confirmados + Em Progresso"
    },
  ];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p>Erro ao carregar dashboard: {(error as Error).message}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <FolderKanban className="h-8 w-8" />
            Projetos
          </h1>
          <p className="text-muted-foreground">
            Visão geral e métricas dos seus projetos
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/projects/list">
            <Button variant="outline" data-testid="button-view-list">
              <FileText className="h-4 w-4 mr-2" />
              Ver Lista
            </Button>
          </Link>
          <Link href="/projects/new">
            <Button data-testid="button-new-project">
              <Plus className="h-4 w-4 mr-2" />
              Novo Projeto
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s/g, '-')}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid={`text-${stat.title.toLowerCase().replace(/\s/g, '-')}`}>
                  {stat.value}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card data-testid="card-status-breakdown">
          <CardHeader>
            <CardTitle>Distribuição por Status</CardTitle>
            <CardDescription>Estado atual dos projetos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(metrics.byStatus).map(([status, count]) => {
              const percentage = metrics.total > 0 ? (count / metrics.total) * 100 : 0;
              
              return (
                <div key={status} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={STATUS_COLORS[status] || ""}
                      >
                        {STATUS_LABELS[status] || status}
                      </Badge>
                    </div>
                    <span className="text-muted-foreground">{count} ({percentage.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        status === 'confirmed' ? 'bg-green-500' :
                        status === 'in_progress' ? 'bg-blue-500' :
                        status === 'completed' ? 'bg-gray-500' :
                        status === 'cancelled' ? 'bg-red-500' :
                        status === 'proposal_sent' ? 'bg-yellow-500' :
                        'bg-purple-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
            
            {Object.keys(metrics.byStatus).length === 0 && (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <AlertCircle className="h-4 w-4 mr-2" />
                Nenhum projeto encontrado
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-upcoming-projects">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Próximos Eventos</CardTitle>
              <CardDescription>Projetos agendados</CardDescription>
            </div>
            <Link href="/projects/list?sort=date&order=asc">
              <Button variant="ghost" size="sm">
                Ver todos
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {data?.upcomingProjects && data.upcomingProjects.length > 0 ? (
              <div className="space-y-3">
                {data.upcomingProjects.map((project) => {
                  const eventDate = project.date || project.startDate;
                  return (
                    <Link key={project.id} href={`/projects/${project.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-md hover-elevate cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{project.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {project.projectCode}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${STATUS_COLORS[project.status] || ""}`}
                            >
                              {STATUS_LABELS[project.status] || project.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          {eventDate && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(eventDate), "dd MMM", { locale: pt })}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Calendar className="h-8 w-8 mb-2" />
                <p className="text-sm">Nenhum evento próximo</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-recent-projects" className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Projetos Recentes</CardTitle>
              <CardDescription>Últimos projetos criados ou atualizados</CardDescription>
            </div>
            <Link href="/projects/list">
              <Button variant="ghost" size="sm">
                Ver todos
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {data?.recentProjects && data.recentProjects.length > 0 ? (
              <div className="space-y-3">
                {data.recentProjects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-md hover-elevate cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{project.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {project.projectCode}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${STATUS_COLORS[project.status] || ""}`}
                          >
                            {STATUS_LABELS[project.status] || project.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Criado em {format(new Date(project.createdAt), "dd/MM/yyyy", { locale: pt })}
                          </span>
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        {project.plannedBudget && (
                          <div className="text-sm font-medium">
                            {new Intl.NumberFormat('pt-PT', { 
                              style: 'currency', 
                              currency: 'EUR',
                              minimumFractionDigits: 0 
                            }).format(project.plannedBudget)}
                          </div>
                        )}
                        {(project.date || project.startDate) && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(project.date || project.startDate!), "dd MMM yyyy", { locale: pt })}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <FolderKanban className="h-8 w-8 mb-2" />
                <p className="text-sm">Nenhum projeto criado ainda</p>
                <Link href="/projects/new">
                  <Button variant="ghost" size="sm" className="mt-2">
                    <Plus className="h-4 w-4 mr-1" />
                    Criar primeiro projeto
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-conversion-metrics">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Taxa de Conversão
          </CardTitle>
          <CardDescription>Projetos confirmados vs total</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div>
              <div className="text-4xl font-bold text-green-600">
                {metrics.conversionRate.toFixed(1)}%
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Taxa de confirmação
              </p>
            </div>
            <div className="flex-1 grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-semibold">{metrics.byStatus.confirmed || 0}</div>
                <p className="text-xs text-muted-foreground">Confirmados</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold">{metrics.byStatus.in_progress || 0}</div>
                <p className="text-xs text-muted-foreground">Em Progresso</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold">{metrics.byStatus.completed || 0}</div>
                <p className="text-xs text-muted-foreground">Concluídos</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
