import { useMutation, UseMutationResult } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UseEntityMutationsOptions {
  apiEndpoint: string;
  queryKey: string[];
  entityNameSingular: string;
  entityNamePlural: string;
}

interface UseEntityMutationsReturn<T> {
  createMutation: UseMutationResult<T, Error, Partial<T>>;
  updateMutation: UseMutationResult<T, Error, { id: string; data: Partial<T> }>;
  deleteMutation: UseMutationResult<void, Error, string>;
  handleDelete: (id: string, entityName: string) => void;
}

/**
 * Generic hook for entity CRUD mutations
 * @template T - The entity type (Invoice, Bill, etc.)
 */
export function useEntityMutations<T = any>({
  apiEndpoint,
  queryKey,
  entityNameSingular,
  entityNamePlural,
}: UseEntityMutationsOptions): UseEntityMutationsReturn<T> {
  const { toast } = useToast();

  // Create mutation
  const createMutation = useMutation<T, Error, Partial<T>>({
    mutationFn: async (data: Partial<T>) => {
      return await apiRequest(apiEndpoint, 'POST', data) as T;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: `${entityNameSingular} criado com sucesso`,
        description: `O ${entityNameSingular.toLowerCase()} foi adicionado ao sistema.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: `Erro ao criar ${entityNameSingular.toLowerCase()}`,
        description: error.message || `Não foi possível criar o ${entityNameSingular.toLowerCase()}.`,
        variant: 'destructive',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation<T, Error, { id: string; data: Partial<T> }>({
    mutationFn: async ({ id, data }) => {
      return await apiRequest(`${apiEndpoint}/${id}`, 'PATCH', data) as T;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: `${entityNameSingular} atualizado com sucesso`,
        description: `O ${entityNameSingular.toLowerCase()} foi atualizado.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: `Erro ao atualizar ${entityNameSingular.toLowerCase()}`,
        description: error.message || `Não foi possível atualizar o ${entityNameSingular.toLowerCase()}.`,
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      await apiRequest(`${apiEndpoint}/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: `${entityNameSingular} apagado com sucesso`,
        description: `O ${entityNameSingular.toLowerCase()} foi removido do sistema.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: `Erro ao apagar ${entityNameSingular.toLowerCase()}`,
        description: error.message || `Não foi possível apagar o ${entityNameSingular.toLowerCase()}.`,
        variant: 'destructive',
      });
    },
  });

  // Delete handler with confirmation
  const handleDelete = (id: string, entityName: string) => {
    if (window.confirm(`Tem certeza que deseja apagar ${entityName}?`)) {
      deleteMutation.mutate(id);
    }
  };

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    handleDelete,
  };
}
