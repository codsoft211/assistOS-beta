import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Cloud, RefreshCw, Settings, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

interface StorageProvider {
  id: string;
  providerType: string;
  providerName: string;
  isDefault: boolean;
  isActive: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  capabilities: {
    supportsVersioning: boolean;
    supportsWebhooks: boolean;
    supportsDeltaSync: boolean;
  };
  createdAt: string;
}

export function ProviderManagement() {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newProvider, setNewProvider] = useState({
    providerType: "",
    providerName: "",
    config: "{}",
    credentials: "{}",
    isDefault: false,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const providersQuery = useQuery({
    queryKey: ['/api/storage-providers'],
    queryFn: async () => {
      const response = await fetch('/api/storage-providers');
      if (!response.ok) throw new Error('Failed to fetch providers');
      return response.json();
    },
  });

  const addProviderMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/storage-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          config: JSON.parse(data.config),
          credentials: JSON.parse(data.credentials),
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add provider');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Provider added",
        description: "Storage provider has been successfully added.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/storage-providers'] });
      setAddDialogOpen(false);
      setNewProvider({
        providerType: "",
        providerName: "",
        config: "{}",
        credentials: "{}",
        isDefault: false,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add provider",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const response = await fetch(`/api/storage-providers/${providerId}/sync`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to start sync');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sync started",
        description: "Provider synchronization has been initiated.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/storage-providers'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const providers = providersQuery.data?.providers || [];

  const getProviderIcon = (type: string) => {
    return <Cloud className="h-5 w-5" />;
  };

  const handleAddProvider = () => {
    if (!newProvider.providerType || !newProvider.providerName) {
      toast({
        title: "Validation error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      JSON.parse(newProvider.config);
      JSON.parse(newProvider.credentials);
    } catch (error) {
      toast({
        title: "Invalid JSON",
        description: "Config and credentials must be valid JSON.",
        variant: "destructive",
      });
      return;
    }

    addProviderMutation.mutate(newProvider);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Storage Providers</CardTitle>
            <CardDescription>
              Manage external storage integrations
            </CardDescription>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-provider">
                <Plus className="mr-2 h-4 w-4" />
                Add Provider
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-add-provider">
              <DialogHeader>
                <DialogTitle>Add Storage Provider</DialogTitle>
                <DialogDescription>
                  Configure a new external storage provider
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="provider-name">Provider Name</Label>
                  <Input
                    id="provider-name"
                    placeholder="My S3 Bucket"
                    value={newProvider.providerName}
                    onChange={(e) => setNewProvider({ ...newProvider, providerName: e.target.value })}
                    data-testid="input-provider-name"
                  />
                </div>
                <div>
                  <Label htmlFor="provider-type">Provider Type</Label>
                  <Select
                    value={newProvider.providerType}
                    onValueChange={(value) => setNewProvider({ ...newProvider, providerType: value })}
                  >
                    <SelectTrigger data-testid="select-provider-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="s3">Amazon S3</SelectItem>
                      <SelectItem value="azure">Azure Blob Storage</SelectItem>
                      <SelectItem value="gcs">Google Cloud Storage</SelectItem>
                      <SelectItem value="minio">MinIO</SelectItem>
                      <SelectItem value="dropbox">Dropbox</SelectItem>
                      <SelectItem value="google_drive">Google Drive</SelectItem>
                      <SelectItem value="local">Local Storage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="provider-config">Configuration (JSON)</Label>
                  <Textarea
                    id="provider-config"
                    placeholder='{"bucketName": "my-bucket", "region": "us-east-1"}'
                    value={newProvider.config}
                    onChange={(e) => setNewProvider({ ...newProvider, config: e.target.value })}
                    className="font-mono text-sm"
                    rows={4}
                    data-testid="input-provider-config"
                  />
                </div>
                <div>
                  <Label htmlFor="provider-credentials">Credentials (JSON)</Label>
                  <Textarea
                    id="provider-credentials"
                    placeholder='{"accessKeyId": "...", "secretAccessKey": "..."}'
                    value={newProvider.credentials}
                    onChange={(e) => setNewProvider({ ...newProvider, credentials: e.target.value })}
                    className="font-mono text-sm"
                    rows={4}
                    data-testid="input-provider-credentials"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="provider-default"
                    checked={newProvider.isDefault}
                    onChange={(e) => setNewProvider({ ...newProvider, isDefault: e.target.checked })}
                    data-testid="checkbox-provider-default"
                  />
                  <Label htmlFor="provider-default">Set as default provider</Label>
                </div>
                <Button
                  onClick={handleAddProvider}
                  className="w-full"
                  disabled={addProviderMutation.isPending}
                  data-testid="button-save-provider"
                >
                  {addProviderMutation.isPending ? "Adding..." : "Add Provider"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {providersQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : providers.length === 0 ? (
          <div className="text-center py-8" data-testid="text-no-providers">
            <Cloud className="h-12 w-12 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No storage providers configured</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add a provider to start syncing documents
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((provider: StorageProvider) => (
              <div
                key={provider.id}
                className="flex items-center gap-4 p-4 rounded-md border"
                data-testid={`provider-${provider.id}`}
              >
                <div className="flex items-center gap-3 flex-1">
                  {getProviderIcon(provider.providerType)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium" data-testid={`text-provider-name-${provider.id}`}>{provider.providerName}</span>
                      {provider.isDefault && (
                        <Badge variant="outline" className="bg-primary/10 text-primary" data-testid={`badge-default-${provider.id}`}>
                          Default
                        </Badge>
                      )}
                      {provider.isActive ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" data-testid={`icon-active-${provider.id}`} />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" data-testid={`icon-inactive-${provider.id}`} />
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground" data-testid={`text-provider-type-${provider.id}`}>
                      {provider.providerType}
                      {provider.lastSyncAt && (
                        <span className="ml-2">
                          Last sync: {format(new Date(provider.lastSyncAt), 'PPp')}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-1">
                      {provider.capabilities.supportsVersioning && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-versioning-${provider.id}`}>Versioning</Badge>
                      )}
                      {provider.capabilities.supportsDeltaSync && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-delta-sync-${provider.id}`}>Delta Sync</Badge>
                      )}
                      {provider.capabilities.supportsWebhooks && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-webhooks-${provider.id}`}>Webhooks</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncMutation.mutate(provider.id)}
                    disabled={syncMutation.isPending}
                    data-testid={`button-sync-${provider.id}`}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`button-settings-${provider.id}`}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
