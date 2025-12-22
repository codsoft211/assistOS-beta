import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Database,
  Building2,
  Plug2,
  Plus,
  Trash2,
  Edit,
  PlayCircle,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings,
  Download,
  Loader2,
  Users,
  Package,
  Briefcase,
  Receipt,
  KeyRound,
  ExternalLink,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";

// Types
// Note: google-document-ai is NOT a tenant connector - it's a platform service
type ConnectorType =
  | "toc-online"
  | "moloni"
  | "sap-business-one"
  | "primavera"
  | "sibs-open-banking";

interface TenantConnectorConfig {
  id: number;
  tenantId: string;
  connectorType: ConnectorType;
  name: string;
  companyCredentials: Record<string, any>;
  isEnabled: boolean;
  isAuthorized?: boolean;
  connectedAt?: string;
  lastTestAt?: string;
  lastTestStatus?: "success" | "failed";
  lastTestError?: string;
  createdAt: string;
  updatedAt: string;
}

interface ConnectorMetadata {
  type: ConnectorType;
  name: string;
  description: string;
  category: "accounting" | "erp" | "ocr" | "banking";
  authType: "oauth2" | "api_key" | "credentials";
  requiredFields: Array<{
    name: string;
    label: string;
    type: "text" | "password" | "url";
    required: boolean;
    description?: string;
  }>;
}

// Connector metadata
// Note: google-document-ai is NOT included - it's a platform service, not a tenant connector
const CONNECTOR_METADATA: Record<ConnectorType, Omit<ConnectorMetadata, "type">> = {
  "toc-online": {
    name: "TOC Online",
    description: "Plataforma de contabilidade certificada portuguesa",
    category: "accounting",
    authType: "oauth2",
    requiredFields: [
      {
        name: "clientId",
        label: "Identificador (Client ID)",
        type: "text",
        required: true,
        description: "Identificador fornecido pelo TOC Online",
      },
      {
        name: "clientSecret",
        label: "Segredo (Client Secret)",
        type: "password",
        required: true,
        description: "Segredo fornecido pelo TOC Online",
      },
      {
        name: "oauthUrl",
        label: "URL de Autenticação OAuth",
        type: "url",
        required: false,
        description: "Ex: https://app3.toconline.pt/oauth",
      },
      {
        name: "apiUrl",
        label: "URL da API",
        type: "url",
        required: false,
        description: "Ex: https://api3.toconline.pt",
      },
    ],
  },
  moloni: {
    name: "Moloni",
    description: "Sistema de faturação português",
    category: "erp",
    authType: "oauth2",
    requiredFields: [
      {
        name: "clientId",
        label: "Client ID",
        type: "text",
        required: true,
      },
      {
        name: "clientSecret",
        label: "Client Secret",
        type: "password",
        required: true,
      },
      {
        name: "companyId",
        label: "Company ID",
        type: "text",
        required: true,
        description: "ID da empresa no Moloni",
      },
    ],
  },
  "sap-business-one": {
    name: "SAP Business One",
    description: "ERP empresarial internacional",
    category: "erp",
    authType: "credentials",
    requiredFields: [
      {
        name: "baseUrl",
        label: "Service Layer URL",
        type: "url",
        required: true,
        description: "URL do Service Layer (ex: https://server:50000/b1s/v1)",
      },
      {
        name: "companyDB",
        label: "Company Database",
        type: "text",
        required: true,
        description: "Nome da base de dados da empresa",
      },
      {
        name: "username",
        label: "Username",
        type: "text",
        required: true,
      },
      {
        name: "password",
        label: "Password",
        type: "password",
        required: true,
      },
    ],
  },
  primavera: {
    name: "Primavera ERP",
    description: "ERP português líder de mercado",
    category: "erp",
    authType: "oauth2",
    requiredFields: [
      {
        name: "clientId",
        label: "Client ID",
        type: "text",
        required: true,
      },
      {
        name: "clientSecret",
        label: "Client Secret",
        type: "password",
        required: true,
      },
      {
        name: "tenantKey",
        label: "Tenant Key",
        type: "text",
        required: true,
        description: "Chave do tenant Primavera",
      },
      {
        name: "subscriptionKey",
        label: "Subscription Key",
        type: "text",
        required: true,
        description: "Chave de subscrição API",
      },
    ],
  },
  "sibs-open-banking": {
    name: "SIBS Open Banking",
    description: "API bancária portuguesa (PSD2)",
    category: "banking",
    authType: "oauth2",
    requiredFields: [
      {
        name: "clientId",
        label: "Client ID",
        type: "text",
        required: true,
      },
      {
        name: "clientSecret",
        label: "Client Secret",
        type: "password",
        required: true,
      },
      {
        name: "redirectUri",
        label: "Redirect URI",
        type: "url",
        required: true,
        description: "URI de callback OAuth",
      },
    ],
  },
};

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "accounting":
      return Database;
    case "erp":
      return Building2;
    case "ocr":
      return FileText;
    case "banking":
      return Plug2;
    default:
      return Settings;
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case "accounting":
      return "text-green-500";
    case "erp":
      return "text-blue-500";
    case "ocr":
      return "text-purple-500";
    case "banking":
      return "text-orange-500";
    default:
      return "text-gray-500";
  }
};

interface ImportEntityOption {
  key: string;
  label: string;
  icon: typeof Users;
  description: string;
}

const IMPORT_ENTITIES: ImportEntityOption[] = [
  { key: "customers", label: "Clientes", icon: Users, description: "Fichas de clientes e contactos" },
  { key: "products", label: "Produtos", icon: Package, description: "Artigos e materiais" },
  { key: "services", label: "Serviços", icon: Briefcase, description: "Serviços prestados" },
  { key: "invoices", label: "Faturas", icon: Receipt, description: "Faturas e documentos fiscais" },
];

export default function AdminConnectorsConfig() {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<ConnectorType | null>(null);
  const [editingConfig, setEditingConfig] = useState<TenantConnectorConfig | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [importConfigId, setImportConfigId] = useState<number | null>(null);
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set(["customers", "products"]));
  const [importProgress, setImportProgress] = useState<{ running: boolean; progress: number; message: string }>({
    running: false,
    progress: 0,
    message: "",
  });

  // Fetch tenant connector configs
  const { data: configs, isLoading } = useQuery<TenantConnectorConfig[]>({
    queryKey: ["/api/admin/connectors"],
  });

  // Get available connectors (not yet configured)
  const configuredTypes = new Set(configs?.map((c) => c.connectorType) || []);
  const availableConnectors = Object.entries(CONNECTOR_METADATA)
    .filter(([type]) => !configuredTypes.has(type as ConnectorType))
    .map(([type, meta]) => ({
      type: type as ConnectorType,
      ...meta,
    }));

  // Form for creating/editing connector
  const metadata = selectedType ? CONNECTOR_METADATA[selectedType] : null;
  const formSchema = metadata
    ? z.object(
        Object.fromEntries(
          metadata.requiredFields.map((field) => [
            field.name,
            field.required ? z.string().min(1, `${field.label} é obrigatório`) : z.string().optional(),
          ])
        )
      )
    : z.object({});

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: editingConfig?.companyCredentials || {},
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingConfig) {
        return await apiRequest("PUT", `/api/admin/connectors/${editingConfig.id}`, {
          name: data.name,
          companyCredentials: data.credentials,
          isEnabled: data.isEnabled,
        });
      } else {
        return await apiRequest("POST", "/api/admin/connectors", {
          connectorType: selectedType,
          name: data.name,
          companyCredentials: data.credentials,
          isEnabled: true,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/connectors"] });
      toast({
        title: editingConfig ? "Conector atualizado" : "Conector configurado",
        description: "Company credentials guardadas com sucesso.",
      });
      setSelectedType(null);
      setEditingConfig(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao guardar configuração.",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/connectors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/connectors"] });
      toast({
        title: "Conector removido",
        description: "Configuração eliminada com sucesso.",
      });
      setDeleteConfirm(null);
    },
  });

  // Test connection mutation
  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      setTestingId(id);
      const res = await apiRequest("POST", `/api/admin/connectors/${id}/test`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/connectors"] });
      toast({
        title: data.success ? "Conexão OK" : "Falha na conexão",
        description: data.message || data.error,
        variant: data.success ? "default" : "destructive",
      });
      setTestingId(null);
    },
    onError: () => {
      setTestingId(null);
    },
  });

  // Import data mutation
  const importMutation = useMutation({
    mutationFn: async ({ configId, entityTypes }: { configId: number; entityTypes: string[] }) => {
      setImportProgress({ running: true, progress: 0, message: "A iniciar importação..." });
      const res = await apiRequest("POST", "/api/connector-imports", {
        connectorConfigId: configId,
        entityTypes,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.id) {
        setImportProgress({ running: true, progress: 10, message: "Importação iniciada..." });
        toast({
          title: "Importação iniciada",
          description: `A processar ${data.entityTypes?.join(", ")}...`,
        });
        pollImportStatus(data.id);
      } else {
        setImportProgress({ running: false, progress: 0, message: "" });
        toast({
          title: "Erro na importação",
          description: data.error || "Não foi possível iniciar a importação.",
          variant: "destructive",
        });
      }
      setImportConfigId(null);
    },
    onError: (error: any) => {
      setImportProgress({ running: false, progress: 0, message: "" });
      toast({
        title: "Erro",
        description: error.message || "Falha ao iniciar importação.",
        variant: "destructive",
      });
      setImportConfigId(null);
    },
  });

  // Poll import status
  const pollImportStatus = async (jobId: string) => {
    const maxAttempts = 60;
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setImportProgress({ running: false, progress: 0, message: "" });
        toast({
          title: "Timeout",
          description: "A importação demorou demasiado tempo. Verifique o estado manualmente.",
          variant: "destructive",
        });
        return;
      }

      try {
        const res = await fetch(`/api/connector-imports/${jobId}`, { credentials: "include" });
        const data = await res.json();

        if (data.status === "completed") {
          setImportProgress({ running: false, progress: 100, message: "Concluído!" });
          toast({
            title: "Importação concluída",
            description: `Importados: ${data.result?.imported || 0} registos.`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/connectors"] });
        } else if (data.status === "failed") {
          setImportProgress({ running: false, progress: 0, message: "" });
          toast({
            title: "Falha na importação",
            description: data.error || "Ocorreu um erro durante a importação.",
            variant: "destructive",
          });
        } else {
          const progress = Math.min(10 + attempts * 1.5, 90);
          setImportProgress({
            running: true,
            progress,
            message: data.message || `A processar... (${data.status})`,
          });
          attempts++;
          setTimeout(poll, 2000);
        }
      } catch {
        attempts++;
        setTimeout(poll, 2000);
      }
    };

    poll();
  };

  const toggleEntity = (key: string) => {
    const newSet = new Set(selectedEntities);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedEntities(newSet);
  };

  const handleStartImport = () => {
    if (importConfigId && selectedEntities.size > 0) {
      importMutation.mutate({
        configId: importConfigId,
        entityTypes: Array.from(selectedEntities),
      });
    }
  };

  const handleSubmit = (values: any) => {
    const credentials = Object.fromEntries(
      metadata!.requiredFields.map((field) => [field.name, values[field.name]])
    );

    saveMutation.mutate({
      name: values.name || metadata!.name,
      credentials,
      isEnabled: true,
    });
  };

  const handleEdit = (config: TenantConnectorConfig) => {
    setEditingConfig(config);
    setSelectedType(config.connectorType);
    form.reset({
      name: config.name,
      ...config.companyCredentials,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug2 className="h-5 w-5" />
          Tenant Connectors (Company Credentials)
        </CardTitle>
        <CardDescription>
          Configure conectores externos com credenciais da empresa. Utilizadores podem depois adicionar as suas
          credenciais pessoais em Settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="configured" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="configured" data-testid="tab-configured-connectors">
              Configurados ({configs?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="available" data-testid="tab-available-connectors">
              Disponíveis ({availableConnectors.length})
            </TabsTrigger>
          </TabsList>

          {/* Configured Connectors */}
          <TabsContent value="configured" className="space-y-4">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : configs && configs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conector</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Último Teste</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.map((config) => {
                    const meta = CONNECTOR_METADATA[config.connectorType];
                    const Icon = getCategoryIcon(meta.category);
                    return (
                      <TableRow key={config.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${getCategoryColor(meta.category)}`} />
                            <span className="font-medium">{meta.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{config.name}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {config.isEnabled ? (
                              <Badge variant="default" className="gap-1 w-fit">
                                <CheckCircle className="h-3 w-3" />
                                Ativo
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1 w-fit">
                                <XCircle className="h-3 w-3" />
                                Inativo
                              </Badge>
                            )}
                            {meta?.authType === "oauth2" && (
                              config.isAuthorized ? (
                                <Badge variant="outline" className="gap-1 w-fit text-green-600 border-green-600">
                                  <KeyRound className="h-3 w-3" />
                                  Autorizado
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="gap-1 w-fit text-orange-600 border-orange-600">
                                  <KeyRound className="h-3 w-3" />
                                  Pendente
                                </Badge>
                              )
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {config.lastTestAt ? (
                            <div className="flex items-center gap-2">
                              {config.lastTestStatus === "success" ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                              <span className="text-xs text-muted-foreground">
                                {new Date(config.lastTestAt).toLocaleDateString("pt-PT")}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Nunca testado</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {meta?.authType === "oauth2" && (
                              <Button
                                variant={config.isAuthorized ? "ghost" : "outline"}
                                size="icon"
                                onClick={() => {
                                  const oauthEndpoint = `/api/oauth/${config.connectorType}/authorize`;
                                  const authorizeUrl = `${oauthEndpoint}?configId=${config.id}`;
                                  console.log(`[OAuth] Navigating to: ${authorizeUrl}`);
                                  window.location.href = authorizeUrl;
                                }}
                                title={config.isAuthorized ? "Re-autorizar conexão OAuth" : "Autorizar conexão OAuth"}
                                data-testid={`button-authorize-connector-${config.id}`}
                                className={config.isAuthorized ? "" : "border-primary text-primary"}
                              >
                                {config.isAuthorized ? (
                                  <KeyRound className="h-4 w-4 text-green-500" />
                                ) : (
                                  <KeyRound className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => testMutation.mutate(config.id)}
                              disabled={testingId === config.id || (meta?.authType === "oauth2" && !config.isAuthorized)}
                              title={meta?.authType === "oauth2" && !config.isAuthorized ? "Autorize primeiro" : "Testar conexão"}
                              data-testid={`button-test-connector-${config.id}`}
                            >
                              {testingId === config.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <PlayCircle className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setImportConfigId(config.id)}
                              disabled={!config.isEnabled || importProgress.running || (meta?.authType === "oauth2" && !config.isAuthorized)}
                              title={meta?.authType === "oauth2" && !config.isAuthorized ? "Autorize primeiro" : "Importar dados"}
                              data-testid={`button-import-connector-${config.id}`}
                            >
                              {importProgress.running ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(config)}
                              title="Editar configuração"
                              data-testid={`button-edit-connector-${config.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteConfirm(config.id)}
                              title="Remover conector"
                              data-testid={`button-delete-connector-${config.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Plug2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum conector configurado ainda.</p>
                <p className="text-sm mt-1">Adicione um na tab "Disponíveis".</p>
              </div>
            )}
          </TabsContent>

          {/* Available Connectors */}
          <TabsContent value="available" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableConnectors.map((connector) => {
                const Icon = getCategoryIcon(connector.category);
                return (
                  <Card key={connector.type} className="hover-elevate">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Icon className={`h-5 w-5 ${getCategoryColor(connector.category)}`} />
                        {connector.name}
                      </CardTitle>
                      <CardDescription>{connector.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{connector.category}</Badge>
                        <Button
                          size="sm"
                          onClick={() => setSelectedType(connector.type)}
                          data-testid={`button-configure-${connector.type}`}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Configurar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {availableConnectors.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p>Todos os conectores já estão configurados!</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Configuration Dialog */}
        <Dialog open={!!selectedType} onOpenChange={() => setSelectedType(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingConfig ? "Editar" : "Configurar"} {metadata?.name}
              </DialogTitle>
              <DialogDescription>{metadata?.description}</DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da Configuração</FormLabel>
                      <FormControl>
                        <Input placeholder={metadata?.name} {...field} data-testid="input-connector-name" />
                      </FormControl>
                      <FormDescription>Nome para identificar esta configuração</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {metadata?.requiredFields.map((fieldDef) => (
                  <FormField
                    key={fieldDef.name}
                    control={form.control}
                    name={fieldDef.name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {fieldDef.label}
                          {fieldDef.required && <span className="text-red-500 ml-1">*</span>}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type={fieldDef.type}
                            placeholder={fieldDef.label}
                            {...field}
                            data-testid={`input-${fieldDef.name}`}
                          />
                        </FormControl>
                        {fieldDef.description && <FormDescription>{fieldDef.description}</FormDescription>}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setSelectedType(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-connector">
                    {saveMutation.isPending ? "A guardar..." : editingConfig ? "Atualizar" : "Configurar"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Conector?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação irá remover a configuração do conector. Utilizadores que conectaram as suas credenciais
                pessoais também perderão acesso.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Import Data Dialog */}
        <Dialog open={!!importConfigId} onOpenChange={() => setImportConfigId(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Importar Dados
              </DialogTitle>
              <DialogDescription>
                Selecione os tipos de dados que pretende importar do sistema externo para o AssistOS.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {IMPORT_ENTITIES.map((entity) => {
                const EntityIcon = entity.icon;
                return (
                  <div
                    key={entity.key}
                    className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate cursor-pointer"
                    onClick={() => toggleEntity(entity.key)}
                    data-testid={`import-entity-${entity.key}`}
                  >
                    <Checkbox
                      checked={selectedEntities.has(entity.key)}
                      onCheckedChange={() => toggleEntity(entity.key)}
                      id={`entity-${entity.key}`}
                    />
                    <div className="flex items-center gap-2 flex-1">
                      <EntityIcon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <label htmlFor={`entity-${entity.key}`} className="font-medium cursor-pointer">
                          {entity.label}
                        </label>
                        <p className="text-xs text-muted-foreground">{entity.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {importProgress.running && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{importProgress.message}</span>
                  <span className="font-medium">{Math.round(importProgress.progress)}%</span>
                </div>
                <Progress value={importProgress.progress} className="h-2" />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setImportConfigId(null)} disabled={importProgress.running}>
                Cancelar
              </Button>
              <Button
                onClick={handleStartImport}
                disabled={selectedEntities.size === 0 || importMutation.isPending || importProgress.running}
                data-testid="button-start-import"
              >
                {importMutation.isPending || importProgress.running ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    A importar...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Importar ({selectedEntities.size})
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
