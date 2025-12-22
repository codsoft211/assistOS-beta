import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { Plus, Edit, Trash2, RefreshCw, Phone, CheckCircle2, AlertCircle, XCircle, Bot, Users, Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface WhatsAppAccount {
  id: string;
  tenantId: string;
  userId: string;
  phoneNumber: string;
  phoneNumberId: string;
  businessAccountId: string;
  displayName: string | null;
  isActive: boolean;
  isPrimary: boolean;
  verificationStatus: string;
  qualityRating: string | null;
  messagingLimit: string | null;
  lastUsedAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

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

const accountFormSchema = z.object({
  phoneNumber: z.string().min(1, "Phone number is required"),
  phoneNumberId: z.string().min(1, "Phone Number ID is required"),
  businessAccountId: z.string().min(1, "Business Account ID is required"),
  accessToken: z.string().min(1, "Access token is required"),
  webhookVerifyToken: z.string().min(1, "Webhook verify token is required"),
  displayName: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

const automationClientFormSchema = z.object({
  phoneNumber: z.string().min(1, "Phone number is required"),
  name: z.string().optional(),
  autoReplyEnabled: z.boolean().default(false),
  requiresApproval: z.boolean().default(true),
  notes: z.string().optional(),
});

type AutomationClientFormValues = z.infer<typeof automationClientFormSchema>;

function AccountFormDialog({
  account,
  open,
  onOpenChange,
}: {
  account?: WhatsAppAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const isEditing = !!account;

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      phoneNumber: account?.phoneNumber || "",
      phoneNumberId: account?.phoneNumberId || "",
      businessAccountId: account?.businessAccountId || "",
      accessToken: "",
      webhookVerifyToken: "",
      displayName: account?.displayName || "",
      isPrimary: account?.isPrimary || false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AccountFormValues) => {
      return await apiRequest("POST", "/api/whatsapp/accounts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      toast({
        title: "Success",
        description: "WhatsApp account created successfully",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: AccountFormValues) => {
      return await apiRequest("PATCH", `/api/whatsapp/accounts/${account!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      toast({
        title: "Success",
        description: "WhatsApp account updated successfully",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update account",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AccountFormValues) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEditing ? "Edit" : "Add"} WhatsApp Account</DialogTitle>
        <DialogDescription>
          {isEditing ? "Update" : "Add"} your WhatsApp Business API account details
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="phoneNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone Number</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="+1234567890"
                    data-testid="input-phone-number"
                  />
                </FormControl>
                <FormDescription>WhatsApp Business phone number</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phoneNumberId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone Number ID</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="123456789012345"
                    data-testid="input-phone-number-id"
                  />
                </FormControl>
                <FormDescription>From Meta Business API</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="businessAccountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Business Account ID</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="123456789012345"
                    data-testid="input-business-account-id"
                  />
                </FormControl>
                <FormDescription>WhatsApp Business Account ID</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="accessToken"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Access Token</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    placeholder="••••••••••••••••"
                    data-testid="input-access-token"
                  />
                </FormControl>
                <FormDescription>WhatsApp API access token</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="webhookVerifyToken"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Webhook Verify Token</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    placeholder="••••••••••••••••"
                    data-testid="input-webhook-verify-token"
                  />
                </FormControl>
                <FormDescription>Token to verify webhook requests</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display Name (Optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="My Business WhatsApp"
                    data-testid="input-display-name"
                  />
                </FormControl>
                <FormDescription>Friendly name for this account</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isPrimary"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Primary Account</FormLabel>
                  <FormDescription>Set as default account for sending messages</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-is-primary"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              data-testid="button-submit"
            >
              {isPending ? "Saving..." : isEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
}

function AccountCard({ account }: { account: WhatsAppAccount }) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const toggleActiveMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", `/api/whatsapp/accounts/${account.id}`, {
        isActive: !account.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      toast({
        title: "Success",
        description: `Account ${account.isActive ? "deactivated" : "activated"} successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to toggle account status",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/whatsapp/accounts/${account.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      toast({
        title: "Success",
        description: "Account deleted successfully",
      });
      setDeleteDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete account",
        variant: "destructive",
      });
    },
  });

  const syncTemplatesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/whatsapp/accounts/${account.id}/sync-templates`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Templates synced successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to sync templates",
        variant: "destructive",
      });
    },
  });

  const getVerificationBadge = () => {
    switch (account.verificationStatus) {
      case "verified":
        return (
          <Badge variant="default" className="gap-1" data-testid={`badge-verification-${account.id}`}>
            <CheckCircle2 className="h-3 w-3" />
            Verified
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary" className="gap-1" data-testid={`badge-verification-${account.id}`}>
            <AlertCircle className="h-3 w-3" />
            Pending
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1" data-testid={`badge-verification-${account.id}`}>
            <XCircle className="h-3 w-3" />
            Unverified
          </Badge>
        );
    }
  };

  const getQualityBadge = () => {
    if (!account.qualityRating) return null;
    
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      green: "default",
      yellow: "secondary",
      red: "destructive",
    };

    return (
      <Badge variant={variants[account.qualityRating] || "outline"} data-testid={`badge-quality-${account.id}`}>
        Quality: {account.qualityRating}
      </Badge>
    );
  };

  return (
    <>
      <Card data-testid={`card-account-${account.id}`}>
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              <CardTitle className="text-base">{account.displayName || account.phoneNumber}</CardTitle>
              {account.isPrimary && (
                <Badge variant="default" data-testid={`badge-primary-${account.id}`}>
                  Primary
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={account.isActive}
                onCheckedChange={() => toggleActiveMutation.mutate()}
                disabled={toggleActiveMutation.isPending}
                data-testid={`switch-active-${account.id}`}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="text-sm space-y-1">
            <p className="text-muted-foreground">
              <span className="font-medium">Phone:</span> {account.phoneNumber}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium">Phone Number ID:</span> {account.phoneNumberId}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium">Business Account ID:</span> {account.businessAccountId}
            </p>
            {account.lastSyncAt && (
              <p className="text-muted-foreground text-xs">
                Last synced: {new Date(account.lastSyncAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {getVerificationBadge()}
            {getQualityBadge()}
            {account.messagingLimit && (
              <Badge variant="outline" data-testid={`badge-limit-${account.id}`}>
                {account.messagingLimit.replace("tier_", "").replace("_", " ")}
              </Badge>
            )}
          </div>
        </CardContent>

        <CardFooter className="gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditDialogOpen(true)}
            data-testid={`button-edit-${account.id}`}
          >
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncTemplatesMutation.mutate()}
            disabled={!account.isActive || syncTemplatesMutation.isPending}
            data-testid={`button-sync-${account.id}`}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncTemplatesMutation.isPending ? "animate-spin" : ""}`} />
            Sync Templates
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            data-testid={`button-delete-${account.id}`}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <AccountFormDialog
          account={account}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
        />
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete WhatsApp Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this account? This action will permanently delete the account
              and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Automation Client Form Dialog
function AutomationClientFormDialog({
  client,
  open,
  onOpenChange,
}: {
  client?: AutomationClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const isEditing = !!client;

  const form = useForm<AutomationClientFormValues>({
    resolver: zodResolver(automationClientFormSchema),
    defaultValues: {
      phoneNumber: client?.phoneNumber || "",
      name: client?.name || "",
      autoReplyEnabled: client?.autoReplyEnabled || false,
      requiresApproval: client?.requiresApproval !== undefined ? client.requiresApproval : true,
      notes: client?.notes || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AutomationClientFormValues) => {
      return await apiRequest("POST", "/api/whatsapp/automation/clients", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/automation/clients"] });
      toast({
        title: "Success",
        description: "Automation client added successfully",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add automation client",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: AutomationClientFormValues) => {
      return await apiRequest("PATCH", `/api/whatsapp/automation/clients/${client!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/automation/clients"] });
      toast({
        title: "Success",
        description: "Automation client updated successfully",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update automation client",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AutomationClientFormValues) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEditing ? "Edit" : "Add"} Automation Client</DialogTitle>
        <DialogDescription>
          Configure a client phone number for AssistME automation
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="phoneNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone Number</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="351912345678"
                    data-testid="input-automation-phone-number"
                  />
                </FormControl>
                <FormDescription>Client's WhatsApp number (with country code, no + or spaces)</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name (Optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Client Name or Company"
                    data-testid="input-automation-name"
                  />
                </FormControl>
                <FormDescription>Friendly name to identify this client</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Additional information about this client..."
                    rows={3}
                    data-testid="input-automation-notes"
                  />
                </FormControl>
                <FormDescription>Internal notes about this client</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="requiresApproval"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Requires Approval</FormLabel>
                  <FormDescription>
                    If enabled, AssistME will ask for approval before replying
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-requires-approval"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="autoReplyEnabled"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Auto Reply (Future)</FormLabel>
                  <FormDescription>
                    Automatically reply without approval (not yet implemented)
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={true}
                    data-testid="switch-auto-reply"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              data-testid="button-cancel-automation"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              data-testid="button-submit-automation"
            >
              {isPending ? "Saving..." : isEditing ? "Update" : "Add Client"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
}

// Automation Client Card
function AutomationClientCard({ client }: { client: AutomationClient }) {
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const toggleActiveMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", `/api/whatsapp/automation/clients/${client.id}`, {
        isActive: !client.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/automation/clients"] });
      toast({
        title: "Success",
        description: `Client ${client.isActive ? "deactivated" : "activated"} successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to toggle client status",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/whatsapp/automation/clients/${client.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/automation/clients"] });
      toast({
        title: "Success",
        description: "Client deleted successfully",
      });
      setDeleteDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete client",
        variant: "destructive",
      });
    },
  });

  return (
    <>
      <Card data-testid={`card-automation-client-${client.id}`}>
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <CardTitle className="text-base">{client.name || client.phoneNumber}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={client.isActive}
                onCheckedChange={() => toggleActiveMutation.mutate()}
                disabled={toggleActiveMutation.isPending}
                data-testid={`switch-active-${client.id}`}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="text-sm space-y-1">
            <p className="text-muted-foreground">
              <span className="font-medium">Phone:</span> +{client.phoneNumber}
            </p>
            {client.notes && (
              <p className="text-muted-foreground text-xs">
                <span className="font-medium">Notes:</span> {client.notes}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {client.isActive ? (
              <Badge variant="default" data-testid={`badge-active-${client.id}`}>
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Active
              </Badge>
            ) : (
              <Badge variant="secondary" data-testid={`badge-inactive-${client.id}`}>
                Inactive
              </Badge>
            )}
            {client.requiresApproval && (
              <Badge variant="outline" data-testid={`badge-approval-${client.id}`}>
                Requires Approval
              </Badge>
            )}
          </div>
        </CardContent>

        <CardFooter className="gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditDialogOpen(true)}
            data-testid={`button-edit-${client.id}`}
          >
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            data-testid={`button-delete-${client.id}`}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <AutomationClientFormDialog
          client={client}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
        />
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Automation Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this automation client? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel-automation">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-confirm-automation"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function WhatsAppSettings() {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addAutomationDialogOpen, setAddAutomationDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("accounts");

  const { data: accountsData, isLoading: loadingAccounts } = useQuery<{ accounts: WhatsAppAccount[] }>({
    queryKey: ["/api/whatsapp/accounts"],
  });

  const { data: automationData, isLoading: loadingAutomation } = useQuery<{ clients: AutomationClient[] }>({
    queryKey: ["/api/whatsapp/automation/clients"],
  });

  const accounts = accountsData?.accounts || [];
  const automationClients = automationData?.clients || [];

  // Bulk import mutation
  const bulkImportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/automation/clients/bulk-from-crm");
      return await res.json() as { added: number; skipped: number; total: number; message?: string };
    },
    onSuccess: (data: { added: number; skipped: number; total: number; message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/automation/clients"] });
      toast({
        title: "Success",
        description: data.message || `Added ${data.added} client(s), skipped ${data.skipped} duplicate(s)`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to import clients from CRM",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">WhatsApp Settings</h1>
        <p className="text-muted-foreground">
          Manage your WhatsApp Business API accounts and automation configuration
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="accounts" className="gap-2">
            <Phone className="h-4 w-4" />
            Accounts
          </TabsTrigger>
          <TabsTrigger value="automation" className="gap-2">
            <Bot className="h-4 w-4" />
            Automation
          </TabsTrigger>
        </TabsList>

        {/* Accounts Tab */}
        <TabsContent value="accounts" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold">WhatsApp Accounts</h2>
              <p className="text-sm text-muted-foreground">
                Connect and manage your WhatsApp Business API accounts
              </p>
            </div>
            <Button onClick={() => setAddDialogOpen(true)} data-testid="button-add-account">
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </div>

          {loadingAccounts ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-full" data-testid="skeleton-account-loading" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Phone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">No WhatsApp accounts configured</p>
                <p className="text-muted-foreground mb-4">
                  Add your first WhatsApp Business API account to get started
                </p>
                <Button onClick={() => setAddDialogOpen(true)} data-testid="button-add-first-account">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Account
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {accounts.map((account) => (
                <AccountCard key={account.id} account={account} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Automation Tab */}
        <TabsContent value="automation" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold">AssistME Automation</h2>
              <p className="text-sm text-muted-foreground">
                Configure client numbers for AssistME to monitor and respond to automatically
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => bulkImportMutation.mutate()}
                disabled={bulkImportMutation.isPending}
                variant="outline"
                data-testid="button-configure-all-clients"
              >
                <Download className={`h-4 w-4 mr-2 ${bulkImportMutation.isPending ? "animate-spin" : ""}`} />
                {bulkImportMutation.isPending ? "Configuring..." : "Configure All Clients"}
              </Button>
              <Button onClick={() => setAddAutomationDialogOpen(true)} data-testid="button-add-automation-client">
                <Plus className="h-4 w-4 mr-2" />
                Add Client
              </Button>
            </div>
          </div>

          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    How it works:
                  </p>
                  <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
                    <li>Add client phone numbers that you want to monitor</li>
                    <li>When a message arrives from a configured client, AssistME analyzes if it's order-related</li>
                    <li>If order-related, you'll get a notification in AssistME chat</li>
                    <li>Approve the response and AssistME will reply automatically</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>

          {loadingAutomation ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-full" data-testid="skeleton-automation-loading" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : automationClients.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">No automation clients configured</p>
                <p className="text-muted-foreground mb-4">
                  Add your first client to enable AssistME automation
                </p>
                <Button onClick={() => setAddAutomationDialogOpen(true)} data-testid="button-add-first-automation-client">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Client
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {automationClients.map((client) => (
                <AutomationClientCard key={client.id} client={client} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <AccountFormDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
      </Dialog>

      <Dialog open={addAutomationDialogOpen} onOpenChange={setAddAutomationDialogOpen}>
        <AutomationClientFormDialog open={addAutomationDialogOpen} onOpenChange={setAddAutomationDialogOpen} />
      </Dialog>
    </div>
  );
}
