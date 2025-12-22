import { useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

interface AIResponseEvent {
  conversationId: string;
  messageId?: string;
  responsePreview?: string;
  messagePreview?: string;
  error?: string;
  timestamp: string;
  clientName?: string;
  isAutomationNotification?: boolean;
  isNewNotification?: boolean; // True when a new automation notification is created (not a completion)
}

export function useAINotifications() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const activeConversationsRef = useRef<Set<string>>(new Set());

  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  const handleAICompleted = useCallback(
    (data: AIResponseEvent) => {
      const isOnChatPage = location.startsWith("/chat");
      const isViewingThisConversation =
        isOnChatPage && location.includes(data.conversationId);

      console.log("[AI Notifications] handleAICompleted called:", {
        isOnChatPage,
        isViewingThisConversation,
        conversationId: data.conversationId,
        isAutomationNotification: data.isAutomationNotification,
        isNewNotification: data.isNewNotification,
        clientName: data.clientName,
      });
      
      if (!isViewingThisConversation) {
        // For new automation notifications (when WhatsApp message arrives), show "1 message from {clientName}"
        if (data.isAutomationNotification && data.isNewNotification && data.clientName) {
          console.log("[AI Notifications] Showing toast for new automation notification:", data.clientName);
          toast({
            title: "1 message from " + data.clientName,
            description: "New WhatsApp message received",
            duration: 5000,
            action: (
              <button
                onClick={() => {
                  // Debounce invalidations to prevent database pool exhaustion
                  setTimeout(() => {
                    // Invalidate conversations query to ensure the conversation appears in the list
                    queryClient.invalidateQueries({
                      predicate: (query) => {
                        const queryKey = query.queryKey as string[];
                        return queryKey[0] === "/api/conversations" && !queryKey.includes("messages");
                      },
                    });
                    // Invalidate messages query with delay to prevent pool exhaustion
                    setTimeout(() => {
                      queryClient.invalidateQueries({
                        queryKey: ["/api/conversations", data.conversationId, "messages"],
                      });
                    }, 100);
                  }, 100);
                  // Navigate to the conversation
                  setLocation(`/chat?id=${data.conversationId}`);
                }}
                className="text-primary hover:underline text-sm font-medium"
                data-testid="notification-view-message"
              >
                Ver mensagem
              </button>
            ),
          });
        } else if (data.isAutomationNotification && data.clientName && !data.isNewNotification) {
          // For automation notification completions, DON'T show "1 message from {clientName}"
          // Only show regular "AssistME respondeu" notification
          const preview = data.responsePreview
            ? data.responsePreview.length > 100
              ? data.responsePreview.substring(0, 100) + "..."
              : data.responsePreview
            : "Resposta pronta";

          toast({
            title: "AssistME respondeu",
            description: preview,
            duration: 5000,
            action: (
              <button
                onClick={() => {
                  // Debounce invalidations to prevent database pool exhaustion
                  setTimeout(() => {
                    // Invalidate conversations query to ensure the conversation appears in the list
                    queryClient.invalidateQueries({
                      predicate: (query) => {
                        const queryKey = query.queryKey as string[];
                        return queryKey[0] === "/api/conversations" && !queryKey.includes("messages");
                      },
                    });
                    // Invalidate messages query with delay to prevent pool exhaustion
                    setTimeout(() => {
                      queryClient.invalidateQueries({
                        queryKey: ["/api/conversations", data.conversationId, "messages"],
                      });
                    }, 100);
                  }, 100);
                  // Navigate to the conversation
                  setLocation(`/chat?id=${data.conversationId}`);
                }}
                className="text-primary hover:underline text-sm font-medium"
                data-testid="notification-view-response"
              >
                Ver resposta
              </button>
            ),
          });
        } else {
          // For regular notifications, show response preview
          const preview = data.responsePreview
            ? data.responsePreview.length > 100
              ? data.responsePreview.substring(0, 100) + "..."
              : data.responsePreview
            : "Resposta pronta";

          toast({
            title: "AssistME respondeu",
            description: preview,
            duration: 5000,
            action: (
              <button
                onClick={() => {
                  // Debounce invalidations to prevent database pool exhaustion
                  setTimeout(() => {
                    // Invalidate conversations query to ensure the conversation appears in the list
                    queryClient.invalidateQueries({
                      predicate: (query) => {
                        const queryKey = query.queryKey as string[];
                        return queryKey[0] === "/api/conversations" && !queryKey.includes("messages");
                      },
                    });
                    // Invalidate messages query with delay to prevent pool exhaustion
                    setTimeout(() => {
                      queryClient.invalidateQueries({
                        queryKey: ["/api/conversations", data.conversationId, "messages"],
                      });
                    }, 100);
                  }, 100);
                  // Navigate to the conversation
                  setLocation(`/chat?id=${data.conversationId}`);
                }}
                className="text-primary hover:underline text-sm font-medium"
                data-testid="notification-view-response"
              >
                Ver resposta
              </button>
            ),
          });
        }
      }

      activeConversationsRef.current.delete(data.conversationId);
    },
    [location, toast, setLocation, queryClient],
  );

  const handleAIError = useCallback(
    (data: AIResponseEvent) => {
      const isOnChatPage = location.startsWith("/chat");
      const isViewingThisConversation =
        isOnChatPage && location.includes(data.conversationId);

      if (!isViewingThisConversation) {
        toast({
          title: "Erro na resposta",
          description: data.error || "Ocorreu um erro ao gerar a resposta",
          variant: "destructive",
          duration: 5000,
        });
      }

      activeConversationsRef.current.delete(data.conversationId);
    },
    [location, toast],
  );

  const handleAIStarted = useCallback((data: AIResponseEvent) => {
    activeConversationsRef.current.add(data.conversationId);
    console.log("[AI Notifications] AI response started:", data.conversationId);
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const connectSSE = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource("/api/realtime/stream", {
        withCredentials: true,
      });

      eventSource.addEventListener("ai.response.started", (event) => {
        try {
          const data = JSON.parse(event.data);
          handleAIStarted(data);
        } catch (e) {
          console.error(
            "[AI Notifications] Failed to parse started event:",
            e,
          );
        }
      });

      eventSource.addEventListener("ai.response.completed", (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[AI Notifications] AI response completed:", data);
          console.log("[AI Notifications] Event payload details:", {
            conversationId: data.conversationId,
            messageId: data.messageId,
            clientName: data.clientName,
            isAutomationNotification: data.isAutomationNotification,
            isNewNotification: data.isNewNotification,
            hasRequiredFields: !!(data.isAutomationNotification && data.isNewNotification && data.clientName),
          });
          // Debounce the handler to prevent immediate query invalidations that cause database pool exhaustion
          setTimeout(() => {
            handleAICompleted(data);
          }, 200);
        } catch (e) {
          console.error(
            "[AI Notifications] Failed to parse completed event:",
            e,
          );
          console.error("[AI Notifications] Raw event data:", event.data);
        }
      });

      eventSource.addEventListener("ai.response.error", (event) => {
        try {
          const data = JSON.parse(event.data);
          handleAIError(data);
        } catch (e) {
          console.error("[AI Notifications] Failed to parse error event:", e);
        }
      });

      eventSource.onerror = () => {
        console.log(
          "[AI Notifications] SSE connection error - EventSource will auto-reconnect",
        );
        // Don't close - let EventSource auto-reconnect with credentials
        // Manual reconnect creates new connection without session cookies
      };

      eventSourceRef.current = eventSource;
      console.log("[AI Notifications] Connected to SSE stream");
    };

    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        console.log("[AI Notifications] Disconnected from SSE stream");
      }
    };
  }, [user, handleAIStarted, handleAICompleted, handleAIError]);

  return {
    activeConversations: activeConversationsRef.current,
  };
}
