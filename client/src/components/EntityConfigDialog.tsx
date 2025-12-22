import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Plus, 
  X, 
  Layers, 
  AlertCircle,
  Sparkles
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import FieldCreator from "@/components/FieldCreator";

interface EntityConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: 'phases' | 'resources' | 'tasks' | 'documents' | 'warehouses';
  moduleId: string;
}

const entityConfigs = {
  phases: {
    title: "Configurar Project Phases",
    description: "Defina as fases/etapas do projeto (ex: Planeamento, Execução, Encerramento)",
    entityName: "project_phases",
    displayName: "Project Phases",
    icon: Layers,
    itemLabel: "Fase",
    itemsLabel: "Fases",
    defaultItems: [
      { name: "Planeamento", description: "Fase inicial de definição de escopo e recursos" },
      { name: "Execução", description: "Implementação do projeto" },
      { name: "Encerramento", description: "Finalização e entrega do projeto" },
    ],
    fields: [
      { name: "name", label: "Nome da Fase", type: "text", required: true },
      { name: "description", label: "Descrição", type: "textarea", required: false },
      { name: "order", label: "Ordem", type: "number", required: true },
    ]
  },
  resources: {
    title: "Configurar Project Resources",
    description: "Configure os tipos de recursos (Pessoas, Equipamentos, Materiais)",
    entityName: "project_resources",
    displayName: "Project Resources",
    icon: Sparkles,
    itemLabel: "Tipo de Recurso",
    itemsLabel: "Tipos de Recursos",
    defaultItems: [
      { name: "Pessoas", description: "Equipa e colaboradores" },
      { name: "Equipamentos", description: "Ferramentas e máquinas" },
      { name: "Materiais", description: "Materiais consumíveis" },
    ],
    fields: [
      { name: "name", label: "Tipo", type: "text", required: true },
      { name: "description", label: "Descrição", type: "textarea", required: false },
    ]
  },
  tasks: {
    title: "Configurar Tasks",
    description: "Configure tarefas/deliverables do projeto",
    entityName: "project_tasks",
    displayName: "Project Tasks",
    icon: Layers,
    itemLabel: "Tarefa",
    itemsLabel: "Tarefas",
    defaultItems: [],
    fields: []
  },
  documents: {
    title: "Configurar Documents",
    description: "Configure tipos e categorias de documentos do projeto",
    entityName: "project_documents",
    displayName: "Project Documents",
    icon: Layers,
    itemLabel: "Categoria de Documento",
    itemsLabel: "Categorias de Documentos",
    defaultItems: [
      { name: "Contratos", description: "Contratos e acordos comerciais" },
      { name: "Propostas", description: "Propostas técnicas e comerciais" },
      { name: "Relatórios", description: "Relatórios de progresso e finais" },
      { name: "Desenhos Técnicos", description: "Plantas e especificações técnicas" },
    ],
    fields: [
      { name: "category", label: "Categoria", type: "text", required: true },
      { name: "description", label: "Descrição", type: "textarea", required: false },
      { name: "requiresApproval", label: "Requer Aprovação", type: "boolean", required: false },
    ]
  },
  warehouses: {
    title: "Configurar Armazéns Virtuais do Projeto",
    description: "Defina armazéns específicos deste projeto (separados do Logistics)",
    entityName: "project_warehouses",
    displayName: "Project Warehouses",
    icon: Layers,
    itemLabel: "Armazém",
    itemsLabel: "Armazéns",
    defaultItems: [
      { name: "Obra", description: "Armazém no local da obra" },
      { name: "Central", description: "Armazém central da empresa" },
      { name: "Temporário", description: "Armazém temporário" },
    ],
    fields: [
      { name: "name", label: "Nome", type: "text", required: true },
      { name: "location", label: "Localização", type: "text", required: false },
      { name: "capacity", label: "Capacidade", type: "text", required: false },
    ]
  },
};

const configSchema = z.object({
  displayName: z.string().min(1, "Nome obrigatório"),
  description: z.string().optional(),
  customItems: z.array(z.object({
    name: z.string().min(1, "Nome obrigatório"),
    description: z.string().optional(),
    order: z.number().optional(),
  })).optional(),
});

type ConfigFormValues = z.infer<typeof configSchema>;

export default function EntityConfigDialog({ 
  open, 
  onOpenChange, 
  entityType,
  moduleId 
}: EntityConfigDialogProps) {
  const { toast } = useToast();
  const config = entityConfigs[entityType] || entityConfigs.phases;
  // Clone defaultItems to prevent mutation of entityConfigs
  const [customItems, setCustomItems] = useState([...config.defaultItems]);
  const [newItemName, setNewItemName] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [customFields, setCustomFields] = useState<any[]>([]);

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      displayName: config.displayName,
      description: config.description,
      customItems: [...config.defaultItems],
    },
  });

  // Reset state when entityType changes
  useEffect(() => {
    const newConfig = entityConfigs[entityType] || entityConfigs.phases;
    // Clone arrays to prevent mutation
    setCustomItems([...newConfig.defaultItems]);
    setNewItemName("");
    setNewItemDesc("");
    setCustomFields([]);
    form.reset({
      displayName: newConfig.displayName,
      description: newConfig.description,
      customItems: [...newConfig.defaultItems],
    });
  }, [entityType, form]);

  const createEntityMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', `/api/modules/${moduleId}/entities`, data);
    },
    onSuccess: () => {
      // Hardcode 'projects' to match ProjectsConfigPanel query keys exactly
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'sandbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'production'] });
      toast({
        title: "Entidade criada!",
        description: `${config.displayName} foi adicionada com sucesso.`,
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao criar entidade.",
        variant: "destructive",
      });
    },
  });

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    
    const newItem = {
      name: newItemName,
      description: newItemDesc,
      order: customItems.length + 1,
    };
    
    setCustomItems([...customItems, newItem]);
    setNewItemName("");
    setNewItemDesc("");
  };

  const handleRemoveItem = (index: number) => {
    setCustomItems(customItems.filter((_: any, i: number) => i !== index));
  };

  const handleFieldAdd = (field: any) => {
    setCustomFields([...customFields, field]);
  };

  const handleFieldRemove = (index: number) => {
    setCustomFields(customFields.filter((_: any, i: number) => i !== index));
  };

  const onSubmit = (data: ConfigFormValues) => {
    createEntityMutation.mutate({
      entityName: config.entityName,
      displayName: data.displayName,
      description: data.description,
      customFields: customFields,
      metadata: {
        items: customItems,
        configuredAt: new Date().toISOString(),
      }
    });
  };

  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid={`dialog-config-${entityType}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {config.title}
          </DialogTitle>
          <DialogDescription>
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Entidade</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={config.displayName} data-testid="input-display-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Descrição da entidade..." data-testid="input-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Custom Items Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">{config.itemsLabel} Predefinidas</h4>
                  <p className="text-sm text-muted-foreground">
                    Configure os valores iniciais desta entidade
                  </p>
                </div>
                <Badge variant="secondary">{customItems.length} items</Badge>
              </div>

              {/* List of Custom Items */}
              <div className="space-y-2">
                {customItems.map((item: any, index: number) => (
                  <Card key={index} className="hover-elevate" data-testid={`card-item-${index}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">#{index + 1}</Badge>
                            <h5 className="font-medium truncate">{item.name}</h5>
                          </div>
                          {item.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(index)}
                          data-testid={`button-remove-item-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Add New Item Form */}
              <Card data-testid="card-add-item">
                <CardContent className="p-4 space-y-3">
                  <h5 className="font-medium flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Adicionar {config.itemLabel}
                  </h5>
                  <div className="space-y-2">
                    <Input
                      placeholder={`Nome da ${config.itemLabel.toLowerCase()}`}
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      data-testid="input-new-item-name"
                    />
                    <Textarea
                      placeholder="Descrição (opcional)"
                      value={newItemDesc}
                      onChange={(e) => setNewItemDesc(e.target.value)}
                      className="resize-none"
                      rows={2}
                      data-testid="input-new-item-description"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddItem}
                      disabled={!newItemName.trim()}
                      data-testid="button-add-item"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Alert data-testid="alert-help">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Estas são sugestões iniciais. Pode adicionar mais valores depois da criação.
                </AlertDescription>
              </Alert>
            </div>

            <Separator />

            {/* Custom Fields Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Campos Customizados</h4>
                  <p className="text-sm text-muted-foreground">
                    Adicione campos específicos com suporte a relações/lookups
                  </p>
                </div>
                <Badge variant="secondary">{customFields.length} campos</Badge>
              </div>

              {/* List of Custom Fields */}
              {customFields.length > 0 && (
                <div className="space-y-2">
                  {customFields.map((field: any, index: number) => (
                    <Card key={index} className="hover-elevate" data-testid={`card-field-${index}`}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{field.fieldType}</Badge>
                              <h5 className="font-medium truncate">{field.displayName}</h5>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Key: {field.fieldKey}
                              {field.linkType && ` • ${field.linkType} → ${field.targetEntity}`}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleFieldRemove(index)}
                            data-testid={`button-remove-field-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Field Creator */}
              <FieldCreator 
                onFieldAdd={handleFieldAdd}
                availableEntities={['project_phases', 'project_resources', 'project_tasks', 'project_documents']}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createEntityMutation.isPending}
                data-testid="button-save"
              >
                {createEntityMutation.isPending ? "A criar..." : "Criar Entidade"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
