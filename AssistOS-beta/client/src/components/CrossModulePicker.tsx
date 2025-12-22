import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface CrossModulePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetModule: string;
  targetEntity: string;
  onSelect: (recordId: string, recordData: any) => void;
  cardinality?: 'one' | 'many';
  selectedIds?: string[];
}

export default function CrossModulePicker({
  open,
  onOpenChange,
  targetModule,
  targetEntity,
  onSelect,
  cardinality = 'one',
  selectedIds = [],
}: CrossModulePickerProps) {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: [`/api/modules/${targetModule}/linkable-records`, targetEntity, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('entity', targetEntity);
      if (search) params.set('search', search);
      const url = `/api/modules/${targetModule}/linkable-records?${params}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch linkable records');
      return response.json();
    },
    enabled: open && !!targetModule && !!targetEntity,
  });

  const records = data?.records || [];

  const handleSelect = (record: any) => {
    onSelect(record.id, record);
    if (cardinality === 'one') {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="cross-module-picker">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Selecionar {targetEntity} de {targetModule}
          </DialogTitle>
          <DialogDescription>
            Escolha registros para linkar ao projeto
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Pesquisar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="cross-module-search"
          />

          <div className="max-h-96 overflow-y-auto space-y-2">
            {isLoading ? (
              <>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </>
            ) : records.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  Nenhum registro encontrado
                </CardContent>
              </Card>
            ) : (
              records.map((record: any) => {
                const isSelected = selectedIds.includes(record.id);
                return (
                  <Card
                    key={record.id}
                    className={cn(
                      "cursor-pointer hover-elevate",
                      isSelected && "border-primary"
                    )}
                    onClick={() => handleSelect(record)}
                    data-testid={`cross-module-record-${record.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isSelected && <Check className="h-4 w-4 text-primary" />}
                            <h4 className="font-medium truncate">{record.name || record.title || record.code}</h4>
                          </div>
                          {record.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {record.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {record.status && (
                              <Badge variant="secondary" className="text-xs">
                                {record.status}
                              </Badge>
                            )}
                            {record.code && (
                              <Badge variant="outline" className="text-xs">
                                {record.code}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
