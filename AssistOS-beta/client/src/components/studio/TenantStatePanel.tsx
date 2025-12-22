import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Package,
  Plug,
  Workflow,
  Bot,
  Database,
  RefreshCw,
  Table2,
  Plus,
  Edit,
  Trash2,
  Filter,
  MoreVertical,
  Search,
  GripVertical,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Key,
  Link2,
  Archive,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ==================== TYPES ====================

interface TenantModule {
  id: string;
  moduleId: string;
  name: string;
  description?: string;
  icon?: string;
  category: string;
  isActive: boolean;
  installedAt: Date | null;
  installedBy: string | null;
  config: Record<string, any> | null;
}

interface Agent {
  id: string;
  name: string;
  type: string;
  status: "active" | "inactive";
  createdAt?: string;
}

interface ConnectorConfig {
  id: number;
  tenantId: string;
  connectorType: string;
  name: string;
  isEnabled: boolean;
  lastTestStatus?: "success" | "failed";
  lastTestAt?: string;
}

// Matches customTables schema in shared/schema.ts
interface CustomTable {
  id: string;
  tableName: string;
  description?: string;
  category?: string;
  columns?: Array<{
    name: string;
    type: string;
    nullable?: boolean;
    default?: any;
    primaryKey?: boolean;
    foreignKey?: {
      table: string;
      column: string;
      onDelete?: string;
    };
  }>;
  isEditable: boolean;
  isSystemTable: boolean;
  isActive: boolean;
  metadata?: Record<string, any>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface TenantData {
  id: string;
  name: string;
  slug: string;
  role: string;
  environment?: string;
  createdAt?: string;
}

// ==================== STAT CARD COMPONENT ====================

interface StatCardProps {
  title: string;
  value: number | string;
  description?: string;
  icon: React.ElementType;
  loading?: boolean;
  variant?: "default" | "success" | "warning" | "error";
  onClick?: () => void;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  loading,
  variant = "default",
  onClick,
}: StatCardProps) {
  const variantStyles = {
    default: "bg-primary/10 text-primary",
    success: "bg-green-500/10 text-green-600",
    warning: "bg-yellow-500/10 text-yellow-600",
    error: "bg-red-500/10 text-red-600",
  };

  if (loading) {
    return (
      <Card className="relative overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-12" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`relative overflow-hidden transition-all ${onClick ? "cursor-pointer hover:shadow-md hover:border-primary/50" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className={`p-3 rounded-lg ${variantStyles[variant]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== TABLE CATEGORIES ====================

// Categories for filtering (includes "all")
const TABLE_FILTER_CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "accounting", label: "Accounting" },
  { value: "crm", label: "CRM" },
  { value: "financial", label: "Financial" },
  { value: "hr", label: "Human Resources" },
  { value: "lead-generation", label: "Lead Generation" },
  { value: "production", label: "Production" },
  { value: "purchasing", label: "Purchasing" },
  { value: "projects", label: "Projects" },
  { value: "logistics", label: "Logistics" },
  { value: "sales", label: "Sales" },
  { value: "agents", label: "Agents" },
  { value: "workflows", label: "Workflows" },
  { value: "operation", label: "Operation" },
];

// Default categories for autocomplete (without "all")
const DEFAULT_CATEGORIES = [
  { value: "accounting", label: "Accounting" },
  { value: "crm", label: "CRM" },
  { value: "financial", label: "Financial" },
  { value: "hr", label: "HR" },
  { value: "lead-generation", label: "Lead Generation" },
  { value: "production", label: "Production" },
  { value: "purchasing", label: "Purchasing" },
  { value: "projects", label: "Projects" },
  { value: "logistics", label: "Logistics" },
  { value: "sales", label: "Sales" },
  { value: "agents", label: "Agents" },
  { value: "workflows", label: "Workflows" },
  { value: "operation", label: "Operation" },
];

// Column types matching PostgreSQL types
const COLUMN_TYPES = [
  { value: "text", label: "Text" },
  { value: "varchar", label: "Varchar" },
  { value: "integer", label: "Integer" },
  { value: "bigint", label: "Big Integer" },
  { value: "decimal", label: "Decimal" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "timestamp", label: "Timestamp" },
  { value: "jsonb", label: "JSON" },
  { value: "uuid", label: "UUID" },
];

// Column definition interface (matches schema)
interface ColumnDefinition {
  name: string;
  type: string;
  nullable?: boolean;
  unique?: boolean;
  isArray?: boolean; // Define as array type (e.g., text[], integer[])
  default?: any;
  primaryKey?: boolean;
  foreignKey?: {
    table: string;
    column: string;
    onDelete?: string;
  };
}

// Default ID column (always present, not editable)
const DEFAULT_ID_COLUMN: ColumnDefinition = {
  name: "id",
  type: "uuid",
  nullable: false,
  unique: true,
  primaryKey: true,
  default: "gen_random_uuid()",
};

// Empty column template
const createEmptyColumn = (): ColumnDefinition => ({
  name: "",
  type: "text",
  nullable: true,
  unique: false,
  isArray: false,
  primaryKey: false,
});

// Check if column is the default ID column
const isIdColumn = (column: ColumnDefinition): boolean => {
  return column.name === "id" && column.type === "uuid" && column.primaryKey === true;
};

interface TenantStatePanelProps {
  onSelectConfig?: (config: any) => void;
}

export default function TenantStatePanel({ onSelectConfig }: TenantStatePanelProps) {
  const { toast } = useToast();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<CustomTable | null>(null);

  // Filter states
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false); // Toggle for archived tables

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

  // Form states (matches customTables schema)
  // Always starts with the default ID column
  const [formData, setFormData] = useState({
    tableName: "",
    description: "",
    category: "custom",
    columns: [{ ...DEFAULT_ID_COLUMN }] as ColumnDefinition[],
  });

  // Track expanded column panels
  const [expandedColumns, setExpandedColumns] = useState<Set<number>>(new Set());

  // Category autocomplete state (for create dialog)
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categoryInputValue, setCategoryInputValue] = useState("");

  // Category autocomplete state (for edit dialog)
  const [editCategoryPopoverOpen, setEditCategoryPopoverOpen] = useState(false);
  const [editCategoryInputValue, setEditCategoryInputValue] = useState("");

  // Fetch tenant & user data
  const { data: userData, isLoading: loadingUser } = useQuery<{
    user: any;
    activeTenant: TenantData;
  }>({
    queryKey: ["/api/auth/me"],
    staleTime: 0,
  });

  // Fetch modules (requires owner/admin role - may return 403)
  const { data: modulesData, isLoading: loadingModules } = useQuery<{
    modules: TenantModule[];
  }>({
    queryKey: ["/api/modules/available"],
    staleTime: 0,
    retry: false, // Don't retry on 403
  });

  // Fetch agent runs (actual API response format)
  const { data: agentsData, isLoading: loadingAgents } = useQuery<{
    data: Agent[];
    pagination: { total: number; limit: number; offset: number };
  }>({
    queryKey: ["/api/executions/agents"],
    staleTime: 0,
    retry: false,
  });

  // Fetch connectors (may return 403 for non-admin users)
  const { data: connectorsData, isLoading: loadingConnectors } = useQuery<
    ConnectorConfig[]
  >({
    queryKey: ["/api/admin/connectors"],
    staleTime: 0,
    retry: false,
  });

  // Fetch custom tables (syncs with customTables schema)
  // Updates via SSE events from AssistBuild and manual module changes
  const { data: tablesData, isLoading: loadingTables } = useQuery<{
    tables: CustomTable[];
    total: number;
  }>({
    queryKey: ["/api/custom-tables"],
    staleTime: 0,
  });

  // Fetch workflows/automation stats
  // Stats endpoint returns: { automations: [{total, status}], workflows: [{total, status}], ag@ents: [{total, status}] }
  const { data: workflowsData, isLoading: loadingWorkflows } = useQuery<{
    automations?: Array<{ total: number; status: string }>;
    workflows?: Array<{ total: number; status: string }>;
    agents?: Array<{ total: number; status: string }>;
  }>({
    queryKey: ["/api/executions/stats"],
    staleTime: 0,
    retry: false,
  });

  const tenant = userData?.activeTenant;
  const isSandbox = tenant?.environment === "sandbox";

  // Calculate stats (handle different response formats)
  const activeModulesCount =
    modulesData?.modules?.filter((m) => m.isActive).length || 0;
  const agentsCount =
    agentsData?.data?.length || agentsData?.pagination?.total || 0;
  const activeConnectorsCount =
    connectorsData?.filter((c) => c.isEnabled).length || 0;
  // Workflows count from stats endpoint (sum of all automations + workflows)
  const workflowsCount =
    (workflowsData?.automations?.reduce((sum, s) => sum + (s.total || 0), 0) || 0) +
    (workflowsData?.workflows?.reduce((sum, s) => sum + (s.total || 0), 0) || 0);

  // Show loading state on initial load
  const isInitialLoading =
    loadingUser ||
    loadingModules ||
    loadingAgents ||
    loadingConnectors ||
    loadingTables;

  // Show skeleton during initial load only
  const showModulesSkeleton = loadingModules;
  const showAgentsSkeleton = loadingAgents;
  const showConnectorsSkeleton = loadingConnectors;
  const showWorkflowsSkeleton = loadingWorkflows;
  const showTablesSkeleton = loadingTables;

  // Filter tables
  const filteredTables = useMemo(() => {
    return tablesData?.tables?.filter((table) => {
      // Filter by active/archived status
      const matchesActiveStatus = showArchived ? !table.isActive : table.isActive;
      const matchesCategory = categoryFilter === "all" || table.category === categoryFilter;
      const matchesSearch = !searchQuery ||
        table.tableName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        table.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (table.metadata as any)?.displayName?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesActiveStatus && matchesCategory && matchesSearch;
    }) || [];
  }, [tablesData?.tables, categoryFilter, searchQuery, showArchived]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredTables.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedTables = filteredTables.slice(startIndex, endIndex);

  // Reset to page 1 when filters change or page size changes
  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  const handleArchivedToggle = (checked: boolean) => {
    setShowArchived(checked);
    setCurrentPage(1);
  };

  // Get unique categories from existing tables for the filter dropdown
  const existingCategories = useMemo(() => {
    const categories = tablesData?.tables
      ?.map((table) => table.category)
      .filter((cat): cat is string => !!cat) || [];
    const uniqueCategories = Array.from(new Set(categories)).sort();
    return [
      { value: "all", label: "All Categories" },
      ...uniqueCategories.map((cat) => ({
        value: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, " "),
      })),
    ];
  }, [tablesData?.tables]);

  // Create table mutation (syncs with customTables schema and creates SQL table)
  const createTableMutation = useMutation({
    mutationFn: async (data: typeof formData & { syncToDatabase?: boolean }) => {
      // Filter out empty columns and clean up data
      const validColumns = data.columns.filter(col => col.name.trim() !== "");
      const res = await apiRequest("POST", "/api/custom-tables", {
        tableName: data.tableName,
        description: data.description,
        category: data.category,
        columns: validColumns,
        syncToDatabase: data.syncToDatabase !== false, // Default to true
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-tables"] });
      const sqlCreated = data?.sqlTableCreated;
      toast({
        title: "Table created",
        description: sqlCreated
          ? "Custom table and SQL table have been created successfully."
          : "Custom table metadata has been created (no SQL table).",
      });
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      // Handle different error formats
      const errorMessage = error?.details || error?.message || "An error occurred.";
      const isNetworkError = error?.code === 'EAI_AGAIN' || error?.code === 'ENOTFOUND' ||
        errorMessage.includes("network") || errorMessage.includes("connection");

      toast({
        title: isNetworkError ? "Connection Error" : "Failed to create table",
        description: isNetworkError
          ? "Unable to connect to the database. Please check your network connection and try again."
          : errorMessage,
        variant: "destructive",
      });
    },
  });

  // Update table mutation (syncs with customTables schema and alters SQL table)
  const updateTableMutation = useMutation({
    mutationFn: async (data: { id: string; syncToDatabase?: boolean } & typeof formData) => {
      // Filter out empty columns and clean up data
      const validColumns = data.columns.filter(col => col.name.trim() !== "");
      const res = await apiRequest("PATCH", `/api/custom-tables/${data.id}`, {
        description: data.description,
        category: data.category,
        columns: validColumns,
        syncToDatabase: data.syncToDatabase !== false, // Default to true
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-tables"] });
      const sqlAltered = data?.sqlTableAltered;
      toast({
        title: "Table updated",
        description: sqlAltered
          ? "Custom table and SQL table have been updated successfully."
          : "Custom table metadata has been updated.",
      });
      setEditDialogOpen(false);
      setSelectedTable(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update table",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    },
  });

  // Sync table mutation (syncs SQL table structure with metadata)
  const syncTableMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/custom-tables/${id}/sync`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-tables"] });
      toast({
        title: `Table ${data?.action === "created" ? "created" : "synced"}`,
        description: `SQL table "${data?.tableName}" has been ${data?.action}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to sync table",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    },
  });

  // Delete table mutation (hard delete - drops SQL table and removes metadata)
  const deleteTableMutation = useMutation({
    mutationFn: async (id: string) => {
      // Hard delete by default (drops table + removes metadata)
      const res = await apiRequest("DELETE", `/api/custom-tables/${id}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-tables"] });
      toast({
        title: "Table deleted",
        description: data?.sqlTableDropped
          ? `Table "${data?.tableName}" and all its data have been permanently deleted.`
          : `Table "${data?.tableName}" has been deleted.`,
      });
      setDeleteDialogOpen(false);
      setSelectedTable(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete table",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    },
  });

  // Restore table mutation (restore archived table and recreate SQL table)
  const restoreTableMutation = useMutation({
    mutationFn: async (id: string) => {
      // Use dedicated restore endpoint that works for system/module tables
      const res = await apiRequest("POST", `/api/custom-tables/${id}/restore`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-tables"] });
      toast({
        title: "Table restored",
        description: data?.message || `Table "${data?.tableName}" has been restored.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to restore table",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    },
  });

  // Archive table mutation (soft delete - drop SQL but keep metadata for restore)
  const archiveTableMutation = useMutation({
    mutationFn: async (id: string) => {
      // Use soft delete endpoint - drops SQL table but keeps metadata
      const res = await apiRequest("DELETE", `/api/custom-tables/${id}?softDelete=true`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-tables"] });
      toast({
        title: "Table archived",
        description: data?.message || `Table "${data?.tableName}" has been archived. You can restore it later from the archived tables view.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to archive table",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      tableName: "",
      description: "",
      category: "custom",
      columns: [{ ...DEFAULT_ID_COLUMN }], // Always include ID column
    });
    setExpandedColumns(new Set());
  };

  const handleCreateTable = () => {
    createTableMutation.mutate(formData);
  };

  const handleUpdateTable = () => {
    if (selectedTable) {
      updateTableMutation.mutate({
        id: selectedTable.id,
        ...formData,
      });
    }
  };

  const handleDeleteTable = () => {
    if (selectedTable) {
      deleteTableMutation.mutate(selectedTable.id);
    }
  };

  const openEditDialog = (table: CustomTable) => {
    setSelectedTable(table);
    // Ensure ID column is present (add if missing from existing table)
    const existingColumns = table.columns || [];
    const hasIdColumn = existingColumns.some(col => col.name === "id" && col.primaryKey);
    const columns = hasIdColumn
      ? existingColumns
      : [{ ...DEFAULT_ID_COLUMN }, ...existingColumns];

    setFormData({
      tableName: table.tableName,
      description: table.description || "",
      category: table.category || "custom",
      columns,
    });
    setExpandedColumns(new Set());
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (table: CustomTable) => {
    setSelectedTable(table);
    setDeleteDialogOpen(true);
  };

  // Column management helpers
  const addColumn = () => {
    const newColumns = [...formData.columns, createEmptyColumn()];
    setFormData({ ...formData, columns: newColumns });
    // Expand the new column
    setExpandedColumns(prev => new Set(Array.from(prev).concat(newColumns.length - 1)));
  };

  const updateColumn = (index: number, updates: Partial<ColumnDefinition>) => {
    const newColumns = [...formData.columns];
    newColumns[index] = { ...newColumns[index], ...updates };
    setFormData({ ...formData, columns: newColumns });
  };

  const removeColumn = (index: number) => {
    const newColumns = formData.columns.filter((_, i) => i !== index);
    setFormData({ ...formData, columns: newColumns });
    // Update expanded indices
    setExpandedColumns(prev => {
      const newSet = new Set<number>();
      prev.forEach(i => {
        if (i < index) newSet.add(i);
        else if (i > index) newSet.add(i - 1);
      });
      return newSet;
    });
  };

  const toggleColumnExpanded = (index: number) => {
    setExpandedColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // Helper to get columns from a reference table (for foreign key selection)
  const getColumnsForTable = (tableNameOrId: string): ColumnDefinition[] => {
    if (!tableNameOrId || !tablesData?.tables) return [];

    // Find the table by tableName
    const refTable = tablesData.tables.find(t => t.tableName === tableNameOrId);
    if (!refTable || !refTable.columns) return [];

    // Return columns, always include 'id' at the beginning if not already present
    const columns = refTable.columns as ColumnDefinition[];
    const hasId = columns.some(c => c.name === 'id');
    if (!hasId) {
      return [{ name: 'id', type: 'uuid', primaryKey: true }, ...columns];
    }
    return columns;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary">
                <Database className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-xl">Tenant Dashboard</CardTitle>
                <CardDescription>
                  {tenant?.name || "Loading..."}{" "}
                  {isSandbox && (
                    <Badge variant="secondary" className="ml-2">
                      Sandbox
                    </Badge>
                  )}
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Active Modules"
          value={activeModulesCount}
          description={`${modulesData?.modules?.length || 0} total installed`}
          icon={Package}
          loading={showModulesSkeleton}
          variant="success"
          onClick={() => onSelectConfig?.("modules")}
        />
        <StatCard
          title="Connectors"
          value={activeConnectorsCount}
          description={`${connectorsData?.length || 0} configured`}
          icon={Plug}
          loading={showConnectorsSkeleton}
          variant={activeConnectorsCount > 0 ? "success" : "default"}
          onClick={() => onSelectConfig?.("connectors")}
        />
        <StatCard
          title="Agents"
          value={agentsCount}
          description="AI assistants"
          icon={Bot}
          loading={showAgentsSkeleton}
          onClick={() => onSelectConfig?.("agents")}
        />
        <StatCard
          title="Workflows"
          value={workflowsCount}
          description="Automations"
          icon={Workflow}
          loading={showWorkflowsSkeleton}
          onClick={() => onSelectConfig?.("workflows")}
        />
      </div>

      {/* Custom Tables Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Table2 className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">
                  {showArchived ? "Archived Tables" : "Customizable Tables"}
                </CardTitle>
                <CardDescription>
                  {showArchived
                    ? `${filteredTables.length} archived table${filteredTables.length !== 1 ? 's' : ''}`
                    : `${tablesData?.tables?.filter(t => t.isActive).length || 0} active tables`
                  }
                </CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setCreateDialogOpen(true);
              }}
              data-testid="button-create-table"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Table
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tables..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
                data-testid="input-search-tables"
              />
            </div>
            <Select value={categoryFilter} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-category-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                {existingCategories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Archived toggle */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-archived"
                checked={showArchived}
                onCheckedChange={(checked) => handleArchivedToggle(checked as boolean)}
                data-testid="checkbox-show-archived"
              />
              <Label htmlFor="show-archived" className="text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
                Show Archived
              </Label>
            </div>
          </div>

          {/* Tables List */}
          {showTablesSkeleton ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filteredTables.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Columns</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTables.map((table) => (
                    <TableRow key={table.id}>
                      <TableCell>
                        <p className="font-medium">{table.tableName}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {table.category || "custom"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">
                          {table.columns?.length || 0}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px]">
                        <span className="line-clamp-2">
                          {table.description || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              data-testid={`button-table-actions-${table.id}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {showArchived ? (
                              // Archived table menu - show restore option
                              <>
                                <DropdownMenuItem
                                  onClick={() => restoreTableMutation.mutate(table.id)}
                                  disabled={restoreTableMutation.isPending}
                                  data-testid={`menu-restore-${table.id}`}
                                >
                                  <RefreshCw className={`h-4 w-4 mr-2 ${restoreTableMutation.isPending ? "animate-spin" : ""}`} />
                                  Restore Table
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openDeleteDialog(table)}
                                  className="text-destructive"
                                  data-testid={`menu-delete-${table.id}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Permanently
                                </DropdownMenuItem>
                              </>
                            ) : (
                              // Active table menu - show edit, sync, archive, delete
                              <>
                                <DropdownMenuItem
                                  onClick={() => openEditDialog(table)}
                                  data-testid={`menu-edit-${table.id}`}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => syncTableMutation.mutate(table.id)}
                                  disabled={syncTableMutation.isPending}
                                  data-testid={`menu-sync-${table.id}`}
                                >
                                  <RefreshCw className={`h-4 w-4 mr-2 ${syncTableMutation.isPending ? "animate-spin" : ""}`} />
                                  Sync SQL Table
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => archiveTableMutation.mutate(table.id)}
                                  disabled={archiveTableMutation.isPending}
                                  data-testid={`menu-archive-${table.id}`}
                                >
                                  <Archive className={`h-4 w-4 mr-2 ${archiveTableMutation.isPending ? "animate-pulse" : ""}`} />
                                  Archive
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openDeleteDialog(table)}
                                  className="text-destructive"
                                  data-testid={`menu-delete-${table.id}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Showing</span>
                  <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                    <SelectTrigger className="w-[70px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={size.toString()}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span>of {filteredTables.length} tables</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      title="First page"
                      data-testid="pagination-first"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      title="Previous page"
                      data-testid="pagination-prev"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || totalPages === 0}
                      title="Next page"
                      data-testid="pagination-next"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages || totalPages === 0}
                      title="Last page"
                      data-testid="pagination-last"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Table2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">
                {showArchived ? "No archived tables" : "No tables found"}
              </p>
              <p className="text-sm mt-1">
                {showArchived
                  ? "No tables have been archived yet"
                  : searchQuery || categoryFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Create your first custom table to get started"}
              </p>
              {!showArchived && !searchQuery && categoryFilter === "all" && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    resetForm();
                    setCreateDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Table
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Table Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open);
        if (!open) {
          // Reset mutation state when dialog closes
          createTableMutation.reset();
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Create New Table</DialogTitle>
            <DialogDescription>
              Add a new custom data table to your tenant.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-2" style={{ maxHeight: "calc(90vh - 180px)" }}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="tableName">Table Name</Label>
                <Input
                  id="tableName"
                  placeholder="e.g., customer_orders"
                  value={formData.tableName}
                  onChange={(e) => setFormData({ ...formData, tableName: e.target.value })}
                  data-testid="input-table-name"
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase, start with a letter, use underscores (e.g., my_custom_table).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={categoryPopoverOpen}
                      className="w-full justify-between font-normal"
                      data-testid="select-table-category"
                    >
                      {formData.category
                        ? DEFAULT_CATEGORIES.find((cat) => cat.value === formData.category)?.label || formData.category
                        : "Select or type category..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search or add category..."
                        value={categoryInputValue}
                        onValueChange={setCategoryInputValue}
                      />
                      <CommandList className="max-h-[200px] overflow-y-auto">
                        <CommandEmpty>
                          {categoryInputValue.trim() ? (
                            <Button
                              variant="ghost"
                              className="w-full justify-start"
                              onClick={() => {
                                setFormData({ ...formData, category: categoryInputValue.trim().toLowerCase().replace(/\s+/g, '-') });
                                setCategoryInputValue("");
                                setCategoryPopoverOpen(false);
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add "{categoryInputValue.trim()}"
                            </Button>
                          ) : (
                            "No category found."
                          )}
                        </CommandEmpty>
                        <CommandGroup heading="Default Categories">
                          {DEFAULT_CATEGORIES.map((cat) => (
                            <CommandItem
                              key={cat.value}
                              value={cat.value}
                              onSelect={(currentValue) => {
                                setFormData({ ...formData, category: currentValue });
                                setCategoryInputValue("");
                                setCategoryPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${formData.category === cat.value ? "opacity-100" : "opacity-0"
                                  }`}
                              />
                              {cat.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        {categoryInputValue.trim() && !DEFAULT_CATEGORIES.some(c =>
                          c.value === categoryInputValue.trim().toLowerCase().replace(/\s+/g, '-') ||
                          c.label.toLowerCase() === categoryInputValue.trim().toLowerCase()
                        ) && (
                            <>
                              <CommandSeparator />
                              <CommandGroup heading="Create New">
                                <CommandItem
                                  value={`create-${categoryInputValue}`}
                                  onSelect={() => {
                                    setFormData({ ...formData, category: categoryInputValue.trim().toLowerCase().replace(/\s+/g, '-') });
                                    setCategoryInputValue("");
                                    setCategoryPopoverOpen(false);
                                  }}
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  Add "{categoryInputValue.trim()}"
                                </CommandItem>
                              </CommandGroup>
                            </>
                          )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  Select from list or type to add a custom category.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what this table is for..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  data-testid="input-table-description"
                />
              </div>

              {/* Columns Editor */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Columns</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addColumn}
                    data-testid="button-add-column"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Column
                  </Button>
                </div>

                <div className="space-y-2">
                  {formData.columns.map((column, index) => {
                    const isDefaultId = isIdColumn(column);
                    return (
                      <Collapsible
                        key={index}
                        open={expandedColumns.has(index)}
                        onOpenChange={() => !isDefaultId && toggleColumnExpanded(index)}
                      >
                        <div className={`border rounded-lg ${isDefaultId ? "bg-muted/30" : ""}`}>
                          {isDefaultId ? (
                            // Non-editable ID column display
                            <div className="flex items-center justify-between p-3">
                              <div className="flex items-center gap-2">
                                <Key className="h-4 w-4 text-primary" />
                                <span className="font-medium">id</span>
                                <Badge variant="outline" className="text-xs">UUID</Badge>
                                <Badge variant="secondary" className="text-xs">
                                  <Key className="h-3 w-3 mr-1" />
                                  Primary Key
                                </Badge>
                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                  Auto-generated
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground">Required</span>
                            </div>
                          ) : (
                            <>
                              <CollapsibleTrigger asChild>
                                <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50">
                                  <div className="flex items-center gap-2">
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">
                                      {column.name || `Column ${index + 1}`}
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                      {COLUMN_TYPES.find(t => t.value === column.type)?.label || column.type}
                                      {column.isArray && "[]"}
                                    </Badge>
                                    {column.primaryKey && (
                                      <Badge variant="secondary" className="text-xs">
                                        <Key className="h-3 w-3 mr-1" />
                                        PK
                                      </Badge>
                                    )}
                                    {column.unique && !column.primaryKey && (
                                      <Badge variant="outline" className="text-xs text-blue-600">
                                        UQ
                                      </Badge>
                                    )}
                                    {column.foreignKey && (
                                      <Badge variant="secondary" className="text-xs">
                                        <Link2 className="h-3 w-3 mr-1" />
                                        FK
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeColumn(index);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                    {expandedColumns.has(index) ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="p-3 pt-0 space-y-3 border-t">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <Label className="text-xs">Column Name</Label>
                                      <Input
                                        placeholder="e.g., customer_name"
                                        value={column.name}
                                        onChange={(e) => updateColumn(index, { name: e.target.value })}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs">Type</Label>
                                      <Select
                                        value={column.type}
                                        onValueChange={(value) => updateColumn(index, { type: value })}
                                      >
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {COLUMN_TYPES.map((type) => (
                                            <SelectItem key={type.value} value={type.value}>
                                              {type.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Default Value (Optional)</Label>
                                    <Input
                                      placeholder="e.g., 0, '', true"
                                      value={column.default || ""}
                                      onChange={(e) => updateColumn(index, { default: e.target.value || undefined })}
                                    />
                                  </div>
                                  {/* Column Constraints */}
                                  <div className="flex flex-wrap items-center gap-4 pt-2">
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`nullable-${index}`}
                                        checked={column.nullable !== false}
                                        onCheckedChange={(checked) => updateColumn(index, { nullable: checked as boolean })}
                                      />
                                      <Label htmlFor={`nullable-${index}`} className="text-xs">Nullable</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`unique-${index}`}
                                        checked={column.unique || false}
                                        onCheckedChange={(checked) => updateColumn(index, { unique: checked as boolean })}
                                      />
                                      <Label htmlFor={`unique-${index}`} className="text-xs">Unique</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`array-${index}`}
                                        checked={column.isArray || false}
                                        onCheckedChange={(checked) => updateColumn(index, { isArray: checked as boolean })}
                                      />
                                      <Label htmlFor={`array-${index}`} className="text-xs">Array</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`pk-${index}`}
                                        checked={column.primaryKey || false}
                                        onCheckedChange={(checked) => updateColumn(index, { primaryKey: checked as boolean })}
                                      />
                                      <Label htmlFor={`pk-${index}`} className="text-xs">Primary Key</Label>
                                    </div>
                                  </div>
                                  {/* Foreign Key Section */}
                                  <Collapsible>
                                    <CollapsibleTrigger asChild>
                                      <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
                                        <Link2 className="h-3 w-3 mr-2" />
                                        {column.foreignKey ? "Edit Foreign Key" : "Add Foreign Key (Optional)"}
                                      </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="grid grid-cols-3 gap-2 mt-2">
                                        <div className="space-y-1">
                                          <Label className="text-xs">Reference Table</Label>
                                          <Select
                                            value={column.foreignKey?.table || ""}
                                            onValueChange={(value) => updateColumn(index, {
                                              foreignKey: value ? {
                                                table: value,
                                                column: "id", // Default to id when table changes
                                              } : undefined
                                            })}
                                          >
                                            <SelectTrigger>
                                              <SelectValue placeholder="Select table..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {tablesData?.tables?.filter(t => t.tableName !== formData.tableName).length ? (
                                                tablesData.tables.filter(t => t.tableName !== formData.tableName).map((t) => (
                                                  <SelectItem key={t.id} value={t.tableName}>
                                                    {t.tableName}
                                                  </SelectItem>
                                                ))
                                              ) : (
                                                <div className="py-2 px-2 text-sm text-muted-foreground">
                                                  No tables available
                                                </div>
                                              )}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">Reference Column</Label>
                                          <Select
                                            value={column.foreignKey?.column || ""}
                                            onValueChange={(value) => updateColumn(index, {
                                              foreignKey: column.foreignKey ? {
                                                ...column.foreignKey,
                                                column: value,
                                              } : undefined
                                            })}
                                            disabled={!column.foreignKey?.table}
                                          >
                                            <SelectTrigger>
                                              <SelectValue placeholder="Select column..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {getColumnsForTable(column.foreignKey?.table || "").length ? (
                                                getColumnsForTable(column.foreignKey?.table || "").map((col) => (
                                                  <SelectItem key={col.name} value={col.name}>
                                                    {col.name} ({col.type}{col.isArray ? "[]" : ""})
                                                  </SelectItem>
                                                ))
                                              ) : (
                                                <div className="py-2 px-2 text-sm text-muted-foreground">
                                                  Select a table first
                                                </div>
                                              )}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">On Delete</Label>
                                          <Select
                                            value={column.foreignKey?.onDelete || ""}
                                            onValueChange={(value) => updateColumn(index, {
                                              foreignKey: column.foreignKey ? {
                                                ...column.foreignKey,
                                                onDelete: value || undefined,
                                              } : undefined
                                            })}
                                            disabled={!column.foreignKey?.table}
                                          >
                                            <SelectTrigger>
                                              <SelectValue placeholder="Select..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="CASCADE">CASCADE</SelectItem>
                                              <SelectItem value="SET NULL">SET NULL</SelectItem>
                                              <SelectItem value="RESTRICT">RESTRICT</SelectItem>
                                              <SelectItem value="NO ACTION">NO ACTION</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </div>
                                    </CollapsibleContent>
                                  </Collapsible>
                                </div>
                              </CollapsibleContent>
                            </>
                          )}
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTable}
              disabled={!formData.tableName || createTableMutation.isPending}
              data-testid="button-confirm-create-table"
            >
              {createTableMutation.isPending ? "Creating..." : "Create Table"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Table Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          // Reset mutation state when dialog closes
          updateTableMutation.reset();
          setSelectedTable(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Edit Table</DialogTitle>
            <DialogDescription>
              Update the table details and columns.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-2" style={{ maxHeight: "calc(90vh - 180px)" }}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-tableName">Table Name</Label>
                <Input
                  id="edit-tableName"
                  value={formData.tableName}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Table name cannot be changed after creation.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <Popover open={editCategoryPopoverOpen} onOpenChange={setEditCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={editCategoryPopoverOpen}
                      className="w-full justify-between font-normal"
                      data-testid="select-edit-table-category"
                    >
                      {formData.category
                        ? DEFAULT_CATEGORIES.find((cat) => cat.value === formData.category)?.label || formData.category
                        : "Select or type category..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search or add category..."
                        value={editCategoryInputValue}
                        onValueChange={setEditCategoryInputValue}
                      />
                      <CommandList className="max-h-[200px] overflow-y-auto">
                        <CommandEmpty>
                          {editCategoryInputValue.trim() ? (
                            <Button
                              variant="ghost"
                              className="w-full justify-start"
                              onClick={() => {
                                setFormData({ ...formData, category: editCategoryInputValue.trim().toLowerCase().replace(/\s+/g, '-') });
                                setEditCategoryInputValue("");
                                setEditCategoryPopoverOpen(false);
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add "{editCategoryInputValue.trim()}"
                            </Button>
                          ) : (
                            "No category found."
                          )}
                        </CommandEmpty>
                        <CommandGroup heading="Default Categories">
                          {DEFAULT_CATEGORIES.map((cat) => (
                            <CommandItem
                              key={cat.value}
                              value={cat.value}
                              onSelect={(currentValue) => {
                                setFormData({ ...formData, category: currentValue });
                                setEditCategoryInputValue("");
                                setEditCategoryPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${formData.category === cat.value ? "opacity-100" : "opacity-0"
                                  }`}
                              />
                              {cat.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        {editCategoryInputValue.trim() && !DEFAULT_CATEGORIES.some(c =>
                          c.value === editCategoryInputValue.trim().toLowerCase().replace(/\s+/g, '-') ||
                          c.label.toLowerCase() === editCategoryInputValue.trim().toLowerCase()
                        ) && (
                            <>
                              <CommandSeparator />
                              <CommandGroup heading="Create New">
                                <CommandItem
                                  value={`create-${editCategoryInputValue}`}
                                  onSelect={() => {
                                    setFormData({ ...formData, category: editCategoryInputValue.trim().toLowerCase().replace(/\s+/g, '-') });
                                    setEditCategoryInputValue("");
                                    setEditCategoryPopoverOpen(false);
                                  }}
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  Add "{editCategoryInputValue.trim()}"
                                </CommandItem>
                              </CommandGroup>
                            </>
                          )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  Select from list or type to add a custom category.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description (Optional)</Label>
                <Textarea
                  id="edit-description"
                  placeholder="Describe what this table is for..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  data-testid="input-edit-table-description"
                />
              </div>

              {/* Columns Editor for Edit */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Columns</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addColumn}
                    data-testid="button-edit-add-column"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Column
                  </Button>
                </div>

                <div className="space-y-2">
                  {formData.columns.map((column, index) => {
                    const isDefaultId = isIdColumn(column);
                    return (
                      <Collapsible
                        key={index}
                        open={expandedColumns.has(index)}
                        onOpenChange={() => !isDefaultId && toggleColumnExpanded(index)}
                      >
                        <div className={`border rounded-lg ${isDefaultId ? "bg-muted/30" : ""}`}>
                          {isDefaultId ? (
                            // Non-editable ID column display
                            <div className="flex items-center justify-between p-3">
                              <div className="flex items-center gap-2">
                                <Key className="h-4 w-4 text-primary" />
                                <span className="font-medium">id</span>
                                <Badge variant="outline" className="text-xs">UUID</Badge>
                                <Badge variant="secondary" className="text-xs">
                                  <Key className="h-3 w-3 mr-1" />
                                  Primary Key
                                </Badge>
                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                  Auto-generated
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground">Required</span>
                            </div>
                          ) : (
                            <>
                              <CollapsibleTrigger asChild>
                                <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50">
                                  <div className="flex items-center gap-2">
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">
                                      {column.name || `Column ${index + 1}`}
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                      {COLUMN_TYPES.find(t => t.value === column.type)?.label || column.type}
                                      {column.isArray && "[]"}
                                    </Badge>
                                    {column.primaryKey && (
                                      <Badge variant="secondary" className="text-xs">
                                        <Key className="h-3 w-3 mr-1" />
                                        PK
                                      </Badge>
                                    )}
                                    {column.unique && !column.primaryKey && (
                                      <Badge variant="outline" className="text-xs text-blue-600">
                                        UQ
                                      </Badge>
                                    )}
                                    {column.foreignKey && (
                                      <Badge variant="secondary" className="text-xs">
                                        <Link2 className="h-3 w-3 mr-1" />
                                        FK
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeColumn(index);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                    {expandedColumns.has(index) ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="p-3 pt-0 space-y-3 border-t">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <Label className="text-xs">Column Name</Label>
                                      <Input
                                        placeholder="e.g., customer_name"
                                        value={column.name}
                                        onChange={(e) => updateColumn(index, { name: e.target.value })}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs">Type</Label>
                                      <Select
                                        value={column.type}
                                        onValueChange={(value) => updateColumn(index, { type: value })}
                                      >
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {COLUMN_TYPES.map((type) => (
                                            <SelectItem key={type.value} value={type.value}>
                                              {type.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Default Value (Optional)</Label>
                                    <Input
                                      placeholder="e.g., 0, '', true"
                                      value={column.default || ""}
                                      onChange={(e) => updateColumn(index, { default: e.target.value || undefined })}
                                    />
                                  </div>
                                  {/* Column Constraints */}
                                  <div className="flex flex-wrap items-center gap-4 pt-2">
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`edit-nullable-${index}`}
                                        checked={column.nullable !== false}
                                        onCheckedChange={(checked) => updateColumn(index, { nullable: checked as boolean })}
                                      />
                                      <Label htmlFor={`edit-nullable-${index}`} className="text-xs">Nullable</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`edit-unique-${index}`}
                                        checked={column.unique || false}
                                        onCheckedChange={(checked) => updateColumn(index, { unique: checked as boolean })}
                                      />
                                      <Label htmlFor={`edit-unique-${index}`} className="text-xs">Unique</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`edit-array-${index}`}
                                        checked={column.isArray || false}
                                        onCheckedChange={(checked) => updateColumn(index, { isArray: checked as boolean })}
                                      />
                                      <Label htmlFor={`edit-array-${index}`} className="text-xs">Array</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`edit-pk-${index}`}
                                        checked={column.primaryKey || false}
                                        onCheckedChange={(checked) => updateColumn(index, { primaryKey: checked as boolean })}
                                      />
                                      <Label htmlFor={`edit-pk-${index}`} className="text-xs">Primary Key</Label>
                                    </div>
                                  </div>
                                  {/* Foreign Key Section */}
                                  <Collapsible>
                                    <CollapsibleTrigger asChild>
                                      <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
                                        <Link2 className="h-3 w-3 mr-2" />
                                        {column.foreignKey ? "Edit Foreign Key" : "Add Foreign Key (Optional)"}
                                      </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="grid grid-cols-3 gap-2 mt-2">
                                        <div className="space-y-1">
                                          <Label className="text-xs">Reference Table</Label>
                                          <Select
                                            value={column.foreignKey?.table || ""}
                                            onValueChange={(value) => updateColumn(index, {
                                              foreignKey: value ? {
                                                table: value,
                                                column: "id", // Default to id when table changes
                                              } : undefined
                                            })}
                                          >
                                            <SelectTrigger>
                                              <SelectValue placeholder="Select table..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {tablesData?.tables?.filter(t => t.tableName !== formData.tableName).length ? (
                                                tablesData.tables.filter(t => t.tableName !== formData.tableName).map((t) => (
                                                  <SelectItem key={t.id} value={t.tableName}>
                                                    {t.tableName}
                                                  </SelectItem>
                                                ))
                                              ) : (
                                                <div className="py-2 px-2 text-sm text-muted-foreground">
                                                  No tables available
                                                </div>
                                              )}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">Reference Column</Label>
                                          <Select
                                            value={column.foreignKey?.column || ""}
                                            onValueChange={(value) => updateColumn(index, {
                                              foreignKey: column.foreignKey ? {
                                                ...column.foreignKey,
                                                column: value,
                                              } : undefined
                                            })}
                                            disabled={!column.foreignKey?.table}
                                          >
                                            <SelectTrigger>
                                              <SelectValue placeholder="Select column..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {getColumnsForTable(column.foreignKey?.table || "").length ? (
                                                getColumnsForTable(column.foreignKey?.table || "").map((col) => (
                                                  <SelectItem key={col.name} value={col.name}>
                                                    {col.name} ({col.type}{col.isArray ? "[]" : ""})
                                                  </SelectItem>
                                                ))
                                              ) : (
                                                <div className="py-2 px-2 text-sm text-muted-foreground">
                                                  Select a table first
                                                </div>
                                              )}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">On Delete</Label>
                                          <Select
                                            value={column.foreignKey?.onDelete || ""}
                                            onValueChange={(value) => updateColumn(index, {
                                              foreignKey: column.foreignKey ? {
                                                ...column.foreignKey,
                                                onDelete: value || undefined,
                                              } : undefined
                                            })}
                                            disabled={!column.foreignKey?.table}
                                          >
                                            <SelectTrigger>
                                              <SelectValue placeholder="Select..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="CASCADE">CASCADE</SelectItem>
                                              <SelectItem value="SET NULL">SET NULL</SelectItem>
                                              <SelectItem value="RESTRICT">RESTRICT</SelectItem>
                                              <SelectItem value="NO ACTION">NO ACTION</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </div>
                                    </CollapsibleContent>
                                  </Collapsible>
                                </div>
                              </CollapsibleContent>
                            </>
                          )}
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateTable}
              disabled={updateTableMutation.isPending}
              data-testid="button-confirm-edit-table"
            >
              {updateTableMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        // Only allow closing if not currently deleting
        if (!deleteTableMutation.isPending) {
          setDeleteDialogOpen(open);
          if (!open) {
            deleteTableMutation.reset();
            setSelectedTable(null);
          }
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Table?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedTable?.tableName}"?
              This action cannot be undone and will permanently remove all data in this table.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteTableMutation.isPending}
              onClick={() => setSelectedTable(null)}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteTable}
              disabled={deleteTableMutation.isPending}
              data-testid="button-confirm-delete-table"
            >
              {deleteTableMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
