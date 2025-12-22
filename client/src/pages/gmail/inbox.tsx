import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import EmailInboxList from "@/components/comunicacoes/EmailInboxList";

export default function GmailInboxPage() {
  const { toast } = useToast();

  const syncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/gmail/messages/sync");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/messages"] });
      toast({ title: "Emails synced successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to sync emails",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="h-full overflow-auto p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gmail Inbox</h1>
          <p className="text-muted-foreground">
            Emails grouped by conversation thread
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          data-testid="button-sync-emails"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? "Syncing..." : "Sync Emails"}
        </Button>
      </div>

      <EmailInboxList 
        showHeader={false}
        emptyMessage="No emails in inbox. Sync your Gmail account to see messages."
      />
    </div>
  );
}
