import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, TrendingUp } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const sourceSchema = z.object({
  sourceType: z.enum(['instantly', 'facebook_ads', 'linkedin', 'web_form', 'manual', 'referral', 'other']),
  sourceName: z.string().min(1, "Nome obrigatório"),
  isActive: z.boolean().optional(),
  defaultScore: z.coerce.number().optional(),
});

type SourceForm = z.infer<typeof sourceSchema>;

export default function SourcesPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingSource, setEditingSource] = useState<any>(null);
  const { toast } = useToast();

  const { data: sourcesData } = useQuery({
    queryKey: ['/api/lead-generation/sources'],
  });

  const form = useForm<SourceForm>({
    resolver: zodResolver(sourceSchema),
    defaultValues: {
      sourceType: 'web_form',
      sourceName: '',
      isActive: true,
      defaultScore: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: SourceForm) =>
      apiRequest('POST', '/api/lead-generation/sources', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/sources'] });
      toast({ title: "Fonte criada com sucesso" });
      form.reset();
      setShowDialog(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SourceForm> }) =>
      apiRequest('PATCH', `/api/lead-generation/sources/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/sources'] });
      toast({ title: "Fonte atualizada" });
      setEditingSource(null);
      setShowDialog(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest('DELETE', `/api/lead-generation/sources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/sources'] });
      toast({ title: "Fonte eliminada" });
    },
  });

  const sources = sourcesData?.sources || [];

  const onSubmit = (data: SourceForm) => {
    if (editingSource) {
      updateMutation.mutate({ id: editingSource.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (source: any) => {
    setEditingSource(source);
    form.reset({
      sourceType: source.sourceType,
      sourceName: source.sourceName,
      isActive: source.isActive,
      defaultScore: source.defaultScore || 0,
    });
    setShowDialog(true);
  };

  const handleNew = () => {
    setEditingSource(null);
    form.reset();
    setShowDialog(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Fontes de Leads</h1>
          <p className="text-muted-foreground">Gerir canais de aquisição de leads</p>
        </div>
        <Button onClick={handleNew} data-testid="button-add-source">
          <Plus className="h-4 w-4 mr-2" />
          Nova Fonte
        </Button>
      </div>

      <Card data-testid="card-sources-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score Padrão</TableHead>
              <TableHead>Estatísticas</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhuma fonte configurada
                </TableCell>
              </TableRow>
            ) : (
              sources.map((source: any) => (
                <TableRow key={source.id} data-testid={`row-source-${source.id}`}>
                  <TableCell className="font-medium">{source.sourceName}</TableCell>
                  <TableCell className="capitalize">
                    {source.sourceType.replace('_', ' ')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={source.isActive ? "default" : "secondary"}>
                      {source.isActive ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                  <TableCell>{source.defaultScore || 0}</TableCell>
                  <TableCell>
                    {source.stats ? (
                      <div className="flex items-center gap-2 text-sm">
                        <TrendingUp className="h-3 w-3" />
                        {source.stats.total || 0} leads
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(source)}
                      data-testid={`button-edit-${source.id}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(source.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${source.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent data-testid="dialog-source-form">
          <DialogHeader>
            <DialogTitle>{editingSource ? 'Editar Fonte' : 'Nova Fonte'}</DialogTitle>
            <DialogDescription>
              Configure um canal de aquisição de leads
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="sourceName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Fonte *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex: Website - Formulário de Contacto" data-testid="input-sourceName" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sourceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-sourceType">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="web_form">Web Form</SelectItem>
                        <SelectItem value="facebook_ads">Facebook Ads</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                        <SelectItem value="instantly">Instantly.ai</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="referral">Referência</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultScore"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Score Padrão</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" data-testid="input-defaultScore" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Ativa</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Fonte pode receber novos leads
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-isActive"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDialog(false)}
                  data-testid="button-cancel"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit"
                >
                  {editingSource ? 'Atualizar' : 'Criar'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
