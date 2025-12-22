import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Mail, MessageSquare, Hash, RefreshCcw, Save, Bot, Users, Plus, Edit, Trash2, Download } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useState, useEffect } from "react";
import WhatsAppWebConnect from "@/components/comunicacoes/WhatsAppWebConnect";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

// Gmail Sync Settings Schema
const gmailSettingsFormSchema = z.object({
  autoSync: z.boolean(),
  syncIntervalMinutes: z.coerce.number().min(5).max(1440),
  filterPeriodHours: z.coerce.number().min(1).max(168),
});

function GmailSyncSettings() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Fetch current settings
  const { data: settings, isLoading: fetchingSettings } = useQuery<any>({
    queryKey: ['/api/gmail/settings'],
  });

  // Form setup
  const form = useForm<z.infer<typeof gmailSettingsFormSchema>>({
    resolver: zodResolver(gmailSettingsFormSchema),
    defaultValues: {
      autoSync: true,
      syncIntervalMinutes: 15,
      filterPeriodHours: 48,
    },
  });

  // Update form when settings are loaded
  useEffect(() => {
    if (settings) {
      form.reset({
        autoSync: settings.autoSync ?? true,
        syncIntervalMinutes: settings.syncIntervalMinutes ?? 15,
        filterPeriodHours: settings.filterPeriodHours ?? 48,
      });
    }
  }, [settings, form]);

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async (data: z.infer<typeof gmailSettingsFormSchema>) => {
      return await apiRequest("POST", "/api/gmail/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gmail/settings'] });
      toast({
        title: "Configurações salvas",
        description: "As configurações de sincronização do Gmail foram atualizadas com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
    },
  });

  // Reset settings mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/gmail/settings/reset");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gmail/settings'] });
      toast({
        title: "Configurações restauradas",
        description: "As configurações foram restauradas para os valores padrão.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao restaurar",
        description: error.message || "Não foi possível restaurar as configurações.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof gmailSettingsFormSchema>) => {
    saveMutation.mutate(data);
  };

  const handleReset = () => {
    resetMutation.mutate();
  };

  if (fetchingSettings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Sincronização Gmail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Carregando configurações...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Sincronização Gmail
        </CardTitle>
        <CardDescription>
          Configure como os emails do Gmail são sincronizados automaticamente com o AssistOS
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Auto Sync Toggle */}
            <FormField
              control={form.control}
              name="autoSync"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base" data-testid="label-auto-sync">
                      Sincronização Automática
                    </FormLabel>
                    <FormDescription>
                      Sincronizar emails automaticamente em segundo plano
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-auto-sync"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Sync Interval */}
            <FormField
              control={form.control}
              name="syncIntervalMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel data-testid="label-sync-interval">Intervalo de Sincronização</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={5}
                        max={1440}
                        {...field}
                        data-testid="input-sync-interval"
                      />
                      <span className="text-sm text-muted-foreground">minutos</span>
                    </div>
                  </FormControl>
                  <FormDescription>
                    Com que frequência sincronizar emails (mínimo 5 min, máximo 24h)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Filter Period */}
            <FormField
              control={form.control}
              name="filterPeriodHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel data-testid="label-filter-period">Período de Filtro</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={168}
                        {...field}
                        data-testid="input-filter-period"
                      />
                      <span className="text-sm text-muted-foreground">horas</span>
                    </div>
                  </FormControl>
                  <FormDescription>
                    Buscar apenas emails recebidos nas últimas X horas (máximo 7 dias)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4">
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save-settings"
              >
                <Save className="mr-2 h-4 w-4" />
                {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={resetMutation.isPending}
                data-testid="button-reset-settings"
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                {resetMutation.isPending ? "Restaurando..." : "Restaurar Padrão"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// WhatsApp Automation Client Types and Schema
interface AutomationClient {
  id: string;
  tenantId: string;
  phoneNumber: string;
  name: string | null;
  isActive: boolean;
  autoReplyEnabled: boolean;
  requiresApproval: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const automationClientFormSchema = z.object({
  phoneNumber: z.string().min(1, "Phone number is required"),
  name: z.string().optional(),
  notes: z.string().optional(),
});

// WhatsApp Automation Client Management Component
function WhatsAppAutomationClients() {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<AutomationClient | null>(null);
  const [deletingClient, setDeletingClient] = useState<AutomationClient | null>(null);

  const form = useForm<z.infer<typeof automationClientFormSchema>>({
    resolver: zodResolver(automationClientFormSchema),
    defaultValues: {
      phoneNumber: "",
      name: "",
      notes: "",
    },
  });

  // Fetch clients
  const { data: clientsData, isLoading: loadingClients } = useQuery<{ clients: AutomationClient[] }>({
    queryKey: ["/api/whatsapp/automation/clients"],
  });

  const clients = clientsData?.clients || [];

  // Bulk import mutation
  const bulkImportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/automation/clients/bulk-from-crm");
      return await res.json() as { added: number; skipped: number; total: number; message?: string };
    },
    onSuccess: (data: { added: number; skipped: number; total: number; message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/automation/clients"] });
      toast({
        title: "Sucesso",
        description: data.message || `Adicionados ${data.added} cliente(s), ${data.skipped} duplicado(s) ignorados`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao importar clientes do CRM",
        variant: "destructive",
      });
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof automationClientFormSchema>) => {
      return await apiRequest("POST", "/api/whatsapp/automation/clients", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/automation/clients"] });
      toast({
        title: "Cliente adicionado",
        description: "Cliente de automação configurado com sucesso.",
      });
      setAddDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao adicionar cliente.",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/whatsapp/automation/clients/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/automation/clients"] });
      toast({
        title: "Cliente atualizado",
        description: "Configuração atualizada com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao atualizar cliente.",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/whatsapp/automation/clients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/automation/clients"] });
      toast({
        title: "Cliente removido",
        description: "Cliente removido da automação.",
      });
      setDeletingClient(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao remover cliente.",
        variant: "destructive",
      });
    },
  });

  const handleToggleActive = (client: AutomationClient) => {
    updateMutation.mutate({
      id: client.id,
      data: { isActive: !client.isActive },
    });
  };

  const onSubmit = (data: z.infer<typeof automationClientFormSchema>) => {
    createMutation.mutate(data);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              AssistME Automation
            </CardTitle>
            <CardDescription className="mt-1.5">
              Configure números de cliente para resposta automática com AssistME
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => bulkImportMutation.mutate()}
              disabled={bulkImportMutation.isPending}
              variant="outline"
              size="sm"
            >
              <Download className={`h-4 w-4 mr-2 ${bulkImportMutation.isPending ? "animate-spin" : ""}`} />
              {bulkImportMutation.isPending ? "Configurando..." : "Configurar Todos os Clientes"}
            </Button>
            <Button onClick={() => setAddDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Cliente
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start gap-3">
            <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">Como funciona:</p>
              <ol className="text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
                <li>Adicione números de clientes que deseja monitorar</li>
                <li>Quando receber mensagens relacionadas a pedidos, o AssistME irá notificá-lo</li>
                <li>Aprove, rejeite ou personalize a resposta no chat do AssistME</li>
              </ol>
            </div>
          </div>
        </div>

        {loadingClients ? (
          <p className="text-muted-foreground">Carregando clientes...</p>
        ) : clients.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">Nenhum cliente configurado</p>
            <p className="text-muted-foreground mb-4">
              Adicione o primeiro cliente para ativar a automação
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map((client) => (
              <div
                key={client.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Users className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {client.name || `+${client.phoneNumber}`}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        +{client.phoneNumber}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={client.isActive ? "default" : "secondary"}>
                      {client.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Switch
                    checked={client.isActive}
                    onCheckedChange={() => handleToggleActive(client)}
                    disabled={updateMutation.isPending}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingClient(client)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Client Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Cliente de Automação</DialogTitle>
              <DialogDescription>
                Configure um número de cliente para monitoramento automático
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de Telefone</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="351912345678" />
                      </FormControl>
                      <FormDescription>
                        Número com código de país (sem + ou espaços)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome (Opcional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Nome do Cliente" />
                      </FormControl>
                      <FormDescription>Nome amigável para identificar</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas (Opcional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Informações adicionais..." rows={3} />
                      </FormControl>
                      <FormDescription>Notas internas sobre este cliente</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddDialogOpen(false)}
                    disabled={createMutation.isPending}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Adicionando..." : "Adicionar"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deletingClient} onOpenChange={() => setDeletingClient(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Cliente</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja remover {deletingClient?.name || deletingClient?.phoneNumber}? 
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingClient && deleteMutation.mutate(deletingClient.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Removendo..." : "Remover"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

export function CommunicationSettings() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold">Comunicação</h2>
        <p className="text-muted-foreground">
          Manage all your communication channels in one place
        </p>
      </div>

      {/* Communication Channels Tabs */}
      <Tabs defaultValue="email" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md" data-testid="tabs-communication">
          <TabsTrigger value="email" data-testid="tab-email">
            <Mail className="mr-2 h-4 w-4" />
            Email
          </TabsTrigger>
          <TabsTrigger value="whatsapp" data-testid="tab-whatsapp">
            <MessageSquare className="mr-2 h-4 w-4" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="slack" data-testid="tab-slack">
            <Hash className="mr-2 h-4 w-4" />
            Slack
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="mt-6" data-testid="content-email">
          <GmailSyncSettings />
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-6" data-testid="content-whatsapp">
          <div className="space-y-6">
            <WhatsAppWebConnect />
            <WhatsAppAutomationClients />
          </div>
        </TabsContent>

        <TabsContent value="slack" className="mt-6" data-testid="content-slack">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-5 w-5" />
                Slack Channel
              </CardTitle>
              <CardDescription>
                Integrate with your Slack workspace
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Hash className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">Em breve</h3>
              <p className="text-muted-foreground text-center max-w-md">
                Slack integration is coming soon. You'll be able to send notifications, manage channels, and sync conversations.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

