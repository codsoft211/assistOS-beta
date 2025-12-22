import { useState, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Send,
  Sparkles,
  User,
  Settings as SettingsIcon,
  Building2,
  Users,
  Plus,
  MessageSquare,
  ArrowLeft,
  Plug,
  Code,
  Paperclip,
  Database,
} from "lucide-react";
import { PerfilSettings } from "@/components/settings/sections/PerfilSettings";
import { PreferenciasSettings } from "@/components/settings/sections/PreferenciasSettings";
import { OrganizacaoSettings } from "@/components/settings/sections/OrganizacaoSettings";
import { TeamSettings } from "@/components/settings/sections/TeamSettings";
import { MasterDataSettings } from "@/components/settings/sections/MasterDataSettings";
import UserConnectorsSettings from "@/components/UserConnectorsSettings";
import { useLiveSettings } from "@/components/settings/hooks/useLiveSettings";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { AIBlockedBanner } from "@/components/AIBlockedBanner";
import { CommunicationSettings } from "@/components/settings/sections/CommunicationSettings";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  metadata?: {
    settingCategory?: string;
  };
  updatedAt: string;
}

type SettingsTab =
  | "profile"
  | "preferences"
  | "communication"
  | "connectors"
  | "organization"
  | "team"
  | "master-data";

interface TabConfig {
  value: SettingsTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const TAB_CONFIG: TabConfig[] = [
  { value: "profile", label: "Profile", icon: User },
  { value: "preferences", label: "Preferences", icon: SettingsIcon },
  { value: "communication", label: "Communication", icon: MessageSquare },
  { value: "connectors", label: "Connectors", icon: Plug },
  { value: "organization", label: "Organization", icon: Building2 },
  { value: "team", label: "Team", icon: Users, adminOnly: true },
  { value: "master-data", label: "Dados Mestres", icon: Database, adminOnly: true },
];

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [showConversations, setShowConversations] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Real-time settings sync via SSE
  useLiveSettings();
  
  // Check subscription and credit status
  const subscriptionStatus = useSubscriptionStatus();

  // Check AI availability
  const { data: aiStatus } = useQuery<{ available: boolean; error?: string }>({
    queryKey: ["/api/ai/status"],
    retry: false,
  });

  const isAIAvailable = aiStatus?.available ?? true;

  // Fetch user data
  const { data: userData } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 0,
  });

  const user = userData?.user;
  // FIX: Use activeTenant.role instead of tenantMemberships (which doesn't exist in API response)
  const userRole = userData?.activeTenant?.role;

  // Debug logging for role detection
  console.log('[Settings Page] User data:', {
    hasUser: !!user,
    userData,
    tenantMemberships: user?.tenantMemberships,
    userRole,
    activeTenant: userData?.activeTenant,
    activeTenantRole: userData?.activeTenant?.role,
  });

  // Filter tabs based on user role
  const visibleTabs = TAB_CONFIG.filter((tab) => {
    if (tab.adminOnly) {
      const hasAccess = userRole === "owner" || userRole === "admin";
      console.log(`[Settings Page] Tab "${tab.label}" (${tab.value}):`, {
        adminOnly: tab.adminOnly,
        userRole,
        hasAccess,
      });
      return hasAccess;
    }
    return true;
  });

  console.log('[Settings Page] Visible tabs:', {
    totalTabs: TAB_CONFIG.length,
    visibleTabsCount: visibleTabs.length,
    visibleTabs: visibleTabs.map(t => t.value),
    allTabs: TAB_CONFIG.map(t => ({ value: t.value, adminOnly: t.adminOnly })),
  });

  // Fetch conversations
  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ["/api/assistsettings/conversations"],
  });

  // Fetch messages for selected conversation
  const { data: fetchedMessages } = useQuery<Message[]>({
    queryKey: ["/api/assistsettings/conversations", conversationId, "messages"],
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (fetchedMessages) {
      setMessages(fetchedMessages);
    }
  }, [fetchedMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "40px";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(scrollHeight, 200) + "px";
    }
  }, [message]);

  // Create new conversation
  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/assistsettings/conversations",
        {
          title: "Settings Conversation",
        },
      );
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/assistsettings/conversations"],
      });
      setConversationId(data.id);
      setMessages([]);
      setShowConversations(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create conversation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Send message with SSE streaming
  const handleSendMessage = async () => {
    if (!message.trim() || !conversationId) return;
    
    // Check subscription and credits BEFORE sending
    if (!subscriptionStatus.canUseAI) {
      toast({
        title: subscriptionStatus.reason === 'no_subscription' ? 'Subscription Required' : 'Credits Depleted',
        description: subscriptionStatus.message,
        variant: 'destructive',
      });
      return;
    }
    
    if (!isAIAvailable) {
      toast({
        title: "AI Not Available",
        description: "OpenAI API key is not configured.",
        variant: "destructive",
      });
      return;
    }

    const userMessage = message.trim();
    setMessage("");
    setIsStreaming(true);

    const newUserMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newUserMessage]);

    // Don't add empty assistant message - use progressMessage instead
    let assistantMessageId: string | null = null;

    try {
      // Show thinking indicator initially - use flushSync to force render
      console.log(
        "[AssistSettings] Setting progress message: AssistSettings is thinking...",
      );
      flushSync(() => {
        setProgressMessage("AssistSettings is thinking");
      });

      const response = await fetch(
        `/api/assistsettings/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: userMessage }),
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEventType = "";
      let assistantContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          if (line.startsWith("event: ")) {
            currentEventType = line.slice(7).trim();
            continue;
          }

          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              setProgressMessage("");
              currentEventType = "";
              continue;
            }

            try {
              const parsed = JSON.parse(data);

              // Handle different message types from backend
              if (parsed.type === "progress" && parsed.content) {
                console.log(
                  "[AssistSettings] Progress update:",
                  parsed.content,
                );
                setProgressMessage(parsed.content);
                // flushSync(() => {
                //   setProgressMessage(parsed.content);
                // });
              } else if (parsed.type === "chunk" && parsed.content) {
                assistantContent += parsed.content;

                // Create assistant message on first chunk if not exists
                if (!assistantMessageId) {
                  console.log(
                    "[AssistSettings] First chunk received, creating assistant message",
                    parsed.content,
                  );
                  assistantMessageId = crypto.randomUUID();
                  // flushSync(() => {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: assistantMessageId!,
                      role: "assistant",
                      content: assistantContent,
                      createdAt: new Date().toISOString(),
                    },
                  ]);
                  console.log(
                    "[AssistSettings] Clearing progress messageeeeeeeeee",
                  );
                  // setProgressMessage(""); // Clear thinking indicator once content starts
                  // });
                } else {
                  // Update existing assistant message
                  console.log(
                    "[AssistSettings] stream assistant message",
                    parsed.content,
                  );
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: assistantContent }
                        : msg,
                    ),
                  );
                }
              } else if (parsed.type === "content" && parsed.text) {
                assistantContent += parsed.text;

                // Create assistant message on first chunk if not exists
                if (!assistantMessageId) {
                  assistantMessageId = crypto.randomUUID();
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: assistantMessageId!,
                      role: "assistant",
                      content: assistantContent,
                      createdAt: new Date().toISOString(),
                    },
                  ]);
                  // setProgressMessage(""); // Clear thinking indicator once content starts
                } else {
                  // Update existing assistant message
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: assistantContent }
                        : msg,
                    ),
                  );
                }
              } else if (parsed.type === "done") {
                // Backend has saved the assistant message
                // Update local state with the saved message if provided
                if (parsed.message) {
                  setMessages((prev) => {
                    if (assistantMessageId) {
                      const existingIndex = prev.findIndex(
                        (msg) => msg.id === assistantMessageId,
                      );
                      if (existingIndex !== -1) {
                        // Replace the optimistic message with the real one
                        const updated = [...prev];
                        updated[existingIndex] = {
                          id: parsed.message.id,
                          role: "assistant",
                          content: parsed.message.content || assistantContent,
                          createdAt:
                            parsed.message.createdAt ||
                            new Date().toISOString(),
                        };
                        return updated;
                      }
                    }
                    // Append if not found
                    return [
                      ...prev,
                      {
                        id: parsed.message.id,
                        role: "assistant",
                        content: parsed.message.content || assistantContent,
                        createdAt:
                          parsed.message.createdAt || new Date().toISOString(),
                      },
                    ];
                  });
                }
                setProgressMessage("");
              } else if (parsed.type === "error") {
                // Remove the optimistic assistant message on error if exists
                if (assistantMessageId) {
                  setMessages((prev) =>
                    prev.filter((msg) => msg.id !== assistantMessageId),
                  );
                }
                throw new Error(parsed.error || "Unknown error");
              }

              currentEventType = "";
            } catch (e) {
              console.error("[SSE Parse Error]", e, line);
              currentEventType = "";
            }
          }
        }
      }

      queryClient.invalidateQueries({
        queryKey: [
          "/api/assistsettings/conversations",
          conversationId,
          "messages",
        ],
      });
    } catch (error) {
      // Remove optimistic assistant message on error if exists
      if (assistantMessageId) {
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== assistantMessageId),
        );
      }

      toast({
        title: "Failed to send message",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });

      // Still invalidate to ensure we have the latest data from backend
      queryClient.invalidateQueries({
        queryKey: [
          "/api/assistsettings/conversations",
          conversationId,
          "messages",
        ],
      });
    } finally {
      setIsStreaming(false);
      setProgressMessage("");
    }
  };

  const hasConversation = conversationId !== null;

  return (
    <div className="flex h-screen bg-background">
      {/* Conversation History Sidebar */}
      <div
        className={`border-r bg-card transition-all duration-300 ${
          showConversations ? "w-80" : "w-0"
        } overflow-hidden`}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-lg">Conversations</h2>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowConversations(false)}
                data-testid="button-close-conversations"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
            <Button
              className="w-full"
              onClick={() => createConversationMutation.mutate()}
              disabled={createConversationMutation.isPending}
              data-testid="button-new-conversation"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Conversation
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {conversations && conversations.length > 0 ? (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setConversationId(conv.id);
                      setShowConversations(false);
                    }}
                    className={`w-full text-left p-3 rounded-lg hover-elevate ${
                      conv.id === conversationId ? "bg-accent" : ""
                    }`}
                    data-testid={`conversation-${conv.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {conv.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(conv.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="mx-auto h-12 w-12 mb-3 opacity-50" />
                  <p className="text-sm">No conversations</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Main Content: Resizable Two-Panel Layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left Panel: AI Chat */}
        <ResizablePanel defaultSize={25} minSize={20} maxSize={30}>
          <div className="flex flex-col h-full">
            {/* Chat Header */}
            <div className="border-b p-4 min-h-[64px] flex items-center">
              <div className="flex items-center gap-3">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setLocation("/dashboard")}
                  data-testid="button-back-to-dashboard"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <SettingsIcon className="h-6 w-6 text-primary" />
                  </div>
                  <h1 className="text-lg font-semibold">AssistSettings</h1>
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <ScrollArea className="flex-1 p-6">
              <div
                className={`w-full ${!hasConversation ? "flex items-center justify-center min-h-full" : "space-y-6"}`}
              >
                {!hasConversation ? (
                  <div className="text-center space-y-4 py-16">
                    <div className="flex justify-center">
                      <div className="p-4 rounded-full bg-primary/10">
                        <Sparkles className="h-10 w-10 text-primary" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-xl font-bold">
                        AI Chat for Settings
                      </h2>
                      <p className="text-muted-foreground max-w-md mx-auto">
                        Chat with AI to change your settings or use the panel on
                        the right.
                      </p>
                    </div>
                    <Button
                      size="lg"
                      onClick={() => createConversationMutation.mutate()}
                      disabled={createConversationMutation.isPending}
                      data-testid="button-start-conversation"
                      className="w-full"
                    >
                      Start Conversation
                    </Button>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        data-testid={`message-${msg.role}-${msg.id}`}
                      >
                        <div
                          className={`max-w-2xl rounded-lg p-4 ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <div className="whitespace-pre-wrap">
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    ))}

                    {progressMessage && (
                      <div className="flex justify-start">
                        <div className="max-w-2xl rounded-lg p-4 bg-muted/50 border border-dashed">
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            <p className="text-sm text-muted-foreground flex items-center">
                              {progressMessage}
                              <span className="flex gap-1 px-2">
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
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
            </ScrollArea>

            {/* Chat Input */}
            {hasConversation && (
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
                        : "Type a message..."
                    }
                    disabled={isStreaming || !subscriptionStatus.canUseAI}
                    className="w-full text-sm min-h-[44px] resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-2 bg-transparent"
                    rows={1}
                    data-testid="input-message"
                  />
                  <div className="flex items-center px-2 pb-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-muted hover:bg-muted/80"
                      data-testid="button-attach"
                      disabled={!subscriptionStatus.canUseAI}
                    >
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <div className="flex-1"></div>
                    <Button
                      onClick={handleSendMessage}
                      disabled={!message.trim() || isStreaming || !subscriptionStatus.canUseAI}
                      size="icon"
                      className="h-8 w-8"
                      data-testid="button-send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel: Manual Settings UI */}
        <ResizablePanel defaultSize={75}>
          <div className="flex flex-col h-full">
            <div className="border-b p-4 min-h-[64px] flex items-center">
              <div>
                <h1 className="text-lg font-semibold">Manual Settings</h1>
                <p className="text-sm text-muted-foreground">
                  Edit your settings directly
                </p>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6">
                {/* Mobile Dropdown */}
                <div className="md:hidden mb-6">
                  <Select
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as SettingsTab)}
                  >
                    <SelectTrigger
                      className="w-full"
                      data-testid="settings-dropdown"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleTabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                          <SelectItem
                            key={tab.value}
                            value={tab.value}
                            data-testid={`dropdown-${tab.value}`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              {tab.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Desktop Tabs */}
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => setActiveTab(v as SettingsTab)}
                  className="hidden md:block"
                >
                  <TabsList
                    className="grid w-full"
                    style={{
                      gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))`,
                    }}
                    data-testid="settings-tabs"
                  >
                    {visibleTabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <TabsTrigger
                          key={tab.value}
                          value={tab.value}
                          data-testid={`tab-${tab.value}`}
                        >
                          <Icon className="h-4 w-4 mr-2" />
                          {tab.label}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>

                {/* Tab Content */}
                <div className="mt-6">
                  {activeTab === "profile" && <PerfilSettings />}
                  {activeTab === "preferences" && <PreferenciasSettings />}
                  {activeTab === "communication" && <CommunicationSettings />}
                  {activeTab === "connectors" && <UserConnectorsSettings />}
                  {activeTab === "organization" && <OrganizacaoSettings />}
                  {activeTab === "team" && <TeamSettings />}
                  {activeTab === "master-data" && <MasterDataSettings />}
                </div>
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
