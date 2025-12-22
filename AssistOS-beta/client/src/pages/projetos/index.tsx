import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LayoutGrid,
  LayoutList,
  Plus,
  Search,
  Filter,
  SortAsc,
  AlertCircle,
  Briefcase,
} from "lucide-react";
import { ProjectsGrid } from "@/components/projetos/ProjectsGrid";
import { ProjectsList } from "@/components/projetos/ProjectsList";
import { ProjectsFilters } from "@/components/projetos/ProjectsFilters";
import { CreateProjectDialog } from "@/components/projetos/CreateProjectDialog";

type ViewMode = "grid" | "list";
type SortField = "projectCode" | "name" | "startDate" | "endDate" | "createdAt";
type SortOrder = "asc" | "desc";

interface ProjectFilters {
  search?: string;
  status?: string;
  clientId?: string;
  tags?: string[];
  startDateFrom?: string;
  startDateTo?: string;
  endDateFrom?: string;
  endDateTo?: string;
}

export default function ProjetosIndexPage() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  // Filters state
  const [filters, setFilters] = useState<ProjectFilters>({});
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // Build query params
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("pageSize", pageSize.toString());
    params.set("sortBy", sortField);
    params.set("sortOrder", sortOrder);

    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.clientId) params.set("clientId", filters.clientId);
    if (filters.tags && filters.tags.length > 0) {
      params.set("tags", filters.tags.join(","));
    }
    if (filters.startDateFrom) params.set("startDateFrom", filters.startDateFrom);
    if (filters.startDateTo) params.set("startDateTo", filters.startDateTo);
    if (filters.endDateFrom) params.set("endDateFrom", filters.endDateFrom);
    if (filters.endDateTo) params.set("endDateTo", filters.endDateTo);

    return params.toString();
  };

  // Fetch projects
  const { data: projectsData, isLoading, error } = useQuery({
    queryKey: [`/api/modules/projects/list?${buildQueryParams()}`],
  });

  const projects = projectsData?.projects || [];
  const total = projectsData?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  // Handle filter changes
  const handleFilterChange = (newFilters: Partial<ProjectFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1); // Reset to first page on filter change
  };

  const handleClearFilters = () => {
    setFilters({});
    setPage(1);
  };

  const activeFiltersCount = Object.keys(filters).filter(
    (key) => {
      const value = filters[key as keyof ProjectFilters];
      if (Array.isArray(value)) return value.length > 0;
      return !!value;
    }
  ).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-page-title">
            <Briefcase className="h-8 w-8 text-primary" />
            Projetos
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestão de projetos, clientes e recursos
          </p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          data-testid="button-create-project"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Projeto
        </Button>
      </div>

      {/* Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar projetos..."
                className="pl-10"
                value={filters.search || ""}
                onChange={(e) => handleFilterChange({ search: e.target.value })}
                data-testid="input-search"
              />
            </div>
          </div>

          {/* Sort */}
          <div className="flex gap-2">
            <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
              <SelectTrigger className="w-[180px]" data-testid="select-sort-field">
                <SortAsc className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="projectCode">Código</SelectItem>
                <SelectItem value="name">Nome</SelectItem>
                <SelectItem value="startDate">Data Início</SelectItem>
                <SelectItem value="endDate">Data Fim</SelectItem>
                <SelectItem value="createdAt">Data Criação</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              data-testid="button-toggle-sort-order"
            >
              <SortAsc className={`h-4 w-4 ${sortOrder === "desc" ? "rotate-180" : ""}`} />
            </Button>
          </div>

          {/* View Mode */}
          <div className="flex gap-1 border rounded-md">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="icon"
              onClick={() => setViewMode("grid")}
              data-testid="button-view-grid"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="icon"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
          </div>

          {/* Filters Toggle */}
          <Button
            variant={showFilters ? "default" : "outline"}
            onClick={() => setShowFilters(!showFilters)}
            data-testid="button-toggle-filters"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            {activeFiltersCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-primary-foreground text-primary">
                {activeFiltersCount}
              </span>
            )}
          </Button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t">
            <ProjectsFilters
              filters={filters}
              onFilterChange={handleFilterChange}
              onClearFilters={handleClearFilters}
            />
          </div>
        )}
      </Card>

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Erro ao carregar projetos. Tente novamente.
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2 mb-4" />
              <Skeleton className="h-20 w-full" />
            </Card>
          ))}
        </div>
      )}

      {/* Content */}
      {!isLoading && !error && (
        <>
          {projects.length === 0 ? (
            <Card className="p-12">
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Briefcase className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Nenhum projeto encontrado</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {activeFiltersCount > 0
                      ? "Tente ajustar os filtros ou criar um novo projeto."
                      : "Comece criando seu primeiro projeto."}
                  </p>
                </div>
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeiro Projeto
                </Button>
              </div>
            </Card>
          ) : (
            <>
              {viewMode === "grid" ? (
                <ProjectsGrid projects={projects} />
              ) : (
                <ProjectsList
                  projects={projects}
                  sortField={sortField}
                  sortOrder={sortOrder}
                  onSort={(field: string) => {
                    if (field === sortField) {
                      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                    } else {
                      setSortField(field as SortField);
                      setSortOrder("asc");
                    }
                  }}
                />
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {(page - 1) * pageSize + 1} a {Math.min(page * pageSize, total)} de {total} projetos
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      data-testid="button-prev-page"
                    >
                      Anterior
                    </Button>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        Página {page} de {totalPages}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      data-testid="button-next-page"
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Create Dialog */}
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
