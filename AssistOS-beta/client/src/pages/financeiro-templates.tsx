import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2 } from "lucide-react";

// Schema de validação
const templateFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  type: z.enum(["time_and_materials", "fixed_price", "retainer", "product", "construction", "event", "hybrid"]),
  industry: z.string().optional(),
  defaultMarkup: z.string().optional(),
  defaultOverhead: z.string().optional(),
  tags: z.string().optional(),
  isActive: z.boolean().default(true),
});

type TemplateFormData = z.infer<typeof templateFormSchema>;

interface CostTemplate {
  id: string;
  name: string;
  description: string | null;
  type: string;
  industry: string | null;
  defaultMarkup: string | null;
  defaultOverhead: string | null;
  tags: string[] | null;
  isActive: boolean;
  structure: any;
  createdAt: string;
  updatedAt: string;
}

const typeLabels: Record<string, string> = {
  time_and_materials: "Time & Materials",
  fixed_price: "Fixed Price",
  retainer: "Avença",
  product: "Produto",
  construction: "Construção",
  event: "Evento",
  hybrid: "Híbrido",
};

const typeBadgeVariants: Record<string, "default" | "secondary" | "outline"> = {
  time_and_materials: "default",
  fixed_price: "secondary",
  retainer: "outline",
  product: "default",
  construction: "secondary",
  event: "outline",
  hybrid: "default",
};

export default function FinanceiroTemplates() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CostTemplate | null>(null);

  const { data: templates, isLoading } = useQuery<CostTemplate[]>({
    queryKey: ["/api/financeiro/templates"],
  });

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "time_and_materials",
      industry: "",
      defaultMarkup: "1.50",
      defaultOverhead: "0.15",
      tags: "",
      isActive: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      const payload = {
        ...data,
        tags: data.tags ? data.tags.split(",").map(t => t.trim()) : [],
        structure: {},
      };
      return apiRequest("POST", "/api/financeiro/templates", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/templates"] });
      toast({
        title: "Sucesso",
        description: "Template criado com sucesso",
      });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar template",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TemplateFormData }) => {
      const payload = {
        ...data,
        tags: data.tags ? data.tags.split(",").map(t => t.trim()) : [],
      };
      return apiRequest("PATCH", `/api/financeiro/templates/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/templates"] });
      toast({
        title: "Sucesso",
        description: "Template atualizado com sucesso",
      });
      setIsDialogOpen(false);
      setEditingTemplate(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar template",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/financeiro/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/templates"] });
      toast({
        title: "Sucesso",
        description: "Template eliminado com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao eliminar template",
        variant: "destructive",
      });
    },
  });

  const handleOpenDialog = (template?: CostTemplate) => {
    if (template) {
      setEditingTemplate(template);
      form.reset({
        name: template.name,
        description: template.description || "",
        type: template.type as any,
        industry: template.industry || "",
        defaultMarkup: template.defaultMarkup || "1.50",
        defaultOverhead: template.defaultOverhead || "0.15",
        tags: template.tags?.join(", ") || "",
        isActive: template.isActive,
      });
    } else {
      setEditingTemplate(null);
      form.reset();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: TemplateFormData) => {
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-1">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Templates de Custo</h1>
          <p className="text-muted-foreground">Gerir templates de orçamentação</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} data-testid="button-new-template">
              <Plus className="h-4 w-4 mr-2" />
              Novo Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" data-testid="dialog-template-form">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Editar Template" : "Novo Template"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-name" placeholder="Ex: Consultoria IT" />
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
                      <FormLabel>Descrição</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-description" placeholder="Descrição do template" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-type">
                              <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="time_and_materials">Time & Materials</SelectItem>
                            <SelectItem value="fixed_price">Fixed Price</SelectItem>
                            <SelectItem value="retainer">Avença</SelectItem>
                            <SelectItem value="product">Produto</SelectItem>
                            <SelectItem value="construction">Construção</SelectItem>
                            <SelectItem value="event">Evento</SelectItem>
                            <SelectItem value="hybrid">Híbrido</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Indústria</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-industry" placeholder="Ex: IT" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="defaultMarkup"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Markup Padrão</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-markup" type="number" step="0.01" placeholder="1.50" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultOverhead"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Overhead Padrão</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-overhead" type="number" step="0.01" placeholder="0.15" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags (separadas por vírgula)</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-tags" placeholder="consultoria, desenvolvimento, design" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-1 rounded-lg border p-4">
                      <div>
                        <FormLabel>Ativo</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Template disponível para uso
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      setEditingTemplate(null);
                      form.reset();
                    }}
                    data-testid="button-cancel"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit"
                  >
                    {editingTemplate ? "Atualizar" : "Criar"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card data-testid="card-templates-list">
        <CardHeader>
          <CardTitle>Lista de Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="table-templates">
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Indústria</TableHead>
                <TableHead>Markup Padrão</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates && templates.length > 0 ? (
                templates.map((template) => (
                  <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                    <TableCell className="font-medium" data-testid={`text-name-${template.id}`}>
                      {template.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeBadgeVariants[template.type] || "default"} data-testid={`badge-type-${template.id}`}>
                        {typeLabels[template.type] || template.type}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`text-industry-${template.id}`}>
                      {template.industry || "-"}
                    </TableCell>
                    <TableCell data-testid={`text-markup-${template.id}`}>
                      {template.defaultMarkup ? `${parseFloat(template.defaultMarkup).toFixed(2)}x` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={template.isActive ? "default" : "secondary"} data-testid={`badge-active-${template.id}`}>
                        {template.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(template)}
                          data-testid={`button-edit-${template.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`button-delete-${template.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirmar eliminação</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem a certeza que deseja eliminar o template "{template.name}"?
                                Esta ação não pode ser revertida.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel data-testid={`button-cancel-delete-${template.id}`}>
                                Cancelar
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(template.id)}
                                data-testid={`button-confirm-delete-${template.id}`}
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum template encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
