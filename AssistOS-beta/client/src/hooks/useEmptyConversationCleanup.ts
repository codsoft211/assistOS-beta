import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

interface Message {
  id: string;
  role: string;
  content: string;
}

interface UseEmptyConversationCleanupProps {
  selectedConversationId: string | null;
  localMessages: Message[];
  deleteConversation: (id: string, hadMessages: boolean) => void;
  queryKeyRoot: string;
  agentType: string;
}

export function useEmptyConversationCleanup({
  selectedConversationId,
  localMessages,
  deleteConversation,
  queryKeyRoot,
  agentType,
}: UseEmptyConversationCleanupProps) {
  const previousConversationIdRef = useRef<string | null>(null);
  const skipAutoDeleteRef = useRef(false);

  useEffect(() => {
    const previousId = previousConversationIdRef.current;
    
    if (previousId && previousId !== selectedConversationId && !skipAutoDeleteRef.current) {
      // Check messages from React Query cache for the PREVIOUS conversation
      const cachedMessages = queryClient.getQueryData<Message[]>([
        queryKeyRoot,
        agentType,
        previousId,
        "messages"
      ]);
      
      // Only delete if conversation has NO messages in cache
      const isEmpty = !cachedMessages || cachedMessages.length === 0;
      
      if (isEmpty) {
        deleteConversation(previousId, false);
      }
    }
    
    skipAutoDeleteRef.current = false;
    previousConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId, deleteConversation, queryKeyRoot, agentType]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (selectedConversationId && !skipAutoDeleteRef.current) {
        // Check messages from React Query cache for current conversation
        const cachedMessages = queryClient.getQueryData<Message[]>([
          queryKeyRoot,
          agentType,
          selectedConversationId,
          "messages"
        ]);
        
        // Only delete if conversation has NO messages in cache
        const isEmpty = !cachedMessages || cachedMessages.length === 0;
        
        if (isEmpty) {
          fetch(`/api/conversations/${selectedConversationId}`, {
            method: 'DELETE',
            credentials: 'include',
            keepalive: true,
          }).catch(() => {});
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [selectedConversationId, queryKeyRoot, agentType]);

  return { skipAutoDeleteRef };
}
