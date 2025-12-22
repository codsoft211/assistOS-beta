import { useState, useEffect, useRef } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  QrCode, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Phone, 
  Smartphone,
  AlertCircle,
  Unplug,
  Trash2,
  RefreshCw
} from "lucide-react";
import QRCode from "react-qr-code";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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

interface WhatsAppWebSession {
  accountId: string;
  status: 'connecting' | 'qr_ready' | 'authenticated' | 'ready' | 'disconnected' | 'error' | 'not_connected';
  phoneNumber?: string;
  qrCode?: string;
  connectedAt?: string;
  lastSeenAt?: string;
  errorMessage?: string;
  clientInfo?: {
    platform?: string;
    phoneModel?: string;
    osVersion?: string;
  };
}

interface WhatsAppAccount {
  id: string;
  displayName: string | null;
  phoneNumber: string;
  connectionType: string;
  isActive: boolean;
  createdAt: string;
}

function QRConnectionDialog({
  open,
  onOpenChange,
  accountId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
}) {
  const [sessionStatus, setSessionStatus] = useState<WhatsAppWebSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    console.log('[WhatsApp Web Dialog] useEffect triggered:', { open, accountId });
    
    if (!open || !accountId) {
      console.log('[WhatsApp Web Dialog] Cleanup - open:', open, 'accountId:', accountId);
      // Cleanup
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setSessionStatus(null);
      setError(null);
      return;
    }

    console.log('[WhatsApp Web Dialog] Opening SSE connection to:', `/api/user/whatsapp-web/qr-stream/${accountId}`);
    
    // Connect to SSE stream for QR code updates
    const eventSource = new EventSource(`/api/user/whatsapp-web/qr-stream/${accountId}`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data);
      console.log('[WhatsApp Web] SSE Connected:', data);
      setSessionStatus({ accountId, status: 'connecting' });
      setError(null); // Clear any previous errors
    });

    eventSource.addEventListener('waiting', (e) => {
      const data = JSON.parse(e.data);
      console.log('[WhatsApp Web] Waiting:', data);
      setSessionStatus({ accountId, status: 'connecting' });
    });

    eventSource.addEventListener('qr', (e) => {
      const data = JSON.parse(e.data);
      console.log('[WhatsApp Web] QR Code received');
      setSessionStatus({ accountId, status: 'qr_ready', qrCode: data.qr });
    });

    eventSource.addEventListener('authenticated', (e) => {
      const data = JSON.parse(e.data);
      console.log('[WhatsApp Web] Authenticated:', data);
      setSessionStatus({ 
        accountId, 
        status: 'ready', 
        phoneNumber: data.phoneNumber 
      });
      
      // Refresh accounts list and session status
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      queryClient.invalidateQueries({ queryKey: [`/api/user/whatsapp-web/status/${accountId}`] });
      
      // Close dialog after successful connection
      setTimeout(() => {
        onOpenChange(false);
        
        // Force another refresh after dialog closes to ensure badge updates
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
          queryClient.invalidateQueries({ queryKey: [`/api/user/whatsapp-web/status/${accountId}`] });
          console.log('[WhatsApp Web] Forced query refresh after dialog close');
        }, 500);
      }, 2000);
    });

    eventSource.addEventListener('error', (e: any) => {
      // Custom error event sent from server (has data)
      if (e.data) {
        try {
          const data = JSON.parse(e.data);
          console.error('[WhatsApp Web] Error from server:', data);
          setError(data.error || 'Connection failed');
          setSessionStatus({ accountId, status: 'error', errorMessage: data.error });
        } catch (err) {
          console.error('[WhatsApp Web] Failed to parse error data:', err);
          setError('Connection error');
        }
      }
    });

    eventSource.addEventListener('disconnected', (e) => {
      const data = JSON.parse(e.data);
      console.log('[WhatsApp Web] Disconnected:', data);
      setError('Session disconnected');
      setSessionStatus({ accountId, status: 'disconnected' });
    });

    eventSource.onerror = (err) => {
      console.error('[WhatsApp Web] EventSource error:', err);
      console.error('[WhatsApp Web] EventSource readyState:', eventSource.readyState);
      
      // Check if this is a real error or just the stream closing normally
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('[WhatsApp Web] EventSource closed (might be normal after connection)');
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        console.log('[WhatsApp Web] EventSource reconnecting...');
      }
      
      // Don't set error immediately - server might just be reconnecting
      // Only set error if we haven't received any data after 10 seconds
      setTimeout(() => {
        if (!sessionStatus || sessionStatus.status === 'connecting') {
          console.error('[WhatsApp Web] No response after 10 seconds, showing error');
          setError('Connection timeout - please try again');
        }
      }, 10000);
    };

    return () => {
      eventSource.close();
    };
  }, [open, accountId, onOpenChange]);

  const getStatusContent = () => {
    if (error) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      );
    }

    if (!sessionStatus) {
      return (
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Initializing WhatsApp Web...</p>
        </div>
      );
    }

    switch (sessionStatus.status) {
      case 'connecting':
        return (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Generating QR code...</p>
          </div>
        );

      case 'qr_ready':
        return (
          <div className="flex flex-col items-center justify-center py-8 space-y-6">
            <div className="bg-white p-4 rounded-lg">
              {sessionStatus.qrCode && (
                <QRCode value={sessionStatus.qrCode} size={256} />
              )}
            </div>
            <div className="text-center space-y-2">
              <p className="font-medium">Scan with WhatsApp</p>
              <ol className="text-sm text-muted-foreground text-left space-y-1 max-w-md">
                <li>1. Open WhatsApp on your phone</li>
                <li>2. Tap <strong>Menu</strong> or <strong>Settings</strong></li>
                <li>3. Tap <strong>Linked Devices</strong></li>
                <li>4. Tap <strong>Link a Device</strong></li>
                <li>5. Point your phone at this screen to scan the QR code</li>
              </ol>
            </div>
          </div>
        );

      case 'authenticated':
      case 'ready':
        return (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <div className="text-center">
              <p className="font-medium text-lg">Successfully Connected!</p>
              {sessionStatus.phoneNumber && (
                <p className="text-muted-foreground mt-2">
                  Phone: +{sessionStatus.phoneNumber}
                </p>
              )}
            </div>
          </div>
        );

      case 'error':
        return (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              {sessionStatus.errorMessage || 'Failed to connect'}
            </AlertDescription>
          </Alert>
        );

      case 'disconnected':
        return (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Session disconnected</AlertDescription>
          </Alert>
        );

      default:
        return null;
    }
  };

  return (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          Connect WhatsApp Web
        </DialogTitle>
        <DialogDescription>
          Link your WhatsApp account by scanning the QR code
        </DialogDescription>
      </DialogHeader>

      <div className="py-4">
        {getStatusContent()}
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          {sessionStatus?.status === 'ready' ? 'Done' : 'Cancel'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ConnectedAccountCard({ 
  account, 
  session 
}: { 
  account: WhatsAppAccount;
  session?: WhatsAppWebSession;
}) {
  const { toast } = useToast();
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [reconnectDialogOpen, setReconnectDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState("");

  const reconnectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/user/whatsapp-web/reconnect/${account.id}`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      queryClient.invalidateQueries({ queryKey: [`/api/user/whatsapp-web/status/${account.id}`] });
      toast({
        title: "Success",
        description: "WhatsApp Web session reconnected. Scan the QR code to connect.",
      });
      // Open the reconnect dialog to show QR code
      setReconnectDialogOpen(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reconnect",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/user/whatsapp-web/disconnect/${account.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      queryClient.invalidateQueries({ queryKey: [`/api/user/whatsapp-web/status/${account.id}`] });
      toast({
        title: "Success",
        description: "WhatsApp Web logged out successfully",
      });
      setLogoutDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to logout",
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
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete account",
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (phoneNumbersStr: string) => {
      // Parse comma-separated phone numbers
      const numbers = phoneNumbersStr
        .split(',')
        .map(n => n.trim())
        .filter(n => n.length > 0);
      
      if (numbers.length === 0) {
        throw new Error('Please enter at least one phone number');
      }

      const response = await apiRequest("POST", `/api/user/whatsapp-web/sync/${account.id}`, {
        phoneNumbers: numbers,
        messagesPerChat: 50,
      });
      return await response.json();
    },
    onSuccess: (data: any) => {
      const hasErrors = data.errors && data.errors.length > 0;
      
      toast({
        title: hasErrors ? "Sync Completed with Warnings" : "Sync Complete",
        description: hasErrors 
          ? `Synced ${data.contactsProcessed} contacts and ${data.messagesProcessed} messages. ${data.errors[0]}`
          : `Synced ${data.contactsProcessed} contacts and ${data.messagesProcessed} messages`,
        variant: hasErrors ? "default" : "default",
      });
      setSyncDialogOpen(false);
      setPhoneNumbers("");
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync chat history",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = () => {
    if (!session) {
      return (
        <Badge variant="outline" className="gap-1">
          <XCircle className="h-3 w-3" />
          Not Connected
        </Badge>
      );
    }

    switch (session.status) {
      case 'ready':
        return (
          <Badge variant="default" className="gap-1 bg-green-500">
            <CheckCircle2 className="h-3 w-3" />
            Connected
          </Badge>
        );
      case 'connecting':
      case 'qr_ready':
      case 'authenticated':
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Connecting
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Error
          </Badge>
        );
      case 'disconnected':
        return (
          <Badge variant="outline" className="gap-1">
            <Unplug className="h-3 w-3" />
            Disconnected
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              <CardTitle className="text-base">
                {account.displayName || account.phoneNumber || 'WhatsApp Account'}
              </CardTitle>
            </div>
            {getStatusBadge()}
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {/* Always show phone number from account if available */}
          {account.phoneNumber && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Phone:</span> +{account.phoneNumber}
            </p>
          )}
          {/* Show session phone number if different from account */}
          {session?.phoneNumber && session.phoneNumber !== account.phoneNumber && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Session Phone:</span> +{session.phoneNumber}
            </p>
          )}
          {session?.connectedAt && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Connected:</span>{' '}
              {new Date(session.connectedAt).toLocaleString()}
            </p>
          )}
          {session?.lastSeenAt && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Last seen:</span>{' '}
              {new Date(session.lastSeenAt).toLocaleString()}
            </p>
          )}
          {session?.clientInfo && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Device:</span>{' '}
              {session.clientInfo.phoneModel || session.clientInfo.platform || 'Unknown'}
            </p>
          )}
          {session?.errorMessage && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {session.errorMessage}
              </AlertDescription>
            </Alert>
          )}
          {/* Show message if session cannot be recovered */}
          {(!session || session.status === 'disconnected' || session.status === 'error') && account.phoneNumber && (
            <Alert className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Session cannot be recovered. Click "Connect" to reinitialize and scan QR code again.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="gap-2">
          {/* Show Connect button if session is missing, not connected, disconnected, or error */}
          {(!session || session.status === 'not_connected' || session.status === 'disconnected' || session.status === 'error') && (
            <Button
              variant="default"
              size="sm"
              onClick={() => reconnectMutation.mutate()}
              disabled={reconnectMutation.isPending}
            >
              {reconnectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <QrCode className="h-4 w-4 mr-1" />
                  Connect
                </>
              )}
            </Button>
          )}
          {/* Show Sync and Disconnect buttons when connected */}
          {session?.status === 'ready' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSyncDialogOpen(true)}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Sync
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLogoutDialogOpen(true)}
              >
                <Unplug className="h-4 w-4 mr-1" />
                Logout
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </CardFooter>
      </Card>

      {/* Sync Options Dialog */}
      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync Chat History</DialogTitle>
            <DialogDescription>
              Enter phone numbers to sync specific WhatsApp chats
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phone-numbers">Phone Numbers</Label>
              <Textarea
                id="phone-numbers"
                placeholder="351912345678, 351987654321, 34612345678"
                value={phoneNumbers}
                onChange={(e) => setPhoneNumbers(e.target.value)}
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-sm text-muted-foreground">
                Enter comma-separated phone numbers (with country code, no + or spaces). 
                Example: 351912345678, 351987654321
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSyncDialogOpen(false);
                setPhoneNumbers("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => syncMutation.mutate(phoneNumbers)}
              disabled={syncMutation.isPending || !phoneNumbers.trim()}
            >
              {syncMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Start Sync
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Logout from WhatsApp Web</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to logout from this WhatsApp account? 
              You'll need to scan the QR code again to reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reconnect Dialog */}
      <Dialog open={reconnectDialogOpen} onOpenChange={setReconnectDialogOpen}>
        <QRConnectionDialog
          open={reconnectDialogOpen}
          onOpenChange={setReconnectDialogOpen}
          accountId={account.id}
        />
      </Dialog>
    </>
  );
}

export default function WhatsAppWebConnect() {
  const { toast } = useToast();
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [syncDialogAccountId, setSyncDialogAccountId] = useState<string | null>(null);
  const [syncPhoneNumbers, setSyncPhoneNumbers] = useState("");
  const [logoutDialogAccountId, setLogoutDialogAccountId] = useState<string | null>(null);
  const [deleteDialogAccountId, setDeleteDialogAccountId] = useState<string | null>(null);
  const [deleteDialogAccountName, setDeleteDialogAccountName] = useState<string>("");

  // Fetch all WhatsApp accounts (both cloud-api and web-connector)
  const { data: accountsData, isLoading: loadingAccounts, error: accountsError } = useQuery<{ accounts: WhatsAppAccount[] }>({
    queryKey: ["/api/whatsapp/accounts"],
    refetchInterval: 5000, // Poll every 5 seconds to catch new accounts
  });

  const accounts = accountsData?.accounts || [];
  const webConnectorAccounts = accounts.filter(acc => acc.connectionType === 'web-connector');
  
  // Debug: Log what the API returned
  useEffect(() => {
    console.log('[WhatsApp Web Settings] Accounts query result:', {
      isLoading: loadingAccounts,
      hasError: !!accountsError,
      error: accountsError,
      rawData: accountsData,
      totalAccounts: accounts.length,
      webConnectorAccounts: webConnectorAccounts.length,
      allAccounts: accounts.map(a => ({
        id: a.id,
        displayName: a.displayName,
        phoneNumber: a.phoneNumber,
        connectionType: a.connectionType,
        isActive: a.isActive,
      }))
    });
  }, [accountsData, loadingAccounts, accountsError, accounts.length, webConnectorAccounts.length]);

  // CRITICAL FIX: Use useQueries instead of mapping useQuery (violates Rules of Hooks)
  // useQueries is designed for dynamic queries and doesn't violate hook rules
  const sessionQueries = useQueries({
    queries: webConnectorAccounts.map(account => ({
      queryKey: [`/api/user/whatsapp-web/status/${account.id}`],
      queryFn: async () => {
        const response = await apiRequest("GET", `/api/user/whatsapp-web/status/${account.id}`);
        return await response.json() as WhatsAppWebSession;
      },
      refetchInterval: 5000, // Poll every 5 seconds
      retry: false,
    }))
  });

  // Calculate active (linked) accounts count
  const activeAccountsCount = sessionQueries.filter(
    query => query.data?.status === 'ready'
  ).length;

  // Debug logging - runs whenever session data changes
  useEffect(() => {
    const sessionsData = sessionQueries.map((q, i) => ({
      accountId: webConnectorAccounts[i]?.id,
      displayName: webConnectorAccounts[i]?.displayName,
      status: q.data?.status,
      phoneNumber: q.data?.phoneNumber,
      isLoading: q.isLoading,
      isError: q.isError,
      error: q.error,
    }));
    
    console.log('[WhatsApp Web Settings] Session status update:', {
      totalAccounts: webConnectorAccounts.length,
      activeAccounts: activeAccountsCount,
      sessions: sessionsData,
    });
    
    // Log which sessions are considered active
    const activeSessions = sessionsData.filter(s => s.status === 'ready');
    if (activeSessions.length > 0) {
      console.log('[WhatsApp Web Settings] ✅ Active sessions:', activeSessions);
    } else {
      console.log('[WhatsApp Web Settings] ⚠️  No active sessions found');
      console.log('[WhatsApp Web Settings] All session statuses:', sessionsData.map(s => s.status));
    }
  });
  
  // Log when active count changes
  useEffect(() => {
    console.log('[WhatsApp Web Settings] 📊 Active accounts count changed:', activeAccountsCount);
  }, [activeAccountsCount]);

  const createConnectionMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/user/whatsapp-web/connect", {
        displayName: name,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      console.log('[WhatsApp Web] Connection response:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      
      // Ensure we have the accountId before opening dialog
      if (!data?.accountId) {
        console.error('[WhatsApp Web] No accountId in response:', data);
        toast({
          title: "Error",
          description: "Invalid response from server - no account ID",
          variant: "destructive",
        });
        return;
      }
      
      console.log('[WhatsApp Web] Setting accountId and opening dialog:', data.accountId);
      
      // Set accountId first, then open dialog on next tick
      setPendingAccountId(data.accountId);
      setDisplayName("");
      
      // Use setTimeout to ensure state update completes before opening dialog
      setTimeout(() => {
        setConnectDialogOpen(true);
        toast({
          title: "Success",
          description: "WhatsApp Web session created. Scan the QR code to connect.",
        });
      }, 100);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create WhatsApp Web session",
        variant: "destructive",
      });
    },
  });

  const handleConnect = () => {
    if (!displayName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a display name",
        variant: "destructive",
      });
      return;
    }
    createConnectionMutation.mutate(displayName);
  };

  // Reconnect mutation for existing accounts
  const reconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      console.log('[WhatsApp Web] Calling reconnect API for:', accountId);
      const response = await apiRequest("POST", `/api/user/whatsapp-web/reconnect/${accountId}`);
      const data = await response.json();
      console.log('[WhatsApp Web] Reconnect API response:', data);
      return data;
    },
    onSuccess: (data: any, accountId: string) => {
      console.log('[WhatsApp Web] Reconnect successful, opening QR dialog for:', accountId);
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      queryClient.invalidateQueries({ queryKey: [`/api/user/whatsapp-web/status/${accountId}`] });
      
      // Set the accountId and open dialog
      setPendingAccountId(accountId);
      setConnectDialogOpen(true);
      
      toast({
        title: "Success",
        description: "WhatsApp Web session created. Scan the QR code to connect.",
      });
    },
    onError: (error: Error) => {
      console.error('[WhatsApp Web] Reconnect error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to reconnect",
        variant: "destructive",
      });
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return await apiRequest("POST", `/api/user/whatsapp-web/disconnect/${accountId}`);
    },
    onSuccess: (data: any, accountId: string) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      queryClient.invalidateQueries({ queryKey: [`/api/user/whatsapp-web/status/${accountId}`] });
      toast({
        title: "Success",
        description: "WhatsApp Web logged out successfully",
      });
      setLogoutDialogAccountId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to logout",
        variant: "destructive",
      });
      setLogoutDialogAccountId(null);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return await apiRequest("DELETE", `/api/whatsapp/accounts/${accountId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/accounts"] });
      toast({
        title: "Success",
        description: "Account deleted successfully",
      });
      setDeleteDialogAccountId(null);
      setDeleteDialogAccountName("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete account",
        variant: "destructive",
      });
    },
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async ({ accountId, phoneNumbersStr }: { accountId: string; phoneNumbersStr: string }) => {
      // Parse comma-separated phone numbers
      const numbers = phoneNumbersStr
        .split(',')
        .map(n => n.trim())
        .filter(n => n.length > 0);
      
      if (numbers.length === 0) {
        throw new Error('Please enter at least one phone number');
      }

      const response = await apiRequest("POST", `/api/user/whatsapp-web/sync/${accountId}`, {
        phoneNumbers: numbers,
        messagesPerChat: 50,
      });
      return await response.json();
    },
    onSuccess: (data: any) => {
      const hasErrors = data.errors && data.errors.length > 0;
      
      toast({
        title: hasErrors ? "Sync Completed with Warnings" : "Sync Complete",
        description: hasErrors 
          ? `Synced ${data.contactsProcessed} contacts and ${data.messagesProcessed} messages. ${data.errors[0]}`
          : `Synced ${data.contactsProcessed} contacts and ${data.messagesProcessed} messages`,
        variant: hasErrors ? "default" : "default",
      });
      setSyncDialogAccountId(null);
      setSyncPhoneNumbers("");
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync chat history",
        variant: "destructive",
      });
      setSyncDialogAccountId(null);
    },
  });

  const handleReconnect = (accountId: string) => {
    console.log('[WhatsApp Web] handleReconnect called for:', accountId);
    
    // Reset any stuck state before reconnecting
    setPendingAccountId(null);
    setConnectDialogOpen(false);
    
    // Start reconnection
    setTimeout(() => {
      reconnectMutation.mutate(accountId);
    }, 100);
  };

  const handleLogout = (accountId: string) => {
    setLogoutDialogAccountId(accountId);
  };

  const handleDelete = (accountId: string, displayName: string) => {
    setDeleteDialogAccountId(accountId);
    setDeleteDialogAccountName(displayName);
  };

  if (loadingAccounts) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                WhatsApp Web Connection
              </CardTitle>
              <CardDescription className="mt-1.5">
                Connect your personal WhatsApp account by scanning a QR code. 
                No need for WhatsApp Business API credentials.
              </CardDescription>
            </div>
            {/* Active Linked Accounts Badge */}
            {activeAccountsCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div className="text-left">
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                    {activeAccountsCount} Active {activeAccountsCount === 1 ? 'Account' : 'Accounts'}
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300">
                    Linked & Ready
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <div className="flex gap-2">
              <Input
                id="displayName"
                placeholder="e.g., My Personal WhatsApp"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleConnect();
                  }
                }}
              />
              <Button
                onClick={handleConnect}
                disabled={createConnectionMutation.isPending || !displayName.trim()}
              >
                {createConnectionMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <QrCode className="h-4 w-4 mr-2" />
                    Connect
                  </>
                )}
              </Button>
            </div>
          </div>

          <Alert>
            <Smartphone className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>How it works:</strong> Click "Connect" to generate a QR code. 
              Scan it with your WhatsApp mobile app to link your account. 
              You can send and receive messages just like WhatsApp Web.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Show all WhatsApp Web accounts in a user-friendly table/list */}
      {webConnectorAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  WhatsApp Accounts
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Manage your connected WhatsApp accounts. Click "Connect" to reconnect if the session was lost.
                </CardDescription>
              </div>
              {/* Active Accounts Summary */}
              <div className="text-right">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {activeAccountsCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  Active {activeAccountsCount === 1 ? 'Account' : 'Accounts'}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Active Accounts Alert */}
            {activeAccountsCount > 0 && (
              <Alert className="mb-4 border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-sm text-green-900 dark:text-green-100">
                  <strong>{activeAccountsCount}</strong> WhatsApp {activeAccountsCount === 1 ? 'account is' : 'accounts are'} currently linked and active. 
                  You can send and receive messages through {activeAccountsCount === 1 ? 'this account' : 'these accounts'}.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-3">
              {webConnectorAccounts.map((account, index) => {
                const query = sessionQueries[index];
                const session = query?.data;
                const isConnected = session?.status === 'ready';
                // Show Connect button if: no session data, query failed, or session is not connected/disconnected/error
                const isDisconnected = !session || query?.isError || session.status === 'not_connected' || session.status === 'disconnected' || session.status === 'error';
                const isConnecting = session?.status === 'connecting' || session?.status === 'qr_ready' || session?.status === 'authenticated';
                
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Phone className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">
                            {account.displayName || (account.phoneNumber && !account.phoneNumber.startsWith('pending-') ? account.phoneNumber : null) || 'WhatsApp Account'}
                          </p>
                          {(session?.phoneNumber || (account.phoneNumber && !account.phoneNumber.startsWith('pending-'))) && (
                            <p className="text-sm text-muted-foreground truncate">
                              +{session?.phoneNumber || (account.phoneNumber && !account.phoneNumber.startsWith('pending-') ? account.phoneNumber : '')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isConnected && (
                          <Badge variant="default" className="gap-1 bg-green-500">
                            <CheckCircle2 className="h-3 w-3" />
                            Connected
                          </Badge>
                        )}
                        {isConnecting && (
                          <Badge variant="secondary" className="gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Connecting
                          </Badge>
                        )}
                        {isDisconnected && (
                          <Badge variant="outline" className="gap-1">
                            <XCircle className="h-3 w-3" />
                            Not Connected
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Show Connect button if disconnected or error */}
                      {isDisconnected && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleReconnect(account.id)}
                          disabled={reconnectMutation.isPending}
                        >
                          {reconnectMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <QrCode className="h-4 w-4 mr-1" />
                              Connect
                            </>
                          )}
                        </Button>
                      )}
                      {/* Show Sync and Disconnect buttons when connected */}
                      {isConnected && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSyncDialogAccountId(account.id)}
                            disabled={syncMutation.isPending}
                          >
                            {syncMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                Syncing...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1" />
                                Sync
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLogout(account.id)}
                            disabled={logoutMutation.isPending}
                          >
                            <Unplug className="h-4 w-4 mr-1" />
                            Logout
                          </Button>
                        </>
                      )}
                      {/* Show Delete button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(account.id, account.displayName || account.phoneNumber || 'WhatsApp Account')}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingAccountId && (
        <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
          <QRConnectionDialog
            open={connectDialogOpen}
            onOpenChange={setConnectDialogOpen}
            accountId={pendingAccountId}
          />
        </Dialog>
      )}

      {/* Sync Options Dialog */}
      <Dialog open={!!syncDialogAccountId} onOpenChange={(open) => {
        if (!open) {
          setSyncDialogAccountId(null);
          setSyncPhoneNumbers("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync Chat History</DialogTitle>
            <DialogDescription>
              Enter phone numbers to sync specific WhatsApp chats
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phone-numbers-main">Phone Numbers</Label>
              <Textarea
                id="phone-numbers-main"
                placeholder="351912345678, 351987654321, 34612345678"
                value={syncPhoneNumbers}
                onChange={(e) => setSyncPhoneNumbers(e.target.value)}
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-sm text-muted-foreground">
                Enter comma-separated phone numbers (with country code, no + or spaces). 
                Example: 351912345678, 351987654321
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSyncDialogAccountId(null);
                setSyncPhoneNumbers("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (syncDialogAccountId) {
                  syncMutation.mutate({ accountId: syncDialogAccountId, phoneNumbersStr: syncPhoneNumbers });
                }
              }}
              disabled={syncMutation.isPending || !syncPhoneNumbers.trim()}
            >
              {syncMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Start Sync
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={!!logoutDialogAccountId} onOpenChange={(open) => !open && setLogoutDialogAccountId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Logout from WhatsApp Web</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to logout from this WhatsApp account? 
              You'll need to scan the QR code again to reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (logoutDialogAccountId) {
                  logoutMutation.mutate(logoutDialogAccountId);
                }
              }}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDialogAccountId} onOpenChange={(open) => {
        if (!open) {
          setDeleteDialogAccountId(null);
          setDeleteDialogAccountName("");
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete WhatsApp Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteDialogAccountName}"? 
              This action will permanently delete the account and all associated data. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteDialogAccountId) {
                  deleteMutation.mutate(deleteDialogAccountId);
                }
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

