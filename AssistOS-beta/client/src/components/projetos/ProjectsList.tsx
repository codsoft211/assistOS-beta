import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreVertical } from "lucide-react";
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

interface ProjectsListProps {
  projects: Project[];
  sortField: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
}

export function ProjectsList({ projects, sortField, sortOrder, onSort }: ProjectsListProps) {
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
      return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return "-";
    }
  };

  const SortButton = ({ field, label }: { field: string; label: string }) => (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => onSort(field)}
      data-testid={`button-sort-${field}`}
    >
      {label}
      <ArrowUpDown
        className={`ml-2 h-4 w-4 ${
          sortField === field ? "text-primary" : "text-muted-foreground"
        }`}
      />
    </Button>
  );

  return (
    <div className="border rounded-md" data-testid="projects-list">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortButton field="projectCode" label="Código" />
            </TableHead>
            <TableHead>
              <SortButton field="name" label="Nome" />
            </TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>
              <SortButton field="startDate" label="Início" />
            </TableHead>
            <TableHead>
              <SortButton field="endDate" label="Fim" />
            </TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead>Progresso</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow
              key={project.id}
              className="cursor-pointer hover-elevate"
              data-testid={`row-project-${project.id}`}
            >
              <TableCell>
                <span className="font-mono text-sm" data-testid={`text-code-${project.id}`}>
                  {project.projectCode}
                </span>
              </TableCell>
              <TableCell>
                  <div>
                    <div className="font-medium" data-testid={`text-name-${project.id}`}>
                      {project.name}
                    </div>
                    {project.tags && project.tags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {project.tags.slice(0, 2).map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {project.tags.length > 2 && (
                          <Badge variant="secondary" className="text-xs">
                            +{project.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
              </TableCell>
              <TableCell>
                <span className="text-sm">{project.clientName || "-"}</span>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={getStatusColor(project.status)}
                  data-testid={`badge-status-${project.id}`}
                >
                  {project.status}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {formatDate(project.startDate)}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {formatDate(project.endDate)}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm">{project.ownerName || "-"}</span>
              </TableCell>
              <TableCell>
                {typeof project.progress === "number" ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[80px]">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground min-w-[35px] text-right">
                      {project.progress}%
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
