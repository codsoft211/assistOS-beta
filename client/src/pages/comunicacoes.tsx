import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, RefreshCw, Settings, Inbox, AlertCircle, MessageCircle } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import EmailInboxList from "@/components/comunicacoes/EmailInboxList";
import WhatsAppConversationsList from "@/components/comunicacoes/WhatsAppConversationsList";

interface GmailAccount {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  isPrimary: boolean;
}

interface WhatsAppAccount {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  isActive: boolean;
  isPrimary: boolean;
}

export default function ComunicacoesPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Parse URL search params for tab state
  const searchParams = new URLSearchParams(window.location.search);
  const urlTab = searchParams.get('tab') || 'email';
  const [activeTab, setActiveTab] = useState<string>(urlTab);

  // Update URL when tab changes
  useEffect(() => {
    const newSearchParams = new URLSearchParams(window.location.search);
    if (activeTab !== newSearchParams.get('tab')) {
      newSearchParams.set('tab', activeTab);
      const newUrl = `${window.location.pathname}?${newSearchParams.toString()}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [activeTab]);

  // Sync activeTab with URL changes (for back/forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab') || 'email';
      setActiveTab(tab);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // ==================== GMAIL ACCOUNTS ====================
  const { data: gmailAccountsData } = useQuery<{ accounts: GmailAccount[] }>({
    queryKey: ['/api/gmail/accounts'],
  });

  const syncEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/gmail/messages/sync');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/gmail/messages'] });
      toast({
        title: "Sincronização concluída",
        description: `${data.totalSynced} novo(s) email(s) sincronizado(s).`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro na sincronização",
        description: error.message || "Falha ao sincronizar emails.",
        variant: "destructive",
      });
    },
  });

  // ==================== WHATSAPP ACCOUNTS ====================
  const { data: whatsappAccountsData } = useQuery<{ accounts: WhatsAppAccount[] }>({
    queryKey: ['/api/whatsapp/accounts'],
  });

  // ==================== HANDLERS ====================
  const handleEmailSync = () => {
    syncEmailMutation.mutate();
  };

  const handleGoToSettings = () => {
    setLocation('/settings?tab=comunicacao');
  };

  const handleGoToWhatsAppSettings = () => {
    setLocation('/whatsapp/settings');
  };

  const handleConversationClick = (conversationId: string) => {
    setLocation(`/whatsapp/inbox?conversation=${conversationId}`);
  };

  // ==================== DERIVED DATA ====================
  const activeGmailAccount = gmailAccountsData?.accounts?.find(acc => acc.isPrimary) || gmailAccountsData?.accounts?.[0];
  const activeWhatsAppAccount = whatsappAccountsData?.accounts?.find(acc => acc.isPrimary) || whatsappAccountsData?.accounts?.[0];
  
  const hasNoGmailAccounts = gmailAccountsData && gmailAccountsData.accounts.length === 0;
  const hasNoWhatsAppAccounts = whatsappAccountsData && whatsappAccountsData.accounts.length === 0;

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-comunicacoes-title">
            <Inbox className="h-8 w-8" />
            Caixa de Entrada
          </h2>
          <p className="text-muted-foreground mt-1" data-testid="text-comunicacoes-description">
            {activeTab === 'email' ? (
              activeGmailAccount ? (
                <span data-testid="text-active-gmail-account">
                  Emails de <span className="font-medium">{activeGmailAccount.email}</span>
                </span>
              ) : (
                "Configure sua conta Gmail para começar"
              )
            ) : (
              activeWhatsAppAccount ? (
                <span data-testid="text-active-whatsapp-account">
                  WhatsApp de <span className="font-medium">{activeWhatsAppAccount.phoneNumber}</span>
                </span>
              ) : (
                "Configure sua conta WhatsApp para começar"
              )
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'email' ? (
            <>
              <Button
                variant="outline"
                onClick={handleGoToSettings}
                data-testid="button-email-settings"
              >
                <Settings className="h-4 w-4 mr-2" />
                Configurações
              </Button>
              <Button
                onClick={handleEmailSync}
                disabled={syncEmailMutation.isPending || hasNoGmailAccounts}
                data-testid="button-email-sync"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${syncEmailMutation.isPending ? 'animate-spin' : ''}`} />
                Sincronizar
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={handleGoToWhatsAppSettings}
              data-testid="button-whatsapp-settings"
            >
              <Settings className="h-4 w-4 mr-2" />
              Configurações WhatsApp
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2" data-testid="tabs-list">
          <TabsTrigger value="email" data-testid="tab-trigger-email">
            <Mail className="h-4 w-4 mr-2" />
            Email
          </TabsTrigger>
          <TabsTrigger value="whatsapp" data-testid="tab-trigger-whatsapp">
            <MessageCircle className="h-4 w-4 mr-2" />
            WhatsApp
          </TabsTrigger>
        </TabsList>

        {/* Email Tab Content */}
        <TabsContent value="email" data-testid="tab-content-email">
          {/* No Gmail account alert */}
          {hasNoGmailAccounts && (
            <Alert data-testid="alert-no-gmail-account">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Nenhuma conta Gmail conectada. Por favor, conecte uma conta Gmail nas{' '}
                <button
                  onClick={handleGoToSettings}
                  className="underline font-medium hover:text-primary"
                  data-testid="link-email-settings-inline"
                >
                  configurações
                </button>
                .
              </AlertDescription>
            </Alert>
          )}

          {/* Email List */}
          <EmailInboxList 
            emptyMessage={hasNoGmailAccounts 
              ? "Conecte uma conta Gmail para começar a receber emails."
              : "Clique em 'Sincronizar' para buscar novos emails."}
          />
        </TabsContent>

        {/* WhatsApp Tab Content */}
        <TabsContent value="whatsapp" data-testid="tab-content-whatsapp">
          {/* No WhatsApp account alert */}
          {hasNoWhatsAppAccounts && (
            <Alert data-testid="alert-no-whatsapp-account">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Nenhuma conta WhatsApp conectada. Por favor, conecte uma conta WhatsApp nas{' '}
                <button
                  onClick={handleGoToWhatsAppSettings}
                  className="underline font-medium hover:text-primary"
                  data-testid="link-whatsapp-settings-inline"
                >
                  configurações
                </button>
                .
              </AlertDescription>
            </Alert>
          )}

          {/* WhatsApp Conversations List */}
          <WhatsAppConversationsList 
            onConversationClick={handleConversationClick}
            emptyMessage={hasNoWhatsAppAccounts
              ? "Conecte uma conta WhatsApp para começar a receber mensagens."
              : "Suas conversas do WhatsApp aparecerão aqui"}
            locale={ptBR}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
