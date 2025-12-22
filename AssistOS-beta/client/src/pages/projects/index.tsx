import { useState, useEffect, useCallback, useRef } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderKanban,
  Plus,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  LayoutDashboard,
} from "lucide-react";
import { Link } from "wouter";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

const PAGE_SIZE = 50;

interface Project {
  id: string;
  projectCode: string;
  name: string;
  description?: string;
  status: string;
  clientId: string;
  clientName?: string;
  date?: string;
  plannedBudget?: string;
  numberOfPeople?: number;
  pricePerPerson?: string;
  createdAt: string;
  owner?: string;
  location?: string;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-green-500/20 text-green-600 border-green-500/30",
  active: "bg-blue-500/20 text-blue-600 border-blue-500/30",
  in_progress: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30",
  completed: "bg-gray-500/20 text-gray-600 border-gray-500/30",
  cancelled: "bg-red-500/20 text-red-600 border-red-500/30",
  on_hold: "bg-orange-500/20 text-orange-600 border-orange-500/30",
  planning: "bg-purple-500/20 text-purple-600 border-purple-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  active: "Active",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  on_hold: "On Hold",
  planning: "Planning",
};

export default function ProjectsPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Fetch available locations for filter
  const { data: locationsData } = useQuery({
    queryKey: ['/api/modules/projects/locations'],
    queryFn: async () => {
      const response = await fetch('/api/modules/projects/locations?environment=sandbox', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch locations');
      return response.json();
    },
  });
  const locations: string[] = locationsData?.locations || [];

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['/api/modules/projects/list', statusFilter, locationFilter, search, sortField, sortDirection],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await fetch('/api/modules/projects/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          page: pageParam,
          pageSize: PAGE_SIZE,
          search: search || undefined,
          status: statusFilter !== "all" ? [statusFilter] : undefined,
          location: locationFilter !== "all" ? locationFilter : undefined,
          sortField,
          sortOrder: sortDirection,
          environment: "sandbox",
        }),
      });
      if (!response.ok) throw new Error('Failed to fetch projects');
      return response.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + (page.projects?.length || 0), 0);
      if (totalFetched >= (lastPage.total || 0)) return undefined;
      return allPages.length + 1;
    },
    initialPageParam: 1,
  });

  const projects = data?.pages.flatMap(page => page.projects || []) || [];
  const total = data?.pages[0]?.total || 0;

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 200 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  const handleSort = (fieldKey: string) => {
    const dbFieldMap: Record<string, string> = {
      'projectCode': 'projectCode',
      'name': 'name',
      'status': 'status',
      'date': 'date',
      'plannedBudget': 'plannedBudget',
      'clientName': 'clientId',
    };
    const dbField = dbFieldMap[fieldKey] || fieldKey;
    
    if (sortField === dbField) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(dbField);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (fieldKey: string) => {
    const dbFieldMap: Record<string, string> = {
      'projectCode': 'projectCode',
      'name': 'name',
      'status': 'status',
      'date': 'date',
      'plannedBudget': 'plannedBudget',
      'clientName': 'clientId',
    };
    const dbField = dbFieldMap[fieldKey] || fieldKey;
    
    if (sortField !== dbField) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd/MM/yyyy", { locale: pt });
    } catch {
      return "-";
    }
  };

  const formatCurrency = (value?: string) => {
    if (!value) return "-";
    const num = parseFloat(value);
    if (isNaN(num)) return "-";
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
    }).format(num);
  };

  const getStatusBadge = (status: string) => {
    const colorClass = STATUS_COLORS[status] || STATUS_COLORS.planning;
    const label = STATUS_LABELS[status] || status;
    return (
      <Badge variant="outline" className={`${colorClass} border`}>
        {label}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 pb-2 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <FolderKanban className="h-6 w-6" />
            {t("common:modules.projects", "Projetos")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `${projects.length} de ${total} projetos` : 'Gestão de projetos'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/projects">
            <Button variant="outline" data-testid="button-view-dashboard">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Ver Dashboard
            </Button>
          </Link>
          <Button data-testid="button-new-project">
            <Plus className="h-4 w-4 mr-2" />
            Novo Projeto
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 pb-3" data-testid="card-filters">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9" data-testid="select-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-[180px] h-9" data-testid="select-location">
            <SelectValue placeholder="Zona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Zonas</SelectItem>
            {locations.map((loc: string) => (
              <SelectItem key={loc} value={loc}>{loc}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card data-testid="card-projects-table" className="flex-1 mx-4 mb-4 overflow-hidden flex flex-col">
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-auto"
        >
          <Table className="text-xs">
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead 
                  className="cursor-pointer select-none hover:bg-muted/50 transition-colors whitespace-nowrap px-1.5 py-1.5"
                  onClick={() => handleSort('projectCode')}
                >
                  <div className="flex items-center">
                    Code
                    {getSortIcon('projectCode')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer select-none hover:bg-muted/50 transition-colors whitespace-nowrap px-1.5 py-1.5"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center">
                    Name
                    {getSortIcon('name')}
                  </div>
                </TableHead>
                <TableHead className="whitespace-nowrap px-1.5 py-1.5">Client</TableHead>
                <TableHead className="whitespace-nowrap px-1.5 py-1.5">Owner</TableHead>
                <TableHead 
                  className="cursor-pointer select-none hover:bg-muted/50 transition-colors whitespace-nowrap px-1.5 py-1.5"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center">
                    Status
                    {getSortIcon('status')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer select-none hover:bg-muted/50 transition-colors whitespace-nowrap px-1.5 py-1.5"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center">
                    Date
                    {getSortIcon('date')}
                  </div>
                </TableHead>
                <TableHead className="whitespace-nowrap text-right px-1.5 py-1.5">
                  Pax
                </TableHead>
                <TableHead className="whitespace-nowrap text-right px-1.5 py-1.5">
                  €/Pax
                </TableHead>
                <TableHead 
                  className="cursor-pointer select-none hover:bg-muted/50 transition-colors whitespace-nowrap text-right px-1.5 py-1.5"
                  onClick={() => handleSort('plannedBudget')}
                >
                  <div className="flex items-center justify-end">
                    Budget
                    {getSortIcon('plannedBudget')}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    Nenhum projeto encontrado
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {projects.map((project: Project) => (
                    <TableRow 
                      key={project.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setLocation(`/projects/${project.id}`)}
                      data-testid={`row-project-${project.id}`}
                    >
                      <TableCell className="font-mono whitespace-nowrap px-1.5 py-1">
                        {project.projectCode}
                      </TableCell>
                      <TableCell className="whitespace-nowrap max-w-[180px] truncate px-1.5 py-1">
                        {project.name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap max-w-[120px] truncate px-1.5 py-1">
                        {project.clientName || "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap max-w-[80px] truncate px-1.5 py-1">
                        {project.owner || "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-1.5 py-1">
                        {getStatusBadge(project.status)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-1.5 py-1">
                        {formatDate(project.date)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap px-1.5 py-1">
                        {project.numberOfPeople || "-"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap px-1.5 py-1">
                        {formatCurrency(project.pricePerPerson)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap px-1.5 py-1">
                        {formatCurrency(project.plannedBudget)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {isFetchingNextPage && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-3">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
