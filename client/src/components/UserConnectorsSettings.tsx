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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText,
  Database,
  Building2,
  Plug2,
  Plus,
  Trash2,
  Edit,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings,
  Link2,
  Unlink,
  Mail,
} from "lucide-react";

// Types
// Note: google-document-ai is NOT a user connector - it's a platform service
type ConnectorType =
  | "toc-online"
  | "moloni"
  | "sap-business-one"
  | "primavera"
  | "sibs-open-banking"
  | "gmail";

interface TenantConnectorConfig {
  id: number;
  tenantId: string;
  connectorType: ConnectorType;
  name: string;
  isEnabled: boolean;
  createdAt: string;
}

interface UserConnectorCredential {
  id: number;
  userId: string;
  tenantId: string;
  connectorType: ConnectorType;
  userCredentials: Record<string, any>;
  isConnected: boolean;
  connectedAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ConnectorMetadata {
  type: ConnectorType;
  name: string;
  description: string;
  category: "accounting" | "erp" | "ocr" | "banking" | "email";
  authType: "oauth2" | "api_key" | "credentials";
  userFields: Array<{
    name: string;
    label: string;
    type: "text" | "password" | "url";
    required: boolean;
    description?: string;
  }>;
}

// Connector metadata (user-level fields)
// Note: google_document_ai is NOT included - it's a platform service, not a user/tenant connector
const CONNECTOR_METADATA: Record<ConnectorType, Omit<ConnectorMetadata, "type">> = {
  "toc-online": {
    name: "TOC Online",
    description: "As suas credenciais de acesso pessoal",
    category: "accounting",
    authType: "credentials",
    userFields: [
      {
        name: "username",
        label: "Seu Username",
        type: "text",
        required: true,
      },
      {
        name: "password",
        label: "Sua Password",
        type: "password",
        required: true,
      },
    ],
  },
  moloni: {
    name: "Moloni",
    description: "Token de acesso pessoal Moloni",
    category: "erp",
    authType: "oauth2",
    userFields: [
      {
        name: "accessToken",
        label: "Access Token Pessoal",
        type: "password",
        required: true,
        description: "Token OAuth da sua conta Moloni",
      },
      {
        name: "refreshToken",
        label: "Refresh Token",
        type: "password",
        required: false,
        description: "Token para renovação automática",
      },
    ],
  },
  "sap-business-one": {
    name: "SAP Business One",
    description: "As suas credenciais de login SAP",
    category: "erp",
    authType: "credentials",
    userFields: [
      {
        name: "username",
        label: "Seu Username SAP",
        type: "text",
        required: true,
      },
      {
        name: "password",
        label: "Sua Password SAP",
        type: "password",
        required: true,
      },
    ],
  },
  primavera: {
    name: "Primavera ERP",
    description: "Token de acesso pessoal Primavera",
    category: "erp",
    authType: "oauth2",
    userFields: [
      {
        name: "accessToken",
        label: "Access Token Pessoal",
        type: "password",
        required: true,
        description: "Token OAuth da sua conta Primavera",
      },
      {
        name: "refreshToken",
        label: "Refresh Token",
        type: "password",
        required: false,
      },
    ],
  },
  "sibs-open-banking": {
    name: "SIBS Open Banking",
    description: "Consentimento bancário pessoal",
    category: "banking",
    authType: "oauth2",
    userFields: [
      {
        name: "consentId",
        label: "Consent ID",
        type: "text",
        required: true,
        description: "ID do consentimento obtido via OAuth",
      },
      {
        name: "accessToken",
        label: "Access Token",
        type: "password",
        required: true,
      },
    ],
  },
  gmail: {
    name: "Gmail",
    description: "Conecte sua conta Gmail pessoal",
    category: "email",
    authType: "oauth2",
    userFields: [
      {
        name: "email",
        label: "Email",
        type: "text",
        required: true,
        description: "Seu endereço Gmail",
      },
      {
        name: "accessToken",
        label: "Access Token",
        type: "password",
        required: true,
        description: "Token OAuth do Google",
      },
      {
        name: "refreshToken",
        label: "Refresh Token",
        type: "password",
        required: false,
        description: "Token para renovação automática",
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
    case "email":
      return Mail;
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
    case "email":
      return "text-red-500";
    default:
      return "text-gray-500";
  }
};

export default function UserConnectorsSettings() {
  const { toast } = useToast();
  const [selectedConnector, setSelectedConnector] = useState<TenantConnectorConfig | null>(null);
  const [editingCredential, setEditingCredential] = useState<UserConnectorCredential | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Fetch tenant connectors (available to connect)
  const { data: tenantConnectors, isLoading: loadingTenant } = useQuery<TenantConnectorConfig[]>({
    queryKey: ["/api/user/connectors/available"],
  });

  // Fetch user credentials (already connected)
  const { data: userCredentials, isLoading: loadingUser } = useQuery<UserConnectorCredential[]>({
    queryKey: ["/api/user/connectors"],
  });

  // Build status map
  const connectedTypes = new Set((userCredentials || []).map((c) => c.connectorType));
  const availableToConnect = (tenantConnectors || []).filter(
    (tc) => !connectedTypes.has(tc.connectorType)
  );

  // Form for adding/editing credentials
  const metadata = selectedConnector
    ? CONNECTOR_METADATA[selectedConnector.connectorType]
    : editingCredential
    ? CONNECTOR_METADATA[editingCredential.connectorType]
    : null;

  const formSchema = metadata
    ? z.object(
        Object.fromEntries(
          metadata.userFields.map((field) => [
            field.name,
            field.required ? z.string().min(1, `${field.label} é obrigatório`) : z.string().optional(),
          ])
        )
      )
    : z.object({});

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: editingCredential?.userCredentials || {},
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingCredential) {
        return await apiRequest("PUT", `/api/user/connectors/${editingCredential.id}`, {
          userCredentials: data,
          isConnected: true,
        });
      } else if (selectedConnector) {
        return await apiRequest("POST", "/api/user/connectors", {
          connectorType: selectedConnector.connectorType,
          userCredentials: data,
          isConnected: true,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/connectors"] });
      toast({
        title: editingCredential ? "Credenciais atualizadas" : "Conector conectado",
        description: "As suas credenciais pessoais foram guardadas com sucesso.",
      });
      setSelectedConnector(null);
      setEditingCredential(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao guardar credenciais.",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/user/connectors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/connectors"] });
      toast({
        title: "Conexão removida",
        description: "As suas credenciais foram eliminadas.",
      });
      setDeleteConfirm(null);
    },
  });

  const handleSubmit = (values: any) => {
    saveMutation.mutate(values);
  };

  const handleEdit = (credential: UserConnectorCredential) => {
    setEditingCredential(credential);
    form.reset(credential.userCredentials);
  };

  const isLoading = loadingTenant || loadingUser;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Minhas Conexões
        </CardTitle>
        <CardDescription>
          Conecte as suas credenciais pessoais aos sistemas configurados pelo administrador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connected Connectors */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Conectados ({userCredentials?.length || 0})
          </h3>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : userCredentials && userCredentials.length > 0 ? (
            <div className="grid gap-3">
              {userCredentials.map((credential) => {
                const meta = CONNECTOR_METADATA[credential.connectorType];
                const Icon = getCategoryIcon(meta.category);
                const tenantConfig = tenantConnectors?.find((tc) => tc.connectorType === credential.connectorType);

                return (
                  <Card key={credential.id} className="hover-elevate">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`p-2 rounded-lg bg-muted`}>
                            <Icon className={`h-5 w-5 ${getCategoryColor(meta.category)}`} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{meta.name}</h4>
                              {credential.isConnected ? (
                                <Badge variant="default" className="gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  Conectado
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="gap-1">
                                  <XCircle className="h-3 w-3" />
                                  Desconectado
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {tenantConfig?.name || `Configuração ${meta.name}`}
                            </p>
                            {credential.connectedAt && (
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-muted-foreground">
                                  Conectado em: {new Date(credential.connectedAt).toLocaleDateString("pt-PT")}
                                </span>
                              </div>
                            )}
                            {credential.lastUsedAt && (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">
                                  Último uso: {new Date(credential.lastUsedAt).toLocaleDateString("pt-PT")}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(credential)}
                            data-testid={`button-edit-user-connector-${credential.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirm(credential.id)}
                            data-testid={`button-delete-user-connector-${credential.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Ainda não conectou nenhum sistema. Veja abaixo os disponíveis para conectar.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Available to Connect */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Unlink className="h-4 w-4 text-muted-foreground" />
            Disponíveis para Conectar ({availableToConnect.length})
          </h3>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
            </div>
          ) : availableToConnect.length > 0 ? (
            <div className="grid gap-3">
              {availableToConnect.map((connector) => {
                const meta = CONNECTOR_METADATA[connector.connectorType];
                const Icon = getCategoryIcon(meta.category);

                return (
                  <Card key={connector.id} className="hover-elevate">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`p-2 rounded-lg bg-muted`}>
                            <Icon className={`h-5 w-5 ${getCategoryColor(meta.category)}`} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{meta.name}</h4>
                              <Badge variant="outline">Disponível</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{connector.name}</p>
                            <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => setSelectedConnector(connector)}
                          data-testid={`button-connect-${connector.id}`}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Conectar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {tenantConnectors && tenantConnectors.length === 0
                  ? "O administrador ainda não configurou nenhum conector. Contacte o admin para ativar integrações."
                  : "Já conectou todos os sistemas disponíveis!"}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Connection Dialog */}
        <Dialog
          open={!!(selectedConnector || editingCredential)}
          onOpenChange={() => {
            setSelectedConnector(null);
            setEditingCredential(null);
          }}
        >
          <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingCredential ? "Editar Credenciais" : "Conectar"} {metadata?.name}
              </DialogTitle>
              <DialogDescription>{metadata?.description}</DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Privacidade:</strong> As suas credenciais pessoais são encriptadas e guardadas de forma
                    segura. Apenas você tem acesso.
                  </AlertDescription>
                </Alert>

                {metadata?.userFields.map((fieldDef) => (
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
                            data-testid={`input-user-${fieldDef.name}`}
                          />
                        </FormControl>
                        {fieldDef.description && <FormDescription>{fieldDef.description}</FormDescription>}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSelectedConnector(null);
                      setEditingCredential(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-user-credentials">
                    {saveMutation.isPending ? "A guardar..." : editingCredential ? "Atualizar" : "Conectar"}
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
              <AlertDialogTitle>Remover Conexão?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação irá remover as suas credenciais pessoais deste conector. Pode voltar a conectar quando
                quiser.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-user"
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
