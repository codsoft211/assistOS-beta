import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database,
  Cloud,
  FileText,
  Building2,
  Plug2,
  Zap,
  Plus,
  MoreVertical,
  Trash2,
  Edit,
  PlayCircle,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";

// Types
type ConnectorType =
  | "google-document-ai"
  | "toc-online"
  | "moloni"
  | "sap-business-one"
  | "primavera"
  | "sibs-open-banking";

interface ConnectorConfig {
  id: number;
  tenantId: string;
  userId?: string;
  connectorType: ConnectorType;
  name: string;
  config: Record<string, any>;
  isActive: boolean;
  lastSyncAt?: string;
  lastTestAt?: string;
  lastTestStatus?: string;
  lastTestError?: string;
  createdAt: string;
  updatedAt: string;
}

// Available Connectors Configuration
const AVAILABLE_CONNECTORS = [
  {
    type: "google-document-ai" as ConnectorType,
    name: "Google Document AI",
    description: "Processamento inteligente de documentos com OCR e análise",
    icon: FileText,
    color: "text-blue-500",
  },
  {
    type: "toc-online" as ConnectorType,
    name: "TOC Online",
    description: "Contabilidade portuguesa certificada",
    icon: Database,
    color: "text-green-500",
  },
  {
    type: "moloni" as ConnectorType,
    name: "Moloni",
    description: "Faturação e gestão comercial portuguesa",
    icon: FileText,
    color: "text-purple-500",
  },
  {
    type: "sap-business-one" as ConnectorType,
    name: "SAP Business One",
    description: "ERP internacional para PMEs",
    icon: Building2,
    color: "text-orange-500",
  },
  {
    type: "primavera" as ConnectorType,
    name: "Primavera ERP",
    description: "ERP português líder de mercado",
    icon: Cloud,
    color: "text-red-500",
  },
  {
    type: "sibs-open-banking" as ConnectorType,
    name: "SIBS Open Banking",
    description: "Banking português com API aberta",
    icon: Zap,
    color: "text-yellow-500",
  },
];

// Form Schemas for each connector type
const googleDocumentAISchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  projectId: z.string().min(1, "Project ID obrigatório"),
  location: z.string().default("eu"),
  processorId: z.string().min(1, "Processor ID obrigatório"),
  credentials: z.string().min(1, "Credentials JSON obrigatório"),
});

const tocOnlineSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  clientId: z.string().min(1, "Identificador (Client ID) obrigatório"),
  clientSecret: z.string().min(1, "Segredo (Client Secret) obrigatório"),
  oauthUrl: z.string().url("URL inválido").default("https://app3.toconline.pt/oauth"),
  apiUrl: z.string().url("URL inválido").default("https://api3.toconline.pt"),
});

const moloniSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  clientId: z.string().min(1, "Client ID obrigatório"),
  clientSecret: z.string().min(1, "Client Secret obrigatório"),
  redirectUri: z.string().url("URL inválido").min(1, "Redirect URI obrigatório"),
  companyId: z.string().optional(),
});

const sapBusinessOneSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  serverUrl: z.string().url("URL inválido").min(1, "Server URL obrigatório"),
  companyDB: z.string().min(1, "Company DB obrigatório"),
  username: z.string().min(1, "Username obrigatório"),
  password: z.string().min(1, "Password obrigatório"),
});

const primaveraSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  serverUrl: z.string().url("URL inválido").min(1, "Server URL obrigatório"),
  username: z.string().min(1, "Username obrigatório"),
  password: z.string().min(1, "Password obrigatório"),
  company: z.string().min(1, "Company obrigatório"),
  instance: z.string().min(1, "Instance obrigatório"),
  line: z.string().min(1, "Line obrigatório"),
});

const sibsOpenBankingSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  clientId: z.string().min(1, "Client ID obrigatório"),
  clientSecret: z.string().min(1, "Client Secret obrigatório"),
  apiEndpoint: z.string().url("URL inválido").min(1, "API Endpoint obrigatório"),
  tppId: z.string().min(1, "TPP ID obrigatório"),
});

type ConnectorFormData = z.infer<
  | typeof googleDocumentAISchema
  | typeof tocOnlineSchema
  | typeof moloniSchema
  | typeof sapBusinessOneSchema
  | typeof primaveraSchema
  | typeof sibsOpenBankingSchema
>;

export default function ConectoresSettings() {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<ConnectorType | null>(null);
  const [editingConfig, setEditingConfig] = useState<ConnectorConfig | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [testingIds, setTestingIds] = useState<Set<number>>(new Set());
  const [syncingIds, setSyncingIds] = useState<Set<number>>(new Set());

  // Fetch connectors
  const { data: configs, isLoading } = useQuery<ConnectorConfig[]>({
    queryKey: ["/api/connectors"],
  });

  // Get schema based on connector type
  const getSchema = (type: ConnectorType) => {
    switch (type) {
      case "google-document-ai":
        return googleDocumentAISchema;
      case "toc-online":
        return tocOnlineSchema;
      case "moloni":
        return moloniSchema;
      case "sap-business-one":
        return sapBusinessOneSchema;
      case "primavera":
        return primaveraSchema;
      case "sibs-open-banking":
        return sibsOpenBankingSchema;
    }
  };

  const form = useForm<ConnectorFormData>({
    resolver: zodResolver(getSchema(selectedType || editingConfig?.connectorType || "google-document-ai")),
    defaultValues: editingConfig
      ? { name: editingConfig.name, ...editingConfig.config }
      : { name: "", location: "eu" },
  });

  // Create/Update Mutation
  const saveMutation = useMutation({
    mutationFn: async (data: ConnectorFormData) => {
      const { name, ...config } = data;
      const payload = {
        connectorType: editingConfig?.connectorType || selectedType,
        name,
        config,
        isActive: true,
      };

      if (editingConfig) {
        return apiRequest("PUT", `/api/connectors/${editingConfig.id}`, payload);
      } else {
        return apiRequest("POST", "/api/connectors", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
      toast({
        title: editingConfig ? "Conector atualizado" : "Conector criado",
        description: "Configuração guardada com sucesso.",
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao guardar configuração.",
        variant: "destructive",
      });
    },
  });

  // Test Connection Mutation
  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/connectors/${id}/test`);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
      toast({
        title: "Teste concluído",
        description: "Conexão testada com sucesso.",
      });
      setTestingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    onError: (error: any, id) => {
      toast({
        title: "Teste falhou",
        description: error.message || "Erro ao testar conexão.",
        variant: "destructive",
      });
      setTestingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  // Sync Mutation
  const syncMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/connectors/${id}/sync`);
    },
    onSuccess: (data: any, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
      toast({
        title: "Sincronização concluída",
        description: `${data.recordsSynced || 0} registos sincronizados.`,
      });
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    onError: (error: any, id) => {
      toast({
        title: "Sincronização falhou",
        description: error.message || "Erro ao sincronizar.",
        variant: "destructive",
      });
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/connectors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
      toast({
        title: "Conector removido",
        description: "Configuração eliminada com sucesso.",
      });
      setDeletingId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao remover conector.",
        variant: "destructive",
      });
    },
  });

  const handleOpenDialog = (type: ConnectorType) => {
    setSelectedType(type);
    setEditingConfig(null);
    form.reset({ name: "", location: "eu" });
  };

  const handleEditConfig = (config: ConnectorConfig) => {
    setEditingConfig(config);
    setSelectedType(null);
    form.reset({ name: config.name, ...config.config });
  };

  const handleCloseDialog = () => {
    setSelectedType(null);
    setEditingConfig(null);
    form.reset();
  };

  const handleTest = (id: number) => {
    setTestingIds((prev) => new Set(prev).add(id));
    testMutation.mutate(id);
  };

  const handleSync = (id: number) => {
    setSyncingIds((prev) => new Set(prev).add(id));
    syncMutation.mutate(id);
  };

  const handleDelete = (id: number) => {
    setDeletingId(id);
  };

  const confirmDelete = () => {
    if (deletingId) {
      deleteMutation.mutate(deletingId);
    }
  };

  const onSubmit = (data: ConnectorFormData) => {
    saveMutation.mutate(data);
  };

  const getConnectorInfo = (type: ConnectorType) => {
    return AVAILABLE_CONNECTORS.find((c) => c.type === type);
  };

  const getTestStatusBadge = (config: ConnectorConfig) => {
    if (!config.lastTestAt) {
      return (
        <Badge variant="secondary" data-testid={`badge-test-status-${config.id}`}>
          Não testado
        </Badge>
      );
    }

    if (config.lastTestStatus === "success") {
      return (
        <Badge className="bg-green-500" data-testid={`badge-test-status-${config.id}`}>
          <CheckCircle className="h-3 w-3 mr-1" />
          Sucesso
        </Badge>
      );
    }

    return (
      <Badge variant="destructive" data-testid={`badge-test-status-${config.id}`}>
        <XCircle className="h-3 w-3 mr-1" />
        Falhou
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Available Connectors Grid */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Conectores Disponíveis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {AVAILABLE_CONNECTORS.map((connector) => {
            const Icon = connector.icon;
            return (
              <Card
                key={connector.type}
                className="hover-elevate"
                data-testid={`card-available-${connector.type}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <Icon className={`h-8 w-8 ${connector.color}`} />
                    <Button
                      size="sm"
                      onClick={() => handleOpenDialog(connector.type)}
                      data-testid={`button-add-${connector.type}`}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Configurar
                    </Button>
                  </div>
                  <CardTitle className="text-base">{connector.name}</CardTitle>
                  <CardDescription className="text-sm">
                    {connector.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Configured Connectors Table */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Conectores Configurados</h3>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !configs || configs.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                <Plug2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p data-testid="text-no-connectors">
                  Nenhum conector configurado
                </p>
                <p className="text-sm mt-1">
                  Clique em "Configurar" num conector acima para começar
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último Teste</TableHead>
                  <TableHead>Última Sincronização</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => {
                  const connectorInfo = getConnectorInfo(config.connectorType);
                  const Icon = connectorInfo?.icon || Plug2;

                  return (
                    <TableRow key={config.id} data-testid={`row-connector-${config.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${connectorInfo?.color}`} />
                          <span data-testid={`text-connector-name-${config.id}`}>
                            {config.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-connector-type-${config.id}`}>
                        {connectorInfo?.name}
                      </TableCell>
                      <TableCell>
                        {config.isActive ? (
                          <Badge data-testid={`badge-active-${config.id}`}>
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`badge-active-${config.id}`}>
                            Inativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {getTestStatusBadge(config)}
                          {config.lastTestAt && (
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(config.lastTestAt), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-last-sync-${config.id}`}>
                        {config.lastSyncAt
                          ? formatDistanceToNow(new Date(config.lastSyncAt), {
                              addSuffix: true,
                              locale: ptBR,
                            })
                          : "Nunca"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTest(config.id)}
                            disabled={testingIds.has(config.id)}
                            data-testid={`button-test-${config.id}`}
                          >
                            {testingIds.has(config.id) ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <PlayCircle className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSync(config.id)}
                            disabled={syncingIds.has(config.id)}
                            data-testid={`button-sync-${config.id}`}
                          >
                            {syncingIds.has(config.id) ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                data-testid={`button-menu-${config.id}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleEditConfig(config)}
                                data-testid={`menu-edit-${config.id}`}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(config.id)}
                                className="text-destructive"
                                data-testid={`menu-delete-${config.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Configuration Dialog */}
      <Dialog 
        open={!!(selectedType || editingConfig)} 
        onOpenChange={handleCloseDialog}
        key={selectedType || editingConfig?.id}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-connector">
              {editingConfig
                ? `Editar ${getConnectorInfo(editingConfig.connectorType)?.name}`
                : selectedType
                ? `Configurar ${getConnectorInfo(selectedType)?.name}`
                : "Configurar Conector"}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados de configuração do conector
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Common Field: Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Configuração</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: Moloni Produção"
                        {...field}
                        data-testid="input-connector-name"
                      />
                    </FormControl>
                    <FormDescription>
                      Nome personalizado para identificar esta configuração
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Dynamic Fields Based on Connector Type */}
              {(selectedType === "google-document-ai" || editingConfig?.connectorType === "google-document-ai") && (
                <>
                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-projectId" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="eu" data-testid="input-location" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="processorId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Processor ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-processorId" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="credentials"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Credentials JSON</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={6}
                            placeholder='{"type": "service_account", ...}'
                            data-testid="input-credentials"
                          />
                        </FormControl>
                        <FormDescription>
                          Cole o JSON das credenciais da service account
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {(selectedType === "toc-online" || editingConfig?.connectorType === "toc-online") && (
                <>
                  <div className="bg-muted/50 p-3 rounded-md text-sm text-muted-foreground mb-4">
                    <p className="font-medium mb-1">Autenticação OAuth 2.0</p>
                    <p>Preencha os dados de acesso à API fornecidos pelo TOC Online.</p>
                  </div>
                  <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Identificador (Client ID)</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="pt517131889_c285187-c578b349542e93f7"
                            data-testid="input-clientId" 
                          />
                        </FormControl>
                        <FormDescription>
                          Identificador fornecido pelo TOC Online
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="clientSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Segredo (Client Secret)</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            {...field} 
                            placeholder="d1ac8ae310ca42d42c13a136a6392896"
                            data-testid="input-clientSecret" 
                          />
                        </FormControl>
                        <FormDescription>
                          Segredo fornecido pelo TOC Online
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="oauthUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Endereço de Autenticação OAuth</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://app3.toconline.pt/oauth"
                            data-testid="input-oauthUrl"
                          />
                        </FormControl>
                        <FormDescription>
                          URL para autenticação OAuth (normalmente https://app3.toconline.pt/oauth)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="apiUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Endereço de Acesso à API</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://api3.toconline.pt"
                            data-testid="input-apiUrl"
                          />
                        </FormControl>
                        <FormDescription>
                          URL base da API (normalmente https://api3.toconline.pt)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {(selectedType === "moloni" || editingConfig?.connectorType === "moloni") && (
                <>
                  <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-clientId" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="clientSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client Secret</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} data-testid="input-clientSecret" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="redirectUri"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Redirect URI</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://your-app.com/callback"
                            data-testid="input-redirectUri"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="companyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company ID (Opcional)</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-companyId" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {(selectedType === "sap-business-one" || editingConfig?.connectorType === "sap-business-one") && (
                <>
                  <FormField
                    control={form.control}
                    name="serverUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Server URL</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://sap-server.com"
                            data-testid="input-serverUrl"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="companyDB"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company DB</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-companyDB" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-username" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} data-testid="input-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {(selectedType === "primavera" || editingConfig?.connectorType === "primavera") && (
                <>
                  <FormField
                    control={form.control}
                    name="serverUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Server URL</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://primavera-server.com"
                            data-testid="input-serverUrl"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-username" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} data-testid="input-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-company" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="instance"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Instance</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-instance" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="line"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Line</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-line" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {(selectedType === "sibs-open-banking" || editingConfig?.connectorType === "sibs-open-banking") && (
                <>
                  <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-clientId" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="clientSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client Secret</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} data-testid="input-clientSecret" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="apiEndpoint"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>API Endpoint</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://api.sibs.com"
                            data-testid="input-apiEndpoint"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tppId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>TPP ID</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-tppId" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                  data-testid="button-cancel"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  data-testid="button-save"
                >
                  {saveMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      A guardar...
                    </>
                  ) : (
                    "Guardar"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja eliminar este conector? Esta ação não pode ser
              revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
