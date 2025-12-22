import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  conversationApi,
  assistbuildConversationApi,
  ConversationConfig,
} from "@/lib/conversations";

export function useConversationMutations(config: ConversationConfig) {
  const { toast } = useToast();

  const api =
    config.agentType === "assistbuild"
      ? assistbuildConversationApi
      : conversationApi;

  // Helper to invalidate only queries for this specific agent
  const invalidateAgentQueries = () => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === config.queryKeyRoot &&
        query.queryKey[1] === config.agentType,
    });
  };

  const generateTitleMutation = useMutation({
    mutationFn: async ({
      conversationId,
      isManual,
    }: {
      conversationId: string;
      isManual?: boolean;
    }) => {
      const data = await api.generateTitle(conversationId);
      return { ...data, isManual };
    },
    onSuccess: (data) => {
      invalidateAgentQueries();

      if (data.isManual) {
        toast({
          title: "Título gerado!",
          description: `"${data.title}"`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao gerar título",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      return api.rename(id, title);
    },
    onSuccess: () => {
      invalidateAgentQueries();
      toast({
        title: "Conversa renomeada",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao renomear",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTagsMutation = useMutation({
    mutationFn: async ({ id, tags }: { id: string; tags: string[] }) => {
      return api.updateTags(id, tags);
    },
    onSuccess: () => {
      invalidateAgentQueries();
      queryClient.invalidateQueries({
        queryKey: [config.queryKeyRoot, config.agentType, "tags"],
      });
      toast({
        title: "Tags atualizadas",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar tags",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async ({
      id,
      hadMessages,
    }: {
      id: string;
      hadMessages?: boolean;
    }) => {
      await api.delete(id);
      return { hadMessages };
    },
    onSuccess: (data) => {
      invalidateAgentQueries();
      if (data.hadMessages) {
        toast({ title: "Conversa apagada" });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao apagar conversa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createConversationMutation = useMutation({
    mutationFn: async (title: string = config.defaultTitle) => {
      if (config.agentType === "assistbuild") {
        return assistbuildConversationApi.create(title);
      }
      return conversationApi.create(title, config.agentType);
    },
    onSuccess: (data) => {
      invalidateAgentQueries();
      return data;
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar conversa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    generateTitleMutation,
    renameMutation,
    updateTagsMutation,
    deleteConversationMutation,
    createConversationMutation,
  };
}
