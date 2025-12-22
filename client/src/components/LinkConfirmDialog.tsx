import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Calendar, 
  FileText, 
  Receipt,
  Info
} from "lucide-react";

interface LinkConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkType: 'activities' | 'invoices' | 'bills';
  moduleId: string;
}

const linkConfigs = {
  activities: {
    title: "Adicionar Atividades (CRM)",
    description: "Esta página mostrará atividades do CRM relacionadas a este projeto",
    icon: Calendar,
    sourceModule: "CRM",
    message: "Ao confirmar, será criada uma página que lista atividades (reuniões, calls, emails) do CRM que estão vinculadas a este projeto."
  },
  invoices: {
    title: "Adicionar Faturas (Financial)",
    description: "Esta página mostrará faturas emitidas relacionadas a este projeto",
    icon: FileText,
    sourceModule: "Financial (AR)",
    message: "Ao confirmar, será criada uma página que lista faturas de clientes (Accounts Receivable) vinculadas a este projeto."
  },
  bills: {
    title: "Adicionar Despesas (Financial)",
    description: "Esta página mostrará despesas e contas a pagar relacionadas a este projeto",
    icon: Receipt,
    sourceModule: "Financial (AP)",
    message: "Ao confirmar, será criada uma página que lista despesas e bills de fornecedores (Accounts Payable) vinculados a este projeto."
  },
};

export default function LinkConfirmDialog({ 
  open, 
  onOpenChange, 
  linkType,
  moduleId 
}: LinkConfirmDialogProps) {
  const { toast } = useToast();
  const config = linkConfigs[linkType];

  const createLinkMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/modules/${moduleId}/entities`, {
        entityName: `project_${linkType}`,
        displayName: config.title,
        description: config.description,
        isIntegration: true,
        integrationSource: config.sourceModule,
        metadata: {
          linkType,
          sourceModule: config.sourceModule,
          createdAt: new Date().toISOString(),
        }
      });
    },
    onSuccess: () => {
      // Hardcode 'projects' to match ProjectsConfigPanel query keys exactly
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'sandbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'production'] });
      toast({
        title: "Página criada!",
        description: `A página de ${config.title} foi adicionada com sucesso.`,
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao criar página de integração.",
        variant: "destructive",
      });
    },
  });

  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid={`dialog-link-${linkType}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {config.title}
          </DialogTitle>
          <DialogDescription>
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <Alert data-testid="alert-link-info">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            {config.message}
          </AlertDescription>
        </Alert>

        <div className="text-sm text-muted-foreground">
          <p><strong>Módulo de origem:</strong> {config.sourceModule}</p>
          <p className="mt-2">
            Esta é uma vista integrada - os dados vêm do módulo {config.sourceModule} e são apenas filtrados por projeto.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
          >
            Cancelar
          </Button>
          <Button
            onClick={() => createLinkMutation.mutate()}
            disabled={createLinkMutation.isPending}
            data-testid="button-confirm"
          >
            {createLinkMutation.isPending ? "A criar..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
