import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useConversationMutations } from "@/hooks/useConversationMutations";
import { useAutoConversationTitle } from "@/hooks/useAutoConversationTitle";
import type { ConversationConfig } from "@/lib/conversations";
import { assistbuildConversationApi } from "@/lib/conversations";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Send,
  MessageSquare,
  ArrowLeft,
  AlertCircle,
  Database,
  Package,
  Plug,
  Bot,
  Workflow,
  FileText,
  Users,
  Building2,
  Settings as SettingsIcon,
  Sparkles,
  History,
  Plus,
  Paperclip,
  X,
  MoreVertical,
  Edit2,
  Trash2,
  Loader2,
  Tag,
  Wrench,
  FolderTree,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import AdminConnectorsConfig from "@/components/studio/AdminConnectorsConfig";
import CompanyConfigPanel from "@/components/studio/CompanyConfigPanel";
import ModulesConfigPanel from "@/components/studio/ModulesConfigPanel";
import ModuleConfigPage from "@/pages/studio/module-config";
import CodeBlock from "@/components/studio/CodeBlock";
import SafeMessageRenderer from "@/components/studio/SafeMessageRenderer";
import TenantStatePanel from "@/components/studio/TenantStatePanel";
import OrgStructurePanel from "@/components/studio/OrgStructurePanel";
import AuditTrailPanel from "@/components/studio/AuditTrailPanel";
import WorkflowsPanel from "@/components/studio/WorkflowsPanel";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { AIBlockedBanner } from "@/components/AIBlockedBanner";
import ErrorBoundary from "@/components/ErrorBoundary";

type ConfigOption =
  | "tenant-state"
  | "modules"
  | "connectors"
  | "agents"
  | "workflows"
  | "audit-trail"
  | "team"
  | "company";

const configOptions = [
  { id: "tenant-state" as ConfigOption, label: "Tenant State", icon: Database },
  { id: "modules" as ConfigOption, label: "Modules", icon: Package },
  { id: "connectors" as ConfigOption, label: "Connectors", icon: Plug },
  { id: "agents" as ConfigOption, label: "Agents", icon: Bot },
  { id: "workflows" as ConfigOption, label: "Workflows", icon: Workflow },
  { id: "audit-trail" as ConfigOption, label: "Audit Trail", icon: FileText },
  { id: "team" as ConfigOption, label: "Organization", icon: FolderTree },
  { id: "company" as ConfigOption, label: "Company", icon: Building2 },
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

export default function StudioPage() {
  const [selectedConfig, setSelectedConfig] =
    useState<ConfigOption>("tenant-state");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [showHistory, setShowHistory] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [editingConversation, setEditingConversation] =
    useState<Conversation | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newTags, setNewTags] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const manuallyCreatedRef = useRef(false); // Track manual conversation creation
  const isFirstMessageFlowRef = useRef(false); // Track if we're in "create conversation + send first message" flow
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  // Allowed file types for attachments
  const ALLOWED_FILE_TYPES = [
    ".csv",
    ".xlsx",
    ".xls",
    ".json",
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/json",
  ];

  // Detect if we're on a module config sub-route
  const [isModuleConfigRoute, moduleConfigParams] = useRoute("/studio/modules/:moduleId/config");
  const moduleIdFromRoute = moduleConfigParams?.moduleId;

  // When on module config route, force the selector to "modules"
  useEffect(() => {
    if (isModuleConfigRoute && selectedConfig !== "modules") {
      setSelectedConfig("modules");
    }
  }, [isModuleConfigRoute, selectedConfig]);

  // Refresh data when switching panels - invalidate relevant queries
  useEffect(() => {
    // Map panel to query keys that should be refreshed (must match actual queryKey arrays)
    const panelQueryKeys: Record<ConfigOption, string[]> = {
      "tenant-state": [
        "/api/auth/me",
        "/api/modules/available",
        "/api/executions/agents",
        "/api/admin/connectors",
        "/api/custom-tables",
        "/api/executions/stats",
      ],
      "modules": [
        "/api/modules/available",
        "/api/modules/tenant",
        "/api/modules/sidebar",
        "/api/modules",
        "/api/custom-tables",
      ],
      "connectors": ["/api/admin/connectors"],
      "agents": [],
      "workflows": [],
      "audit-trail": ["/api/org-structure/audit-logs"],
      "team": [
        "/api/org-structure",
        "/api/org-structure/departments",
        "/api/org-structure/users",
      ],
      "company": ["/api/company"],
    };

    const keysToInvalidate = panelQueryKeys[selectedConfig] || [];
    keysToInvalidate.forEach(key => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
  }, [selectedConfig]);

  // Check subscription and credit status
  const subscriptionStatus = useSubscriptionStatus();

  // AssistBuild conversation config
  const conversationConfig: ConversationConfig = {
    agentType: "assistbuild",
    queryKeyRoot: "/api/assistbuild/conversations",
    defaultTitle: "New Conversation",
  };

  // Load highlight.js theme CSS based on current theme
  useEffect(() => {
    const updateHighlightTheme = async () => {
      const isDark = document.documentElement.classList.contains("dark");
      let link = document.getElementById("highlight-theme") as HTMLLinkElement;

      if (!link) {
        link = document.createElement("link");
        link.id = "highlight-theme";
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }

      try {
        if (isDark) {
          const darkTheme = await import("highlight.js/styles/github-dark.css?url");
          link.href = darkTheme.default;
        } else {
          const lightTheme = await import("highlight.js/styles/github.css?url");
          link.href = lightTheme.default;
        }
      } catch (error) {
        console.warn("Failed to load highlight.js theme:", error);
      }
    };

    updateHighlightTheme();

    const observer = new MutationObserver(updateHighlightTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
      const link = document.getElementById("highlight-theme");
      if (link) link.remove();
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 240; // ~10 lines
      textarea.style.height = Math.min(scrollHeight, maxHeight) + "px";

      // Show scrollbar only when content exceeds max height
      textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
    }
  }, [message]);

  // Check AI availability - Studio uses Anthropic Claude Sonnet 4.5
  const { data: aiStatus } = useQuery<{ available: boolean; error?: string }>({
    queryKey: ["/api/ai/studio-status"],
    retry: false,
  });

  const isAIAvailable = aiStatus?.available ?? true;

  // Fetch user data
  const { data: userData, isLoading } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 0,
  });

  const user = userData?.user;
  const activeTenant = userData?.activeTenant;
  const isSandbox = activeTenant?.environment === "sandbox";

  // Redirect to settings if not in Sandbox mode
  useEffect(() => {
    if (!isLoading && !isSandbox && activeTenant) {
      setLocation("/settings");
    }
  }, [isLoading, isSandbox, activeTenant, setLocation]);

  // Use shared conversation mutations
  const {
    generateTitleMutation,
    renameMutation,
    updateTagsMutation,
    deleteConversationMutation,
    createConversationMutation,
  } = useConversationMutations(conversationConfig);

  // Wrapper for create conversation to handle local state
  const handleCreateConversation = async () => {
    // Mark as manually created to prevent auto-select from overriding
    manuallyCreatedRef.current = true;
    isFirstMessageFlowRef.current = false; // Reset first message flow flag

    // Simply reset local state to show welcome screen instantly
    // Actual conversation creation happens when user sends first message
    setConversationId(null);
    setMessages([]);
    setShowHistory(false);
  };

  // Wrapper for delete conversation
  const handleDeleteConversation = (
    id: string,
    hadMessages: boolean = false,
  ) => {
    deleteConversationMutation.mutate({ id, hadMessages });
    if (id === conversationId) {
      setConversationId(null);
      setMessages([]);
    }
  };

  // Handle selecting a conversation
  const handleSelectConversation = (id: string) => {
    manuallyCreatedRef.current = false; // Reset manual flag when selecting from history
    isFirstMessageFlowRef.current = false; // Reset first message flow flag
    setConversationId(id);
    setShowHistory(false);
  };

  // Handle toggling history view with cleanup
  const handleToggleHistory = () => {
    // Toggle state IMMEDIATELY for instant UI feedback (header + skeleton)
    const newShowHistory = !showHistory;
    setShowHistory(newShowHistory);

    // Only cleanup when OPENING history (not closing)
    if (newShowHistory && isSandbox) {
      // Fire-and-forget cleanup with robust error handling
      void fetch("/api/assistbuild/conversations/cleanup?minAgeMinutes=5", {
        method: "DELETE",
        credentials: "include",
      })
        .then(async (response) => {
          // Always invalidate queries if cleanup executed successfully
          if (response.ok) {
            queryClient.invalidateQueries({
              queryKey: [
                conversationConfig.queryKeyRoot,
                conversationConfig.agentType,
              ],
            });

            // Try to parse JSON for logging, but don't fail if unavailable
            const contentType = response.headers.get("content-type");
            if (contentType?.includes("application/json")) {
              try {
                const data = await response.json();
                if (data.deletedCount > 0) {
                  console.log(
                    `[STUDIO] History cleanup: removed ${data.deletedCount} empty conversations`,
                  );
                }
              } catch (parseErr) {
                console.warn(
                  "[STUDIO] Cleanup succeeded but JSON parse failed:",
                  parseErr,
                );
              }
            }
          } else {
            console.warn(
              `[STUDIO] Cleanup failed with status ${response.status}`,
            );
          }
        })
        .catch((err) => {
          console.error("[STUDIO] History cleanup error:", err);
        });
    }
  };

  // Load all AssistBuild conversations
  const {
    data: conversationsData,
    isLoading: loadingConversations,
    error: conversationsError,
  } = useQuery<
    { conversations: Conversation[]; total: number } | Conversation[]
  >({
    queryKey: [conversationConfig.queryKeyRoot, conversationConfig.agentType],
    queryFn: async () => {
      const result = await assistbuildConversationApi.fetchConversations();
      // API returns { conversations: [...], total: X } or just array
      return Array.isArray(result) ? result : result.conversations || [];
    },
    enabled: isSandbox,
    retry: false,
  });

  // Extract conversations array from response
  const conversations = Array.isArray(conversationsData)
    ? conversationsData
    : conversationsData?.conversations || [];

  // 🔧 DISABLED: Auto-generate title causes 404 errors for AssistBuild
  // useAutoConversationTitle({
  //   messages,
  //   conversations,
  //   conversationId,
  //   generateTitle: (id, isManual) => generateTitleMutation.mutate({ conversationId: id, isManual }),
  //   isStreaming,
  //   defaultTitle: conversationConfig.defaultTitle,
  // });


  // Fetch messages for the conversation
  const {
    data: fetchedMessages,
    isLoading: loadingMessages,
    isFetching: isFetchingMessages,
  } = useQuery<Message[]>({
    queryKey: [
      conversationConfig.queryKeyRoot,
      conversationConfig.agentType,
      conversationId,
      "messages",
    ],
    queryFn: () => {
      if (!conversationId) throw new Error("No conversation ID");
      return assistbuildConversationApi.fetchMessages(conversationId);
    },
    enabled: !!conversationId && isSandbox,
  });

  // Only show skeleton on initial load (isLoading is false during refetches when data exists)
  // BUT: Don't show skeleton when we're in the first message flow (conversation just created)
  const showMessagesSkeleton =
    loadingMessages && !isFirstMessageFlowRef.current;

  // Sync fetched messages with local state, but ONLY when:
  // 1. Not currently streaming (prevents overwriting optimistic updates)
  // 2. Not currently fetching (prevents race with stale data)
  // 3. Query has completed and returned fresh data
  useEffect(() => {
    if (fetchedMessages && !isStreaming && !isFetchingMessages) {
      // Use functional update to prevent race conditions
      setMessages(prev => {
        // Only update if messages actually changed
        if (JSON.stringify(prev) !== JSON.stringify(fetchedMessages)) {
          return fetchedMessages;
        }
        return prev;
      });
    }
  }, [fetchedMessages, isStreaming, isFetchingMessages]);

  // 🔧 FIX: Reset streaming state when switching conversations
  // This prevents the loading dots from appearing in all conversations
  // BUT: Don't reset when we just created a conversation and are sending first message
  useEffect(() => {
    if (!isFirstMessageFlowRef.current) {
      setIsStreaming(false);
      setIsCreatingConversation(false);
      setProgressMessage("");
    }
  }, [conversationId]);

  // 📡 Listen for realtime conversation updates (e.g., title generation)
  useEffect(() => {
    if (!isSandbox) return;

    const eventSource = new EventSource("/api/realtime", {
      withCredentials: true,
    });

    const handleConversationUpdated = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.event === "assistbuild:conversation:updated" &&
          data.conversation
        ) {
          console.log(
            "[STUDIO] Conversation updated via realtime:",
            data.conversation,
          );
          // Invalidate conversations list to refresh UI with new title
          queryClient.invalidateQueries({
            queryKey: [
              conversationConfig.queryKeyRoot,
              conversationConfig.agentType,
            ],
          });
        }
      } catch (err) {
        // Ignore parse errors
      }
    };

    eventSource.addEventListener("message", handleConversationUpdated);

    return () => {
      eventSource.removeEventListener("message", handleConversationUpdated);
      eventSource.close();
    };
  }, [
    isSandbox,
    conversationConfig.queryKeyRoot,
    conversationConfig.agentType,
  ]);

  // Auto-scroll to bottom only when messages are added (not when cleared for new conversation)
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "40px"; // Reset to min height
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(scrollHeight, 200) + "px";
    }
  }, [message]);

  // Handle file selection from input
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newFiles: File[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.toLowerCase().split('.').pop();

      // Validate file type
      const isValidType = ALLOWED_FILE_TYPES.some(type =>
        type.startsWith('.')
          ? file.name.toLowerCase().endsWith(type)
          : file.type === type
      );

      if (!isValidType) {
        errors.push(`${file.name}: Invalid file type. Allowed: CSV, Excel, JSON`);
        continue;
      }

      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        errors.push(`${file.name}: File too large (max 10MB)`);
        continue;
      }

      // Check total files limit (5)
      if (attachedFiles.length + newFiles.length >= 5) {
        errors.push(`Maximum 5 files allowed`);
        break;
      }

      newFiles.push(file);
    }

    if (errors.length > 0) {
      toast({
        title: "File Upload Warning",
        description: errors.join('\n'),
        variant: "destructive",
      });
    }

    if (newFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...newFiles]);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove attached file
  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Trigger file input click
  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  // Send message with SSE streaming
  const handleSendMessage = async () => {
    console.log("[STUDIO] handleSendMessage called", {
      message: message.trim(),
      conversationId,
      isStreaming,
      attachedFiles: attachedFiles.length,
    });

    if (!message.trim() && attachedFiles.length === 0) {
      console.log("[STUDIO] Early return: no message and no files");
      return;
    }

    // Check subscription and credits BEFORE sending
    if (!subscriptionStatus.canUseAI) {
      toast({
        title: subscriptionStatus.reason === 'no_subscription' ? 'Subscription Required' : 'Credits Depleted',
        description: subscriptionStatus.message,
        variant: 'destructive',
      });
      return;
    }

    // 🔓 REMOVED isAIAvailable check - let backend handle API key validation
    // Frontend should not block sends based on key availability probe

    const userMessage = message.trim();
    const filesToSend = [...attachedFiles];
    setMessage("");
    setAttachedFiles([]); // Clear files immediately

    // If no conversation exists, create one first
    let activeConversationId = conversationId;
    if (!activeConversationId) {
      console.log("[STUDIO] No conversation ID - creating conversation first");

      // Mark that we're in the first message flow
      isFirstMessageFlowRef.current = true;

      setIsCreatingConversation(true);
      setProgressMessage("💬 Starting a conversation");

      try {
        const data = await createConversationMutation.mutateAsync(
          userMessage ?? conversationConfig.defaultTitle,
        );
        activeConversationId = data.conversation.id;
        setConversationId(data.conversation.id);
        console.log("[STUDIO] Conversation created:", data.conversation.id);
      } catch (error) {
        console.error("[STUDIO] Failed to create conversation:", error);
        toast({
          title: "Failed to create conversation",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
        setIsCreatingConversation(false);
        setProgressMessage("");
        isFirstMessageFlowRef.current = false; // Reset flag on error
        return;
      } finally {
        setIsCreatingConversation(false);
      }
    }

    // Validate conversation ID before proceeding
    if (!activeConversationId) {
      console.error("[STUDIO] No valid conversation ID - cannot send message");
      toast({
        title: "Error",
        description: "No conversation ID available",
        variant: "destructive",
      });
      setProgressMessage("");
      return;
    }

    // Now add the user message and start streaming
    // Include file names in display if files are attached
    const displayContent = filesToSend.length > 0
      ? `${userMessage}\n\n📎 Attached: ${filesToSend.map(f => f.name).join(', ')}`
      : userMessage;

    const newUserMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayContent,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newUserMessage]);

    setIsStreaming(true);
    setProgressMessage(filesToSend.length > 0
      ? "📎 Uploading files and processing..."
      : "🤔 AssistBuild is thinking");
    setNewTitle(userMessage);

    console.log(
      "[STUDIO] About to POST to:",
      `/api/assistbuild/conversations/${activeConversationId}/messages`,
      `with ${filesToSend.length} files`,
    );

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      // Use FormData if files are attached, otherwise JSON
      let fetchOptions: RequestInit;

      if (filesToSend.length > 0) {
        const formData = new FormData();
        formData.append('content', userMessage);
        filesToSend.forEach(file => {
          formData.append('files', file);
        });

        fetchOptions = {
          method: "POST",
          body: formData,
          credentials: "include",
          // Don't set Content-Type - browser will set it with boundary for multipart
        };
      } else {
        fetchOptions = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: userMessage }),
          credentials: "include",
        };
      }

      const response = await fetch(
        `/api/assistbuild/conversations/${activeConversationId}/messages`,
        fetchOptions,
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let shouldStopStreaming = false;

      while (!shouldStopStreaming) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              // Clear progress message when done
              setProgressMessage("");
              isFirstMessageFlowRef.current = false; // Reset first message flow flag
              shouldStopStreaming = true;
              break;
            }
            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "error") {
                // Handle streaming error from backend
                console.error("[STUDIO] Streaming error:", parsed.error);
                toast({
                  title: "Error generating response",
                  description: parsed.error || "An unexpected error occurred",
                  variant: "destructive",
                });
                // Clear progress and stop streaming completely
                setProgressMessage("");
                isFirstMessageFlowRef.current = false; // Reset first message flow flag
                shouldStopStreaming = true;
                // Cancel the reader to close the stream immediately
                reader.cancel();
                break;
              } else if (parsed.type === "progress") {
                // Accumulate progress messages (like Replit Agent)
                setProgressMessage(parsed.content);
              } else if (parsed.type === "chunk" || parsed.content) {
                // Regular text chunk - append to assistant message
                const content = parsed.content;
                if (content) {
                  // Clear progress indicator when first content chunk arrives
                  setProgressMessage("");
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessage.id
                        ? { ...msg, content: msg.content + content }
                        : msg,
                    ),
                  );
                }
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      console.log("[STUDIO] POST completed successfully");

      // Stop streaming BEFORE invalidating cache to prevent race condition
      // This ensures the useEffect won't overwrite messages during refetch
      setIsStreaming(false);
      isFirstMessageFlowRef.current = false; // Reset first message flow flag

      // Invalidate messages cache to ensure persistence on reload
      queryClient.invalidateQueries({
        queryKey: [
          conversationConfig.queryKeyRoot,
          conversationConfig.agentType,
          activeConversationId,
          "messages",
        ],
      });
    } catch (error) {
      console.error("[STUDIO] POST error:", error);
      toast({
        title: "Failed to send message",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      isFirstMessageFlowRef.current = false; // Reset first message flow flag
    } finally {
      setIsStreaming(false);
      setProgressMessage("");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isSandbox) {
    return null;
  }

  const renderConfigContent = () => {
    switch (selectedConfig) {
      case "tenant-state":
        return <TenantStatePanel onSelectConfig={setSelectedConfig} />;

      case "modules":
        // If we're on a module config sub-route, render the module config page
        if (isModuleConfigRoute && moduleIdFromRoute) {
          return <ModuleConfigPage />;
        }
        return <ModulesConfigPanel />;

      case "connectors":
        return <AdminConnectorsConfig />;

      case "agents":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Agents
              </CardTitle>
              <CardDescription>
                Configure AI agents and their tools
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <p>Agent configuration coming soon...</p>
              </div>
            </CardContent>
          </Card>
        );

      case "workflows":
        return <WorkflowsPanel />;

      case "audit-trail":
        return <AuditTrailPanel />;

      case "team":
        return <OrgStructurePanel />;

      case "company":
        return <CompanyConfigPanel />;

      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-full overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* LEFT PANEL - Assist Build Chat */}
        <ResizablePanel
          defaultSize={35}
          minSize={20}
          maxSize={45}
          className="min-w-[300px]"
        >
          <div className="flex flex-col h-full border-r">
            {/* Chat Header */}
            <div className="p-4 border-b">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLocation("/dashboard")}
                  data-testid="button-back-to-dashboard"
                  className="h-9 w-9"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="p-2 rounded-lg bg-primary">
                  <Wrench className="h-5 w-5 text-primary-foreground" />
                </div>
                <h2 className="font-semibold text-base">
                  AssistBuild - Configurator
                </h2>
              </div>

              {!isAIAvailable && (
                <Alert
                  variant="destructive"
                  className="mt-3"
                  data-testid="alert-ai-not-configured"
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>AI Not Configured</AlertTitle>
                  <AlertDescription className="text-xs">
                    {aiStatus?.error || "Anthropic API key is not configured."}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Conversation Title - Always visible so user can create conversations */}
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleToggleHistory}
                data-testid="button-toggle-history"
              >
                {showHistory ? (
                  <ArrowLeft className="h-4 w-4" />
                ) : (
                  <History className="h-4 w-4" />
                )}
              </Button>
              <div className="flex-1 text-center">
                <span className="text-sm">
                  {showHistory
                    ? "Conversation History"
                    : messages.length === 0
                      ? "New Conversation"
                      : conversations?.find((c) => c.id === conversationId)
                        ?.title || "New Conversation"}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleCreateConversation()}
                data-testid="button-new-conversation"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages Area OR History List */}
            <ScrollArea className="flex-1 p-4">
              {showHistory ? (
                // History List
                <div className="space-y-2">
                  {loadingConversations ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))
                  ) : conversations?.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
                      <p>No conversations yet</p>
                    </div>
                  ) : (
                    conversations?.map((conv) => (
                      <Card
                        key={conv.id}
                        className={`p-3 hover-elevate cursor-pointer transition-all ${conversationId === conv.id
                          ? "border-primary bg-accent/50"
                          : ""
                          }`}
                        onClick={() => handleSelectConversation(conv.id)}
                        data-testid={`conversation-${conv.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h4 className="font-medium text-sm line-clamp-1">
                              {conv.title}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(conv.updatedAt).toLocaleDateString(
                                "pt-PT",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`button-menu-${conv.id}`}
                              >
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingConversation(conv);
                                  setNewTitle(conv.title);
                                  setRenameDialogOpen(true);
                                }}
                                data-testid={`menu-rename-${conv.id}`}
                              >
                                <Edit2 className="h-3 w-3 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  generateTitleMutation.mutate({
                                    conversationId: conv.id,
                                    isManual: true,
                                  });
                                }}
                                disabled={generateTitleMutation.isPending}
                                data-testid={`menu-generate-title-${conv.id}`}
                              >
                                {generateTitleMutation.isPending &&
                                  generateTitleMutation.variables
                                    ?.conversationId === conv.id ? (
                                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                ) : (
                                  <Sparkles className="h-3 w-3 mr-2" />
                                )}
                                Generate title with AI
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteConversation(conv.id, true);
                                }}
                                className="text-destructive"
                                data-testid={`menu-delete-${conv.id}`}
                              >
                                <Trash2 className="h-3 w-3 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              ) : isCreatingConversation ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-medium text-foreground/90">
                      A iniciar conversa
                    </p>
                    <div className="flex items-center gap-1">
                      <div
                        className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                        style={{
                          animationDelay: "0ms",
                          animationDuration: "1s",
                        }}
                      ></div>
                      <div
                        className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                        style={{
                          animationDelay: "150ms",
                          animationDuration: "1s",
                        }}
                      ></div>
                      <div
                        className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                        style={{
                          animationDelay: "300ms",
                          animationDuration: "1s",
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              ) : showMessagesSkeleton ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-center px-4 pt-20">
                  <div className="space-y-6">
                    <div className="flex justify-center">
                      <div className="p-6 rounded-full bg-primary/10">
                        <Sparkles className="h-16 w-16 text-primary" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-bold text-2xl">AssistBuild</h3>
                      <p className="text-base text-muted-foreground">
                        creates and configures features
                        <br />
                        conversationally
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <ErrorBoundary fallback={
                  <div className="text-center py-4 text-muted-foreground">
                    <p>Error rendering messages. Please refresh the page.</p>
                  </div>
                }>
                  <div className="space-y-3 w-full pl-[8px] pr-[8px]">
                    {messages.map((msg, index) => (
                      <div
                        key={`${msg.id}-${index}`}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        data-testid={`message-${msg.id}`}
                      >
                        {msg.role === "user" ? (
                          <div className="max-w-[85%] rounded-lg px-3 py-2 bg-primary text-primary-foreground break-words">
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">
                              {msg.content}
                            </p>
                          </div>
                        ) : (
                          <ErrorBoundary>
                            <SafeMessageRenderer
                              content={msg.content}
                              messageId={msg.id}
                              isStreaming={isStreaming}
                            />
                          </ErrorBoundary>
                        )}
                      </div>
                    ))}
                    {progressMessage && (
                      <div className="flex justify-start">
                        <div className="flex items-center gap-3">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          <p className="text-base font-medium text-foreground/90 flex gap-1">
                            {progressMessage}
                            <span className="flex items-center gap-1 px-1">
                              <span
                                className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                                style={{
                                  animationDelay: "0ms",
                                  animationDuration: "1s",
                                }}
                              ></span>
                              <span
                                className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                                style={{
                                  animationDelay: "150ms",
                                  animationDuration: "1s",
                                }}
                              ></span>
                              <span
                                className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                                style={{
                                  animationDelay: "300ms",
                                  animationDuration: "1s",
                                }}
                              ></span>
                            </span>
                          </p>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ErrorBoundary>
              )}
            </ScrollArea>

            {/* Input Area */}
            <>
              {/* AI Blocked Banner */}
              {!subscriptionStatus.canUseAI && !subscriptionStatus.isLoading && subscriptionStatus.reason && subscriptionStatus.message && subscriptionStatus.actionLabel && subscriptionStatus.actionPath && (
                <div className="m-2">
                  <AIBlockedBanner
                    reason={subscriptionStatus.reason}
                    message={subscriptionStatus.message}
                    actionLabel={subscriptionStatus.actionLabel}
                    actionPath={subscriptionStatus.actionPath}
                    creditBalance={subscriptionStatus.creditBalance}
                  />
                </div>
              )}

              <div className="m-2 rounded-lg border border-input hover:border-primary/40 focus-within:border-primary transition-colors duration-200 max-h-[280px] overflow-y-auto">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".csv,.xlsx,.xls,.json,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file"
                />

                {/* Attached files preview */}
                {attachedFiles.length > 0 && (
                  <div className="px-3 pt-2 flex flex-wrap gap-2">
                    {attachedFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1 text-xs"
                      >
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="max-w-[120px] truncate">{file.name}</span>
                        <span className="text-muted-foreground">
                          ({(file.size / 1024).toFixed(1)}KB)
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 hover:bg-destructive/20 rounded-full"
                          onClick={() => handleRemoveFile(index)}
                          data-testid={`button-remove-file-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={
                    !subscriptionStatus.canUseAI
                      ? "AI features unavailable"
                      : (attachedFiles.length > 0
                        ? "Describe what you want to do with the attached file(s)..."
                        : "Type a message...")
                  }
                  disabled={isStreaming || isCreatingConversation || !subscriptionStatus.canUseAI}
                  className="w-full text-sm min-h-[44px] resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-2 bg-transparent"
                  rows={1}
                  data-testid="input-message"
                />
                <div className="flex items-center px-2 pb-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 ${attachedFiles.length > 0 ? 'bg-primary/10 text-primary' : 'bg-muted hover:bg-muted/80'}`}
                    onClick={handleAttachClick}
                    disabled={!subscriptionStatus.canUseAI || isStreaming || isCreatingConversation || attachedFiles.length >= 5}
                    title="Attach files (CSV, Excel, JSON) - Max 5 files, 10MB each"
                    data-testid="button-attach"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  {attachedFiles.length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {attachedFiles.length} file{attachedFiles.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                  <div className="flex-1"></div>
                  <Button
                    onClick={handleSendMessage}
                    disabled={
                      !subscriptionStatus.canUseAI ||
                      (!message.trim() && attachedFiles.length === 0) ||
                      isStreaming ||
                      isCreatingConversation
                    }
                    size="icon"
                    className="h-8 w-8"
                    data-testid="button-send-message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT PANEL - Configuration */}
        <ResizablePanel defaultSize={65}>
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header with Dropdown */}
            <div className="border-b p-6 pt-[10px] pb-[10px]">
              <h1 className="font-bold text-[26px] mt-[-1px] mb-[-1px]">
                Configuration Studio
              </h1>
              <div className="flex items-center gap-3">
                <Label
                  htmlFor="config-selector"
                  className="text-sm font-medium whitespace-nowrap"
                >
                  Selecione a configuração:
                </Label>
                <Select
                  value={selectedConfig}
                  onValueChange={(value) =>
                    setSelectedConfig(value as ConfigOption)
                  }
                >
                  <SelectTrigger
                    id="config-selector"
                    className="flex h-9 items-center justify-between rounded-md border border-input bg-background px-3 py-2 ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 w-64 text-[13px] pl-[12px] pr-[12px] pt-[5px] pb-[5px] mt-[-1px] mb-[-1px]"
                    data-testid="select-config"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {configOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <SelectItem key={option.id} value={option.id}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <span>{option.label}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Config Content */}
            <ScrollArea className="flex-1">
              <div className="p-6">{renderConfigContent()}</div>
            </ScrollArea>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent data-testid="dialog-rename-conversation">
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
            <DialogDescription>
              Enter a new name for this conversation.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Conversation title"
            onKeyDown={(e) => {
              if (e.key === "Enter" && editingConversation && newTitle.trim()) {
                renameMutation.mutate({
                  id: editingConversation.id,
                  title: newTitle.trim(),
                });
                setRenameDialogOpen(false);
                setEditingConversation(null);
                setNewTitle("");
              }
            }}
            data-testid="input-conversation-title"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameDialogOpen(false);
                setEditingConversation(null);
                setNewTitle("");
              }}
              data-testid="button-cancel-rename"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingConversation && newTitle.trim()) {
                  renameMutation.mutate({
                    id: editingConversation.id,
                    title: newTitle.trim(),
                  });
                  setRenameDialogOpen(false);
                  setEditingConversation(null);
                  setNewTitle("");
                }
              }}
              disabled={!newTitle.trim() || renameMutation.isPending}
              data-testid="button-confirm-rename"
            >
              {renameMutation.isPending ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
