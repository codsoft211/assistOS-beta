import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Link as LinkIcon, AlertCircle, Loader2, CheckCircle, Unlink } from "lucide-react";

interface CustomEntity {
  id: string;
  entityKey: string;
  displayName: string;
  displayNamePlural: string;
  description?: string;
  icon?: string;
  color?: string;
  category: string;
  environment: 'sandbox' | 'production';
  metadata?: any;
}

interface CustomField {
  name: string;
  type: string;
  required?: boolean;
}

interface LinkableEntity {
  moduleId: string;
  moduleName: string;
  entityKey: string;
  entityName: string;
  displayField: string;
  requiredPermission?: string;
}

interface FieldManagerProps {
  entities: CustomEntity[];
  onLinkCreated: () => void;
}

export default function FieldManager({ entities, onLinkCreated }: FieldManagerProps) {
  const { toast } = useToast();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<CustomEntity | null>(null);
  const [selectedField, setSelectedField] = useState<CustomField | null>(null);
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [selectedEntityKey, setSelectedEntityKey] = useState<string>('');

  // Fetch linkable entities (CRM, Financial, Compras)
  const { data: linkableData, isLoading: linkableLoading } = useQuery<{ entities: LinkableEntity[] }>({
    queryKey: ['/api/modules/projects/links/linkable-entities'],
  });

  // Fetch existing field links
  const { data: existingLinksData } = useQuery<{ links: any[] }>({
    queryKey: ['/api/modules/projects/links'],
    enabled: entities.length > 0,
  });

  const linkFieldMutation = useMutation({
    mutationFn: async (params: {
      sourceEntityId: string;
      sourceFieldName: string;
      targetModule: string;
      targetEntity: string;
      displayField: string;
    }) => {
      return await apiRequest('POST', '/api/modules/projects/links/create', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'sandbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/links'] });
      onLinkCreated();
      setLinkDialogOpen(false);
      setSelectedEntity(null);
      setSelectedField(null);
      setSelectedModule('');
      setSelectedEntityKey('');
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao criar link.",
        variant: "destructive",
      });
    },
  });

  const linkableEntities = linkableData?.entities || [];
  const existingLinks = existingLinksData?.links || [];
  
  const groupedEntities = linkableEntities.reduce((acc, entity) => {
    if (!acc[entity.moduleId]) acc[entity.moduleId] = [];
    acc[entity.moduleId].push(entity);
    return acc;
  }, {} as Record<string, LinkableEntity[]>);

  // Helper to check if field has existing link
  const getFieldLink = (entityId: string, fieldName: string) => {
    return existingLinks.find(
      link => link.sourceEntityId === entityId && link.sourceFieldName === fieldName
    );
  };

  const openLinkDialog = (entity: CustomEntity, field: CustomField) => {
    setSelectedEntity(entity);
    setSelectedField(field);
    setLinkDialogOpen(true);
  };

  const handleCreateLink = async () => {
    if (!selectedEntity || !selectedField || !selectedModule || !selectedEntityKey) {
      toast({
        title: "Campos obrigatórios",
        description: "Selecione módulo e entidade para criar o link.",
        variant: "destructive",
      });
      return;
    }

    const targetEntity = linkableEntities.find(
      e => e.moduleId === selectedModule && e.entityKey === selectedEntityKey
    );

    if (!targetEntity) return;

    await linkFieldMutation.mutateAsync({
      sourceEntityId: selectedEntity.id,
      sourceFieldName: selectedField.name,
      targetModule: selectedModule,
      targetEntity: selectedEntityKey,
      displayField: targetEntity.displayField,
    });
  };

  if (entities.length === 0) {
    return (
      <Alert data-testid="alert-no-entities">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Nenhuma entidade configurada. Aplique um template primeiro.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <div className="space-y-6" data-testid="field-manager">
        {entities.map((entity) => {
          const fields: CustomField[] = entity.metadata?.fields || [];
          
          return (
            <div key={entity.id} className="space-y-3">
              <h3 className="text-lg font-semibold" data-testid={`text-entity-${entity.entityKey}`}>
                {entity.displayName}
              </h3>
              
              {fields.length === 0 ? (
                <Alert>
                  <AlertDescription>Nenhum campo personalizado nesta entidade.</AlertDescription>
                </Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Obrigatório</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field) => {
                      const existingLink = getFieldLink(entity.id, field.name);
                      
                      return (
                        <TableRow key={field.name} data-testid={`row-field-${entity.entityKey}-${field.name}`}>
                          <TableCell className="font-medium">{field.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" data-testid={`badge-type-${field.name}`}>
                              {field.type}
                            </Badge>
                            {existingLink && (
                              <Badge variant="secondary" className="ml-2" data-testid={`badge-linked-${field.name}`}>
                                <LinkIcon className="h-3 w-3 mr-1" />
                                {existingLink.targetModule}.{existingLink.targetEntity}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {field.required ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <span className="text-muted-foreground text-sm">Opcional</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {existingLink ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled
                                data-testid={`button-linked-${entity.entityKey}-${field.name}`}
                              >
                                <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                                Linked
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openLinkDialog(entity, field)}
                                data-testid={`button-link-${entity.entityKey}-${field.name}`}
                              >
                                <LinkIcon className="h-4 w-4 mr-2" />
                                Link to Module
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          );
        })}
      </div>

      {/* Link Configuration Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent data-testid="dialog-link-field">
          <DialogHeader>
            <DialogTitle>Linkar Campo a Módulo</DialogTitle>
            <DialogDescription>
              Campo: <strong>{selectedEntity?.displayName}</strong> → <strong>{selectedField?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Módulo de Destino</Label>
              <Select value={selectedModule} onValueChange={(val) => {
                setSelectedModule(val);
                setSelectedEntityKey('');
              }}>
                <SelectTrigger data-testid="select-module">
                  <SelectValue placeholder="Selecione um módulo" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(groupedEntities).map((moduleId) => (
                    <SelectItem key={moduleId} value={moduleId} data-testid={`option-module-${moduleId}`}>
                      {groupedEntities[moduleId][0].moduleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedModule && (
              <div className="space-y-2">
                <Label>Entidade</Label>
                <Select value={selectedEntityKey} onValueChange={setSelectedEntityKey}>
                  <SelectTrigger data-testid="select-entity">
                    <SelectValue placeholder="Selecione uma entidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {(groupedEntities[selectedModule] || []).map((entity) => (
                      <SelectItem 
                        key={entity.entityKey} 
                        value={entity.entityKey}
                        data-testid={`option-entity-${entity.entityKey}`}
                      >
                        {entity.entityName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedModule && selectedEntityKey && (
              <Alert>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  O campo <strong>{selectedField?.name}</strong> será linkado a{' '}
                  <strong>{groupedEntities[selectedModule]?.find(e => e.entityKey === selectedEntityKey)?.entityName}</strong>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLinkDialogOpen(false)}
              disabled={linkFieldMutation.isPending}
              data-testid="button-cancel"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateLink}
              disabled={!selectedModule || !selectedEntityKey || linkFieldMutation.isPending}
              data-testid="button-create-link"
            >
              {linkFieldMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Criar Link
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
