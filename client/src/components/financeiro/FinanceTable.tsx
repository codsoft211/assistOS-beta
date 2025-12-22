import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "./StatusBadge";
import { formatCurrency, formatDate } from "@/lib/finance-utils";
import { Eye, Edit, Trash2, MoreVertical, FileText } from "lucide-react";

export interface ColumnDef<T> {
  field: keyof T | string;
  header: string;
  format?: 'currency' | 'date' | 'badge' | 'text' | 'number';
  align?: 'left' | 'right' | 'center';
  badgeType?: 'invoice' | 'bill' | 'payment' | 'approval' | 'generic';
  render?: (value: any, row: T) => React.ReactNode;
}

export interface Action<T> {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: (entity: T) => void;
  variant?: 'default' | 'destructive' | 'outline';
  show?: (entity: T) => boolean;
}

interface FinanceTableProps<T> {
  data: T[] | undefined;
  columns: ColumnDef<T>[];
  isLoading: boolean;
  error: Error | null;
  emptyMessage?: string;
  emptyDescription?: string;
  actions?: {
    canView?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    onView?: (entity: T) => void;
    editPath?: (id: string) => string;
    onDelete?: (id: string, name: string) => void;
    customActions?: Action<T>[];
  };
  getEntityId: (entity: T) => string;
  getEntityName: (entity: T) => string;
}

function getCellValue<T>(row: T, field: keyof T | string): any {
  if (typeof field === 'string' && field.includes('.')) {
    const parts = field.split('.');
    let value: any = row;
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  }
  return row[field as keyof T];
}

export default function FinanceTable<T extends Record<string, any>>({
  data,
  columns,
  isLoading,
  error,
  emptyMessage = "Nenhum registro encontrado",
  emptyDescription = "Não há dados para exibir.",
  actions,
  getEntityId,
  getEntityName,
}: FinanceTableProps<T>) {
  const renderCellValue = (column: ColumnDef<T>, row: T) => {
    const value = getCellValue(row, column.field);

    if (column.render) {
      return column.render(value, row);
    }

    switch (column.format) {
      case 'currency':
        return formatCurrency(value || 0);
      case 'date':
        return value ? formatDate(value) : '-';
      case 'badge':
        return <StatusBadge status={value} type={column.badgeType} />;
      case 'number':
        return value?.toLocaleString('pt-PT') || '0';
      case 'text':
      default:
        return value || '-';
    }
  };

  const hasActions = actions && (
    actions.canView ||
    actions.canEdit ||
    actions.canDelete ||
    (actions.customActions && actions.customActions.length > 0)
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-4" data-testid="loading-skeleton">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-12 text-center" data-testid="error-state">
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">
          Erro ao carregar dados. Por favor, tente novamente.
        </p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-12 text-center" data-testid="empty-state">
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">{emptyMessage}</p>
        <p className="text-sm text-muted-foreground mt-2">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table data-testid="table-finance-entity">
        <TableHeader>
          <TableRow>
            {columns.map((column, index) => (
              <TableHead
                key={index}
                className={column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}
              >
                {column.header}
              </TableHead>
            ))}
            {hasActions && <TableHead className="w-[50px]"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => {
            const entityId = getEntityId(row);
            const entityName = getEntityName(row);

            return (
              <TableRow key={entityId} data-testid={`row-entity-${entityId}`}>
                {columns.map((column, colIndex) => (
                  <TableCell
                    key={colIndex}
                    className={column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}
                    data-testid={`cell-${column.field as string}-${entityId}`}
                  >
                    {renderCellValue(column, row)}
                  </TableCell>
                ))}
                {hasActions && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`button-actions-${entityId}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {actions.canView && actions.onView && (
                          <DropdownMenuItem onClick={() => actions.onView!(row)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalhes
                          </DropdownMenuItem>
                        )}
                        {actions.canEdit && actions.editPath && (
                          <DropdownMenuItem asChild>
                            <Link href={actions.editPath(entityId)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {actions.customActions?.map((action, idx) => {
                          const Icon = action.icon;
                          const shouldShow = !action.show || action.show(row);
                          
                          if (!shouldShow) return null;
                          
                          return (
                            <DropdownMenuItem
                              key={idx}
                              onClick={() => action.onClick(row)}
                            >
                              <Icon className="h-4 w-4 mr-2" />
                              {action.label}
                            </DropdownMenuItem>
                          );
                        })}
                        {(actions.canDelete || (actions.customActions && actions.customActions.length > 0)) && (
                          <DropdownMenuSeparator />
                        )}
                        {actions.canDelete && actions.onDelete && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => actions.onDelete!(entityId, entityName)}
                            data-testid={`button-delete-${entityId}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Apagar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
