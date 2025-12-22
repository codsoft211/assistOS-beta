import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FileText, 
  Users, 
  Package, 
  Building2, 
  MessageSquare,
  DollarSign,
  TrendingUp,
  Settings,
  Filter,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Activity {
  id: number;
  tenantId: string;
  environment: string;
  userId: string | null;
  userName: string | null;
  moduleId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  description: string | null;
  metadata: any;
  isVisible: boolean;
  importance: string;
  createdAt: string;
}

interface ActivityFeedProps {
  moduleFilter?: string[];
  limit?: number;
  showFilters?: boolean;
  className?: string;
}

const MODULE_ICONS: Record<string, any> = {
  finance: DollarSign,
  crm: Users,
  logistics: Package,
  projects: Building2,
  communications: MessageSquare,
  angariacao: TrendingUp,
  settings: Settings,
};

const MODULE_NAMES: Record<string, string> = {
  finance: "Financeiro",
  crm: "CRM",
  logistics: "Logística",
  projects: "Projetos",
  communications: "Comunicações",
  angariacao: "Angariação",
  settings: "Configurações",
};

const IMPORTANCE_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-primary/10 text-primary",
  high: "bg-orange-500/10 text-orange-500",
  critical: "bg-red-500/10 text-red-500",
};

export function ActivityFeed({ 
  moduleFilter = [], 
  limit = 50, 
  showFilters = true,
  className = "",
}: ActivityFeedProps) {
  const [selectedModules, setSelectedModules] = useState<string[]>(moduleFilter);
  const queryClient = useQueryClient();

  // Fetch activities
  const { data, isLoading, refetch } = useQuery<{ activities: Activity[]; total: number; hasMore: boolean }>({
    queryKey: ['/api/activity-feed', { modules: selectedModules, limit }],
  });

  // Real-time updates via SSE
  useEffect(() => {
    const eventSource = new EventSource("/api/activity-feed/stream");

    eventSource.addEventListener("activity:created", (event) => {
      const newActivity = JSON.parse(event.data).activity;
      
      // Filter by selected modules if any
      if (selectedModules.length > 0 && !selectedModules.includes(newActivity.moduleId)) {
        return;
      }

      // Add new activity to the cache
      queryClient.setQueryData(
        ['/api/activity-feed', { modules: selectedModules, limit }],
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            activities: [newActivity, ...old.activities].slice(0, limit),
            total: old.total + 1,
          };
        }
      );
    });

    eventSource.onerror = () => {
      console.error("[ActivityFeed] SSE connection error - EventSource will auto-reconnect");
      // Don't close - let EventSource auto-reconnect with credentials
    };

    return () => {
      eventSource.close();
    };
  }, [queryClient, selectedModules, limit]);

  const toggleModule = (moduleId: string) => {
    setSelectedModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((m) => m !== moduleId)
        : [...prev, moduleId]
    );
  };

  const clearFilters = () => {
    setSelectedModules([]);
  };

  return (
    <Card className={`flex flex-col ${className}`} data-testid="card-activity-feed">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-4 border-b">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Feed de Atividades</h3>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => refetch()}
          data-testid="button-refresh-activities"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 p-4 border-b">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Módulos:</span>
          {Object.entries(MODULE_NAMES).map(([moduleId, name]) => {
            const Icon = MODULE_ICONS[moduleId] || FileText;
            const isSelected = selectedModules.includes(moduleId);
            return (
              <Button
                key={moduleId}
                size="sm"
                variant={isSelected ? "default" : "outline"}
                onClick={() => toggleModule(moduleId)}
                data-testid={`button-filter-${moduleId}`}
                className="h-7"
              >
                <Icon className="w-3 h-3 mr-1" />
                {name}
              </Button>
            );
          })}
          {selectedModules.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearFilters}
              data-testid="button-clear-filters"
              className="h-7"
            >
              Limpar
            </Button>
          )}
        </div>
      )}

      {/* Activity List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {isLoading ? (
            // Loading skeletons
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))
          ) : data?.activities && data.activities.length > 0 ? (
            data.activities.map((activity) => {
              const Icon = MODULE_ICONS[activity.moduleId] || FileText;
              const moduleName = MODULE_NAMES[activity.moduleId] || activity.moduleId;
              const importanceColor = IMPORTANCE_COLORS[activity.importance] || IMPORTANCE_COLORS.normal;

              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-md hover-elevate active-elevate-2 transition-all"
                  data-testid={`activity-item-${activity.id}`}
                >
                  {/* Icon */}
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${importanceColor}`}>
                    <Icon className="w-5 h-5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Description */}
                    <p className="text-sm font-medium text-foreground">
                      {activity.description || `${activity.action} em ${activity.entityType}`}
                    </p>

                    {/* Metadata */}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge variant="outline" className="h-5 text-xs" data-testid={`badge-module-${activity.id}`}>
                        {moduleName}
                      </Badge>
                      {activity.userName && (
                        <span className="text-xs text-muted-foreground">
                          por {activity.userName}
                        </span>
                      )}
                      {activity.entityName && (
                        <span className="text-xs text-muted-foreground">
                          · {activity.entityName}
                        </span>
                      )}
                    </div>

                    {/* Timestamp */}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(activity.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma atividade encontrada</p>
              <p className="text-xs text-muted-foreground mt-1">
                As atividades aparecerão aqui em tempo real
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      {data?.total && data.total > 0 && (
        <div className="flex items-center justify-between gap-2 p-3 border-t text-xs text-muted-foreground">
          <span>
            {data.activities.length} de {data.total} atividades
          </span>
          {data.hasMore && (
            <span className="text-primary">Carregar mais disponível via scroll</span>
          )}
        </div>
      )}
    </Card>
  );
}
