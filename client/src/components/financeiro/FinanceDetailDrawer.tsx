import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "./StatusBadge";
import DocumentPanel from "./DocumentPanel";
import { formatCurrency, formatDate } from "@/lib/finance-utils";

export interface DetailField {
  label: string;
  field: string;
  format?: 'currency' | 'date' | 'badge' | 'text' | 'number';
  badgeType?: 'invoice' | 'bill' | 'payment' | 'approval' | 'generic';
  render?: (value: any, entity: any) => React.ReactNode;
}

export interface DetailTab {
  id: string;
  label: string;
  content: (entity: any) => React.ReactNode;
}

interface FinanceDetailDrawerProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: T | null;
  isLoading?: boolean;
  title: string;
  description?: string;
  fields: DetailField[];
  tabs?: DetailTab[];
  enableDocuments?: boolean;
  entityType?: string;
  getEntityId: (entity: T) => string;
}

function getFieldValue(entity: any, field: string): any {
  if (field.includes('.')) {
    const parts = field.split('.');
    let value = entity;
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  }
  return entity?.[field];
}

export default function FinanceDetailDrawer<T extends Record<string, any>>({
  open,
  onOpenChange,
  entity,
  isLoading = false,
  title,
  description,
  fields,
  tabs = [],
  enableDocuments = true,
  entityType = 'generic',
  getEntityId,
}: FinanceDetailDrawerProps<T>) {
  const renderFieldValue = (field: DetailField, entity: any) => {
    const value = getFieldValue(entity, field.field);

    if (field.render) {
      return field.render(value, entity);
    }

    switch (field.format) {
      case 'currency':
        return formatCurrency(value || 0);
      case 'date':
        return value ? formatDate(value) : '-';
      case 'badge':
        return <StatusBadge status={value} type={field.badgeType} />;
      case 'number':
        return value?.toLocaleString('pt-PT') || '0';
      case 'text':
      default:
        return value || '-';
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-testid="drawer-entity-details">
        <SheetHeader>
          <SheetTitle data-testid="text-drawer-title">{title}</SheetTitle>
          {description && (
            <SheetDescription data-testid="text-drawer-description">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="mt-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : !entity ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhum detalhe disponível</p>
            </div>
          ) : (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${1 + (enableDocuments ? 1 : 0) + tabs.length}, 1fr)` }}>
                <TabsTrigger value="details" data-testid="tab-details">Detalhes</TabsTrigger>
                {enableDocuments && (
                  <TabsTrigger value="documents" data-testid="tab-documents">Documentos</TabsTrigger>
                )}
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} data-testid={`tab-${tab.id}`}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="details" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Informações</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {fields.map((field, index) => (
                      <div key={index} className="grid grid-cols-3 gap-4" data-testid={`field-${field.field}`}>
                        <div className="text-sm font-medium text-muted-foreground">
                          {field.label}
                        </div>
                        <div className="col-span-2 text-sm">
                          {renderFieldValue(field, entity)}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              {enableDocuments && (
                <TabsContent value="documents" className="mt-4">
                  <DocumentPanel
                    entityId={getEntityId(entity)}
                    entityType={entityType}
                  />
                </TabsContent>
              )}

              {tabs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id} className="mt-4">
                  {tab.content(entity)}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
