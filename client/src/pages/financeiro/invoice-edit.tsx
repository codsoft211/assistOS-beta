import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";
import InvoiceForm from "./invoice-form";

export default function InvoiceEdit() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['/api/financeiro/invoices/' + id],
    queryFn: async () => {
      const data = await apiRequest(`/api/financeiro/invoices/${id}`);
      // Transform dates from ISO strings to Date objects
      return {
        ...data,
        issueDate: new Date(data.issueDate),
        dueDate: new Date(data.dueDate),
      };
    },
    enabled: !!id
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest(`/api/financeiro/invoices/${id}`, 'PATCH', {
        ...data,
        issueDate: data.issueDate.toISOString(),
        dueDate: data.dueDate.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/invoices/' + id] });
      toast({
        title: 'Fatura atualizada com sucesso',
        description: 'As alterações foram guardadas.',
      });
      setLocation('/financeiro/invoices');
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar fatura',
        description: error.message || 'Não foi possível atualizar a fatura.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = async (data: any) => {
    await updateMutation.mutateAsync(data);
  };

  const handleCancel = () => {
    setLocation('/financeiro/invoices');
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="page-invoice-edit-loading">
        <Skeleton className="h-12 w-64" />
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="p-6" data-testid="page-invoice-edit-error">
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">Fatura não encontrada</p>
            <p className="text-muted-foreground">
              A fatura solicitada não existe ou não está disponível.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-invoice-edit">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          Editar Fatura
        </h1>
        <p className="text-muted-foreground" data-testid="text-page-description">
          Fatura #{invoice.invoiceNumber}
        </p>
      </div>

      <InvoiceForm
        mode="edit"
        initialData={invoice}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={updateMutation.isPending}
      />
    </div>
  );
}
