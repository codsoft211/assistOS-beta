import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useFinanceEntity } from "@/hooks/useFinanceEntity";
import { useEntityMutations } from "@/hooks/useEntityMutations";
import EntityFilters, { StatusOption } from "./EntityFilters";
import FinanceTable, { ColumnDef, Action } from "./FinanceTable";
import FinanceDetailDrawer, { DetailField, DetailTab } from "./FinanceDetailDrawer";

export interface FinanceEntityPageProps<T> {
  // Entity configuration
  entityType: 'invoices' | 'bills' | 'creditNotes' | 'approvals' | 'paymentPlans' | 'generic';
  entityNameSingular: string;
  entityNamePlural: string;

  // API configuration
  apiEndpoint: string;
  queryKey: string[];

  // Column configuration
  columns: ColumnDef<T>[];

  // Filter configuration
  statusOptions: StatusOption[];
  searchPlaceholder?: string;
  customFilters?: React.ReactNode;

  // Action configuration
  actions?: {
    canCreate?: boolean;
    canView?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    customActions?: Action<T>[];
  };

  // Detail drawer configuration
  detailConfig?: {
    fields: DetailField[];
    tabs?: DetailTab[];
    enableDocuments?: boolean;
  };

  // Navigation
  createPath?: string;
  viewPath?: (id: string) => string;
  editPath?: (id: string) => string;

  // Entity accessors
  getEntityId: (entity: T) => string;
  getEntityName: (entity: T) => string;

  // Page customization
  pageTitle?: string;
  pageDescription?: string;
  emptyMessage?: string;
  emptyDescription?: string;
}

export default function FinanceEntityPage<T extends Record<string, any>>({
  entityType,
  entityNameSingular,
  entityNamePlural,
  apiEndpoint,
  queryKey,
  columns,
  statusOptions,
  searchPlaceholder = "Pesquisar...",
  customFilters,
  actions = {
    canCreate: true,
    canView: true,
    canEdit: true,
    canDelete: true,
  },
  detailConfig,
  createPath,
  viewPath,
  editPath,
  getEntityId,
  getEntityName,
  pageTitle,
  pageDescription,
  emptyMessage,
  emptyDescription,
}: FinanceEntityPageProps<T>) {
  const [selectedEntity, setSelectedEntity] = useState<T | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Use hooks for data fetching and mutations
  const {
    data,
    isLoading,
    error,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
  } = useFinanceEntity<T>({
    apiEndpoint,
    queryKey,
  });

  const { handleDelete } = useEntityMutations<T>({
    apiEndpoint,
    queryKey,
    entityNameSingular,
    entityNamePlural,
  });

  // Handle view action
  const handleView = (entity: T) => {
    setSelectedEntity(entity);
    setIsDrawerOpen(true);
  };

  // Determine empty state messages
  const finalEmptyMessage = emptyMessage || `Nenhum ${entityNameSingular.toLowerCase()} encontrado`;
  const finalEmptyDescription = emptyDescription || (
    searchQuery || statusFilter !== 'all'
      ? 'Tente ajustar os filtros de pesquisa.'
      : `Comece criando um novo ${entityNameSingular.toLowerCase()}.`
  );

  return (
    <div className="p-6 space-y-6" data-testid="page-finance-entity-list">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            {pageTitle || entityNamePlural}
          </h1>
          {pageDescription && (
            <p className="text-muted-foreground" data-testid="text-page-description">
              {pageDescription}
            </p>
          )}
        </div>
        {actions.canCreate && createPath && (
          <Button asChild data-testid="button-create-entity">
            <Link href={createPath}>
              <Plus className="h-4 w-4 mr-2" />
              Novo {entityNameSingular}
            </Link>
          </Button>
        )}
      </div>

      {/* Filters */}
      <EntityFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={searchPlaceholder}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={statusOptions}
        customFilters={customFilters}
      />

      {/* Table */}
      <Card data-testid="card-entity-table">
        <CardContent className="p-0">
          <FinanceTable<T>
            data={data}
            columns={columns}
            isLoading={isLoading}
            error={error}
            emptyMessage={finalEmptyMessage}
            emptyDescription={finalEmptyDescription}
            actions={{
              canView: actions.canView,
              canEdit: actions.canEdit,
              canDelete: actions.canDelete,
              onView: actions.canView ? handleView : undefined,
              editPath: actions.canEdit && editPath ? editPath : undefined,
              onDelete: actions.canDelete ? handleDelete : undefined,
              customActions: actions.customActions,
            }}
            getEntityId={getEntityId}
            getEntityName={getEntityName}
          />
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      {detailConfig && (
        <FinanceDetailDrawer<T>
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          entity={selectedEntity}
          title={selectedEntity ? getEntityName(selectedEntity) : entityNameSingular}
          description={`Detalhes do ${entityNameSingular.toLowerCase()}`}
          fields={detailConfig.fields}
          tabs={detailConfig.tabs}
          enableDocuments={detailConfig.enableDocuments}
          entityType={entityType}
          getEntityId={getEntityId}
        />
      )}
    </div>
  );
}
