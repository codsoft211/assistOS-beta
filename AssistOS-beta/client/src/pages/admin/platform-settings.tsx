import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, RefreshCw, RotateCcw, Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PlatformSetting {
  id: string;
  settingKey: string;
  category: string;
  value: number | string | boolean;
  displayName: string;
  description?: string;
  dataType: string;
  constraints?: {
    min?: number;
    max?: number;
    pattern?: string;
    allowedValues?: any[];
  };
  defaultValue: any;
  isEditable: boolean;
  requiresRestart: boolean;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
  updatedAt: string;
}

export default function PlatformSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingSetting, setEditingSetting] = useState<PlatformSetting | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Fetch all platform settings
  const { data, isLoading, error, refetch } = useQuery<{ settings: PlatformSetting[] }>({
    queryKey: ["/api/platform-settings"],
    retry: false,
  });

  // Update setting mutation
  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      return apiRequest(`/api/platform-settings/${key}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform-settings"] });
      toast({
        title: "Setting updated",
        description: "Platform setting has been updated successfully.",
      });
      setIsEditDialogOpen(false);
      setEditingSetting(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update setting",
        variant: "destructive",
      });
    },
  });

  // Reset setting mutation
  const resetMutation = useMutation({
    mutationFn: async (key: string) => {
      return apiRequest(`/api/platform-settings/${key}/reset`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform-settings"] });
      toast({
        title: "Setting reset",
        description: "Setting has been reset to its default value.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset setting",
        variant: "destructive",
      });
    },
  });

  // Clear cache mutation
  const clearCacheMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/platform-settings/cache/clear", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform-settings"] });
      toast({
        title: "Cache cleared",
        description: "Settings cache has been cleared.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clear cache",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (setting: PlatformSetting) => {
    setEditingSetting(setting);
    setEditValue(String(setting.value));
    setIsEditDialogOpen(true);
  };

  const handleSave = () => {
    if (!editingSetting) return;

    let parsedValue: any = editValue;
    
    // Parse value based on data type
    if (editingSetting.dataType === "number") {
      parsedValue = parseFloat(editValue);
      if (isNaN(parsedValue)) {
        toast({
          title: "Invalid value",
          description: "Please enter a valid number",
          variant: "destructive",
        });
        return;
      }
    } else if (editingSetting.dataType === "boolean") {
      parsedValue = editValue === "true" || editValue === "1";
    }

    updateMutation.mutate({
      key: editingSetting.settingKey,
      value: parsedValue,
    });
  };

  const handleReset = (setting: PlatformSetting) => {
    if (confirm(`Reset "${setting.displayName}" to its default value?`)) {
      resetMutation.mutate(setting.settingKey);
    }
  };

  const formatValue = (value: any): string => {
    if (typeof value === "number") {
      return value.toFixed(2);
    }
    return String(value);
  };

  const getValueDisplay = (setting: PlatformSetting): string => {
    if (setting.dataType === "number") {
      const num = setting.value as number;
      if (setting.settingKey === "credit_margin") {
        return `${(num * 100).toFixed(1)}%`;
      }
      return num.toFixed(2);
    }
    return String(setting.value);
  };

  // Calculate cost per credit for display
  const getCalculatedCost = (): string => {
    if (!data?.settings) return "N/A";
    
    const margin = data.settings.find(s => s.settingKey === "credit_margin")?.value as number;
    const price = data.settings.find(s => s.settingKey === "credit_price_eur")?.value as number;
    
    if (margin && price) {
      const cost = price * (1 - margin);
      return `€${cost.toFixed(3)}`;
    }
    return "N/A";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load platform settings. Please check your permissions.
        </AlertDescription>
      </Alert>
    );
  }

  const creditSettings = data?.settings.filter(s => s.category === "credits") || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Platform Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage platform-wide configuration settings
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => clearCacheMutation.mutate()}
            disabled={clearCacheMutation.isPending}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Clear Cache
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Credit System Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Credit System Settings
          </CardTitle>
          <CardDescription>
            Configure credit pricing and margins. Cost per credit is calculated automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Calculated Cost Display */}
          <div className="mb-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Calculated Cost Per Credit</p>
                <p className="text-xs text-muted-foreground">
                  Formula: Price × (1 - Margin)
                </p>
              </div>
              <Badge variant="secondary" className="text-lg">
                {getCalculatedCost()}
              </Badge>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Setting</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Constraints</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creditSettings.map((setting) => (
                <TableRow key={setting.id}>
                  <TableCell className="font-medium">
                    {setting.displayName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{getValueDisplay(setting)}</Badge>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <p className="text-sm text-muted-foreground">
                      {setting.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    {setting.constraints && (
                      <div className="text-xs text-muted-foreground">
                        {setting.constraints.min !== undefined && (
                          <div>Min: {setting.constraints.min}</div>
                        )}
                        {setting.constraints.max !== undefined && (
                          <div>Max: {setting.constraints.max}</div>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {setting.isEditable && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(setting)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReset(setting)}
                            disabled={resetMutation.isPending}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editingSetting?.displayName}</DialogTitle>
            <DialogDescription>
              {editingSetting?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Value</Label>
              <Input
                type={editingSetting?.dataType === "number" ? "number" : "text"}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                min={editingSetting?.constraints?.min}
                max={editingSetting?.constraints?.max}
                step={editingSetting?.dataType === "number" ? "0.01" : undefined}
              />
              {editingSetting?.constraints && (
                <p className="text-xs text-muted-foreground">
                  {editingSetting.constraints.min !== undefined &&
                    `Min: ${editingSetting.constraints.min}`}
                  {editingSetting.constraints.min !== undefined &&
                    editingSetting.constraints.max !== undefined &&
                    " • "}
                  {editingSetting.constraints.max !== undefined &&
                    `Max: ${editingSetting.constraints.max}`}
                </p>
              )}
              {editingSetting?.requiresRestart && (
                <Alert>
                  <AlertDescription>
                    This setting requires a server restart to take effect.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

