import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, User, Tag, MoreVertical } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Project {
  id: string;
  projectCode: string;
  name: string;
  clientId: string;
  clientName?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  tags?: string[];
  ownerId?: string;
  ownerName?: string;
  progress?: number;
}

interface ProjectsGridProps {
  projects: Project[];
}

export function ProjectsGrid({ projects }: ProjectsGridProps) {
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      planning: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      active: "bg-green-500/10 text-green-500 border-green-500/20",
      on_hold: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      completed: "bg-gray-500/10 text-gray-500 border-gray-500/20",
      cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
    };
    return colors[status] || "bg-gray-500/10 text-gray-500 border-gray-500/20";
  };

  const formatDate = (date: string | undefined) => {
    if (!date) return "-";
    try {
      return format(new Date(date), "dd MMM yyyy", { locale: ptBR });
    } catch {
      return "-";
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="projects-grid">
      {projects.map((project) => (
        <Card
          key={project.id}
          className="hover-elevate active-elevate-2 transition-all cursor-pointer"
          data-testid={`card-project-${project.id}`}
        >
          <div>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-muted-foreground" data-testid={`text-code-${project.id}`}>
                      {project.projectCode}
                    </span>
                    <Badge
                      variant="outline"
                      className={getStatusColor(project.status)}
                      data-testid={`badge-status-${project.id}`}
                    >
                      {project.status}
                    </Badge>
                  </div>
                  <h3 className="font-semibold truncate" data-testid={`text-name-${project.id}`}>
                    {project.name}
                  </h3>
                  {project.clientName && (
                    <p className="text-sm text-muted-foreground truncate">
                      {project.clientName}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-1">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Dates */}
              {(project.startDate || project.endDate) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">
                    {formatDate(project.startDate)} → {formatDate(project.endDate)}
                  </span>
                </div>
              )}

              {/* Owner */}
              {project.ownerName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{project.ownerName}</span>
                </div>
              )}

              {/* Progress */}
              {typeof project.progress === "number" && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-medium">{project.progress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Tags */}
              {project.tags && project.tags.length > 0 && (
                <div className="flex items-start gap-2">
                  <Tag className="h-4 w-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
                  <div className="flex flex-wrap gap-1">
                    {project.tags.slice(0, 3).map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {project.tags.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{project.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </div>
        </Card>
      ))}
    </div>
  );
}
