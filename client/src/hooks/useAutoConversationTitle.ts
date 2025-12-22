import { useEffect, useRef } from "react";

interface Message {
  id: string;
  role: string;
  content: string;
}

interface Conversation {
  id: string;
  title: string;
}

interface UseAutoConversationTitleProps {
  messages: Message[];
  conversations: Conversation[] | undefined;
  conversationId: string | null;
  generateTitle: (conversationId: string, isManual: boolean) => void;
  isStreaming: boolean;
  defaultTitle: string;
}

export function useAutoConversationTitle({
  messages,
  conversations,
  conversationId,
  generateTitle,
  isStreaming,
  defaultTitle,
}: UseAutoConversationTitleProps) {
  const hasGeneratedRef = useRef(false);

  useEffect(() => {
    if (!conversationId || !conversations || isStreaming || hasGeneratedRef.current) {
      return;
    }

    const conversation = conversations.find(c => c.id === conversationId);
    
    if (!conversation || conversation.title !== defaultTitle) {
      return;
    }

    const hasUserMessage = messages.some(m => m.role === "user");
    const hasAssistantMessage = messages.some(m => m.role === "assistant");

    if (hasUserMessage && hasAssistantMessage) {
      hasGeneratedRef.current = true;
      generateTitle(conversationId, false);
    }
  }, [messages, conversations, conversationId, generateTitle, isStreaming]);

  useEffect(() => {
    if (conversationId) {
      hasGeneratedRef.current = false;
    }
  }, [conversationId]);
}
