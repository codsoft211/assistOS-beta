import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Send,
  Paperclip,
  Trash2,
  MessageSquare,
  Users,
  DollarSign,
  TrendingUp,
  FolderOpen,
  CheckCircle2,
  Zap,
  Wrench,
  Bot,
  Brain,
  User,
  FileText,
  Mail,
  Lightbulb,
  AlertTriangle,
  Info,
  X,
  Sparkles,
  Search,
  Loader2,
  Menu,
  File,
  MoreVertical,
  Edit2,
  Tags,
  Tag,
  Filter,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { AIBlockedBanner } from "@/components/AIBlockedBanner";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { AttachmentSheet } from "@/components/AttachmentSheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  attachmentIds?: string[];
  createdAt: string;
  metadata?: {
    hybridMode?: "trivial" | "simple" | "moderate" | "complex";
    duration_ms?: number;
    tools_used?: string[];
    toolCalls?: Array<{
      tool: string;
      result?: any;
      error?: string;
    }>;
    // Tool-specific metadata
    toolName?: string;
    toolParams?: Record<string, any>;
    toolResult?: any;
    toolStatus?: "running" | "success" | "error";
    toolProgress?: { percentage?: number; message?: string };
  };
}

interface FileAttachment {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  tags?: string[] | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  relatedEntityName?: string | null;
}

interface QuickSuggestion {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  message: string;
}

interface ProactiveInsight {
  id: string;
  tenantId: string;
  type: "deadline" | "overdue" | "anomaly" | "opportunity";
  severity: "low" | "medium" | "high" | "critical";
  category: "crm" | "financial" | "projects" | "hr";
  title: string;
  description: string;
  suggestedActions: string[];
  affectedEntities: Array<{ type: string; id: string; name: string }>;
  metadata?: Record<string, any>;
  dismissedAt?: string;
  createdAt: string;
}

interface DetectedPattern {
  id: string;
  type: string;
  sequence: Array<{
    actionType: string;
    toolName?: string;
    category?: string;
  }>;
  occurrences: number;
  confidence: number;
  suggestedWorkflow: {
    name: string;
    description: string;
  };
  lastSeen: string;
  dismissedAt: string | null;
}

function detectToolExecution(content: string): boolean {
  return (
    content.includes("✅") ||
    content.includes("criado") ||
    content.includes("atualizado") ||
    content.includes("created") ||
    content.includes("updated")
  );
}

function extractActionSummary(content: string): string {
  const firstLine = content.split("\n")[0];
  return firstLine.replace(/^✅\s*/, "");
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <AlertTriangle className="h-4 w-4" />;
    case "high":
      return <AlertTriangle className="h-4 w-4" />;
    case "medium":
      return <Info className="h-4 w-4" />;
    default:
      return <Lightbulb className="h-4 w-4" />;
  }
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "border-destructive bg-destructive/10";
    case "high":
      return "border-orange-500 bg-orange-500/10";
    case "medium":
      return "border-yellow-500 bg-yellow-500/10";
    default:
      return "border-blue-500 bg-blue-500/10";
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function AttachmentChip({ file }: { file: FileAttachment }) {
  const handleDownload = () => {
    window.open(`/api/files/${file.id}/download`, "_blank");
  };

  return (
    <Badge
      variant="secondary"
      className="cursor-pointer hover-elevate"
      onClick={handleDownload}
      data-testid={`badge-attachment-${file.id}`}
    >
      <Paperclip className="h-3 w-3 mr-1" />
      {file.originalName}
      <span className="ml-1 text-xs text-muted-foreground">
        ({formatFileSize(file.size)})
      </span>
    </Badge>
  );
}

function MessageContent({
  content,
  isUserMessage = false,
}: {
  content: string;
  isUserMessage?: boolean;
}) {
  // Detectar e renderizar status badges (✅, ❌, ⚠️, etc)
  const hasStatusIndicators = /^[✅❌⚠️ℹ️🔄]/.test(content);

  return (
    <div
      className={`prose prose-sm max-w-none ${
        isUserMessage
          ? "prose-invert [&_*]:!text-primary-foreground [&_a]:!text-primary-foreground/90 [&_code]:!text-primary-foreground"
          : "prose-slate dark:prose-invert [&_a]:text-primary [&_code]:text-foreground"
      }`}
      data-testid="message-content"
    >
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>

      {/* Status badges para mensagens de sucesso/erro */}
      {hasStatusIndicators && (
        <div className="mt-2">
          {content.includes("✅") && (
            <Badge variant="default" className="text-xs bg-green-500">
              Success
            </Badge>
          )}
          {content.includes("❌") && (
            <Badge variant="destructive" className="text-xs">
              Error
            </Badge>
          )}
          {content.includes("⚠️") && (
            <Badge variant="secondary" className="text-xs bg-yellow-500">
              Warning
            </Badge>
          )}
          {content.includes("ℹ️") && (
            <Badge variant="secondary" className="text-xs bg-blue-500">
              Info
            </Badge>
          )}
          {content.includes("🔄") && (
            <Badge variant="secondary" className="text-xs">
              Processing
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

type ToolCall = {
  tool: string;
  result?: any;
  error?: string;
  parameters?: Record<string, any>;
  status?: "pending" | "running" | "success" | "error";
  startTime?: string;
  endTime?: string;
  progress?: number;
};

// Componente individual para cada tool call (mantém useState estável)
function ToolCallCard({ call, index }: { call: ToolCall; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const getToolIcon = (toolName: string) => {
    if (toolName.includes("email")) return Mail;
    if (toolName.includes("document") || toolName.includes("file"))
      return FileText;
    if (toolName.includes("analysis") || toolName.includes("insight"))
      return Lightbulb;
    if (toolName.includes("search") || toolName.includes("query"))
      return Search;
    if (toolName.includes("user") || toolName.includes("client")) return Users;
    if (toolName.includes("invoice") || toolName.includes("payment"))
      return DollarSign;
    return Wrench;
  };

  const getStatusBadge = (call: ToolCall) => {
    if (call.error || call.status === "error") {
      return (
        <Badge variant="destructive" className="text-xs">
          Error
        </Badge>
      );
    }
    if (call.status === "running" || call.status === "pending") {
      return (
        <Badge variant="secondary" className="text-xs flex items-center gap-1">
          <Loader2 className="h-2 w-2 animate-spin" />
          Running
        </Badge>
      );
    }
    if (call.result || call.status === "success") {
      return (
        <Badge variant="default" className="text-xs bg-green-500">
          Success
        </Badge>
      );
    }
    return null;
  };

  const formatDuration = (start?: string, end?: string) => {
    if (!start || !end) return null;
    const duration = new Date(end).getTime() - new Date(start).getTime();
    return duration > 1000
      ? `${(duration / 1000).toFixed(1)}s`
      : `${duration}ms`;
  };

  const ToolIcon = getToolIcon(call.tool);
  const duration = formatDuration(call.startTime, call.endTime);

  return (
    <div
      className="rounded bg-muted/50 overflow-hidden"
      data-testid={`tool-call-${index}`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 p-2 cursor-pointer hover-elevate"
        onClick={() => setExpanded(!expanded)}
      >
        <ToolIcon className="h-3 w-3 text-primary flex-shrink-0" />
        <span className="font-medium text-xs flex-1">{call.tool}</span>
        {duration && (
          <span className="text-xs text-muted-foreground">{duration}</span>
        )}
        {getStatusBadge(call)}
      </div>

      {/* Expandable Details */}
      {expanded && (
        <div className="px-2 pb-2 space-y-2 border-t border-border/50">
          {/* Parameters */}
          {call.parameters && Object.keys(call.parameters).length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Parameters:
              </div>
              <div className="text-xs bg-background/50 rounded p-2 space-y-1">
                {Object.entries(call.parameters).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="font-mono text-primary">{key}:</span>
                    <span className="text-muted-foreground break-all">
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {call.progress !== undefined && call.status === "running" && (
            <div className="mt-2">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Progress: {call.progress}%
              </div>
              <div className="w-full bg-background rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all"
                  style={{ width: `${call.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Result */}
          {call.result && (
            <div className="mt-2">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Result:
              </div>
              <div className="text-xs bg-background/50 rounded p-2 text-muted-foreground break-all font-mono">
                {typeof call.result === "object"
                  ? JSON.stringify(call.result, null, 2)
                  : String(call.result)}
              </div>
            </div>
          )}

          {/* Error */}
          {call.error && (
            <div className="mt-2">
              <div className="text-xs font-medium text-destructive mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Error:
              </div>
              <div className="text-xs bg-destructive/10 rounded p-2 text-destructive break-all">
                {call.error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolInvocationDisplay({ toolCalls }: { toolCalls: ToolCall[] }) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="mt-3 space-y-2" data-testid="tool-invocations">
      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <Zap className="h-3 w-3" />
        Tools Used ({toolCalls.length})
      </div>
      {toolCalls.map((call, idx) => (
        <ToolCallCard key={idx} call={call} index={idx} />
      ))}
    </div>
  );
}

interface FileMetadata {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

function AttachmentDisplay({ attachmentIds }: { attachmentIds: string[] }) {
  if (!attachmentIds || attachmentIds.length === 0) return null;

  // Buscar metadata dos ficheiros
  const { data: filesMetadata, isLoading } = useQuery<FileMetadata[]>({
    queryKey: ["/api/files/metadata", attachmentIds],
    queryFn: async () => {
      // Buscar metadata para cada ficheiro
      const promises = attachmentIds.map((id) =>
        fetch(`/api/files/${id}/metadata`).then((res) =>
          res.ok ? res.json() : null,
        ),
      );
      const results = await Promise.all(promises);
      return results.filter(Boolean);
    },
    enabled: attachmentIds.length > 0,
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return FileText;
    if (mimeType.includes("pdf")) return FileText;
    if (mimeType.includes("document") || mimeType.includes("word"))
      return FileText;
    if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
      return FileText;
    return File;
  };

  if (isLoading) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {attachmentIds.map((id) => (
          <Skeleton key={id} className="h-8 w-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3" data-testid="attachments-container">
      <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
        <Paperclip className="h-3 w-3" />
        Attachments ({attachmentIds.length})
      </div>
      <div className="space-y-2">
        {attachmentIds.map((id, idx) => {
          const metadata = filesMetadata?.find((f) => f.id === id);
          const FileIcon = metadata ? getFileIcon(metadata.mimeType) : File;

          return (
            <div
              key={id}
              className="flex items-center gap-3 p-2 rounded bg-muted/50 hover-elevate cursor-pointer group"
              onClick={() => window.open(`/api/files/${id}/download`, "_blank")}
              data-testid={`attachment-${id}`}
            >
              <FileIcon className="h-4 w-4 text-primary flex-shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">
                  {metadata?.originalName || `File ${idx + 1}`}
                </div>
                {metadata && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{formatFileSize(metadata.size)}</span>
                    <span>•</span>
                    <span className="truncate">
                      {metadata.mimeType.split("/")[1].toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`/api/files/${id}/download`, "_blank");
                }}
              >
                <File className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PatternAutomationSuggestions() {
  const { toast } = useToast();

  const { data: patterns, isLoading } = useQuery<DetectedPattern[]>({
    queryKey: ["/api/patterns"],
  });

  const createWorkflow = useMutation({
    mutationFn: async (patternId: string) => {
      return await apiRequest(
        "POST",
        `/api/patterns/${patternId}/create-workflow`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patterns"] });
      toast({
        title: "Automação Criada",
        description: "O workflow foi criado com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível criar a automação.",
        variant: "destructive",
      });
    },
  });

  const dismissPattern = useMutation({
    mutationFn: async (patternId: string) => {
      return await apiRequest("POST", `/api/patterns/${patternId}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patterns"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível dispensar o padrão.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return null;
  }

  const visiblePatterns = patterns?.filter((p) => !p.dismissedAt) || [];

  if (visiblePatterns.length === 0) {
    return null;
  }

  const topPatterns = visiblePatterns.slice(0, 2);

  return (
    <Card
      className="mb-4 border-primary/20"
      data-testid="card-pattern-automations"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-5 w-5 text-primary" />
          Automações Sugeridas
          <Badge variant="secondary" className="ml-auto">
            {visiblePatterns.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {topPatterns.map((pattern) => (
          <Alert
            key={pattern.id}
            className="relative border-blue-500 bg-blue-500/10"
            data-testid={`alert-pattern-${pattern.id}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <Zap className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <AlertTitle className="text-sm font-semibold mb-1">
                  {pattern.suggestedWorkflow.name}
                </AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground mb-2">
                  {pattern.suggestedWorkflow.description}
                </AlertDescription>
                <div className="text-xs space-y-1 mt-2">
                  <p className="font-medium text-muted-foreground">
                    {pattern.occurrences} ocorrências detectadas
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      onClick={() => createWorkflow.mutate(pattern.id)}
                      disabled={createWorkflow.isPending}
                      data-testid={`button-create-workflow-${pattern.id}`}
                      className="h-7 text-xs"
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Criar Automação
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={() => dismissPattern.mutate(pattern.id)}
                disabled={dismissPattern.isPending}
                data-testid={`button-dismiss-pattern-${pattern.id}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </Alert>
        ))}
      </CardContent>
    </Card>
  );
}

function ProactiveSuggestions() {
  const { toast } = useToast();

  const { data: insights, isLoading } = useQuery<ProactiveInsight[]>({
    queryKey: ["/api/proactive/insights"],
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/proactive/insights/${id}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proactive/insights"] });
      toast({
        title: "Insight dispensado",
        description: "O insight foi marcado como dispensado",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao dispensar insight",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return null;
  }

  if (!insights || insights.length === 0) {
    return null;
  }

  const topInsights = insights.slice(0, 3);

  return (
    <Card
      className="mb-4 border-primary/20"
      data-testid="card-proactive-suggestions"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-5 w-5 text-primary" />
          Sugestões Proativas
          <Badge variant="secondary" className="ml-auto">
            {insights.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {topInsights.map((insight) => (
          <Alert
            key={insight.id}
            className={`relative ${getSeverityColor(insight.severity)}`}
            data-testid={`alert-insight-${insight.id}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getSeverityIcon(insight.severity)}</div>
              <div className="flex-1 min-w-0">
                <AlertTitle className="text-sm font-semibold mb-1">
                  {insight.title}
                </AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground mb-2">
                  {insight.description}
                </AlertDescription>
                {insight.suggestedActions &&
                  insight.suggestedActions.length > 0 && (
                    <div className="text-xs space-y-1 mt-2">
                      <p className="font-medium">Ações sugeridas:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                        {insight.suggestedActions
                          .slice(0, 2)
                          .map((action, idx) => (
                            <li key={idx}>{action}</li>
                          ))}
                      </ul>
                    </div>
                  )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={() => dismissMutation.mutate(insight.id)}
                disabled={dismissMutation.isPending}
                data-testid={`button-dismiss-${insight.id}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </Alert>
        ))}
        {insights.length > 3 && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            +{insights.length - 3} mais insight
            {insights.length - 3 !== 1 ? "s" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Props interface for ConversationsSidebar
interface ConversationsSidebarProps {
  // Search & Filters
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  selectedEntityType: string | null;
  setSelectedEntityType: (type: string | null) => void;
  availableTags: string[];

  // Conversations Data
  conversations: Conversation[] | undefined;
  loadingConversations: boolean;
  selectedConversationId: string | null;

  // Mutations & Actions
  createConversationMutation: any;
  generateTitleMutation: any;
  deleteConversationMutation: any;
  handleSelectConversation: (id: string) => void;

  // Dialog States
  setEditingConversation: (conv: Conversation | null) => void;
  setNewTitle: (title: string) => void;
  setRenameDialogOpen: (open: boolean) => void;
  setNewTags: (tags: string) => void;
  setTagsDialogOpen: (open: boolean) => void;
}

// Extracted ConversationsSidebar component
const ConversationsSidebar = memo(
  ({
    searchQuery,
    setSearchQuery,
    selectedTags,
    setSelectedTags,
    selectedEntityType,
    setSelectedEntityType,
    availableTags,
    conversations,
    loadingConversations,
    selectedConversationId,
    createConversationMutation,
    generateTitleMutation,
    deleteConversationMutation,
    handleSelectConversation,
    setEditingConversation,
    setNewTitle,
    setRenameDialogOpen,
    setNewTags,
    setTagsDialogOpen,
  }: ConversationsSidebarProps) => (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-lg">Conversas</h2>
          <Button
            size="icon"
            onClick={() => createConversationMutation.mutate()}
            disabled={createConversationMutation.isPending}
            data-testid="button-new-conversation"
            className="h-8 w-8"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* WhatsApp-style Search with Filter Button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar conversas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-conversations"
            />
          </div>

          {/* Filters Button */}
          {availableTags.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="relative"
                  data-testid="button-filters"
                >
                  <Filter className="h-4 w-4" />
                  {selectedTags.length > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                      {selectedTags.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Filtrar por Tags</h4>
                    {selectedTags.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTags([])}
                        className="h-7 text-xs"
                        data-testid="button-clear-filters-popover"
                      >
                        Limpar
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {availableTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant={
                          selectedTags.includes(tag) ? "default" : "outline"
                        }
                        className="cursor-pointer text-xs hover-elevate"
                        onClick={() => {
                          if (selectedTags.includes(tag)) {
                            setSelectedTags(
                              selectedTags.filter((t) => t !== tag),
                            );
                          } else {
                            setSelectedTags([...selectedTags, tag]);
                          }
                        }}
                        data-testid={`filter-tag-${tag}`}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Active Filter Chips */}
        {(selectedEntityType || selectedTags.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {selectedEntityType && (
              <Badge
                variant="secondary"
                className="cursor-pointer"
                onClick={() => setSelectedEntityType(null)}
                data-testid="badge-filter-entity"
              >
                {selectedEntityType}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            )}
            {selectedTags.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setSelectedTags([])}
                data-testid="button-clear-tags"
              >
                Limpar filtros ({selectedTags.length})
              </Button>
            )}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {loadingConversations ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))
          ) : conversations?.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
              {searchQuery
                ? "Nenhuma conversa encontrada"
                : "Nenhuma conversa ainda"}
            </div>
          ) : (
            conversations?.map((conv) => (
              <Card
                key={conv.id}
                className={`p-3 hover-elevate cursor-pointer transition-all ${
                  selectedConversationId === conv.id
                    ? "border-primary bg-accent/50"
                    : ""
                }`}
                onClick={() => handleSelectConversation(conv.id)}
                data-testid={`conversation-card-${conv.id}`}
              >
                <div className="space-y-2">
                  {/* Title & Actions */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-sm line-clamp-2 flex-1">
                      {conv.title}
                    </h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0"
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
                          Renomear
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
                          generateTitleMutation.variables?.conversationId ===
                            conv.id ? (
                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3 mr-2" />
                          )}
                          Gerar nome com AI
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingConversation(conv);
                            setNewTags(conv.tags?.join(", ") || "");
                            setTagsDialogOpen(true);
                          }}
                          data-testid={`menu-tags-${conv.id}`}
                        >
                          <Tag className="h-3 w-3 mr-2" />
                          Adicionar Tags
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            // Check if conversation has messages before deleting
                            // If messages are in cache, use that; otherwise assume it has messages (show toast by default)
                            // unless it's a "New Conversation" which is likely empty
                            const cachedMessages = queryClient.getQueryData<
                              Message[]
                            >(["/api/conversations", conv.id, "messages"]);

                            let hadMessages = true; // Default: show toast
                            if (cachedMessages !== undefined) {
                              // Cache exists, use actual data
                              hadMessages = cachedMessages.length > 0;
                            } else if (conv.title === "New Conversation") {
                              // New conversation not yet opened - likely empty
                              hadMessages = false;
                            }

                            deleteConversationMutation.mutate({
                              id: conv.id,
                              hadMessages,
                            });
                          }}
                          className="text-destructive"
                          data-testid={`menu-delete-${conv.id}`}
                        >
                          <Trash2 className="h-3 w-3 mr-2" />
                          Apagar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Related Entity */}
                  {conv.relatedEntityName && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span
                        className="truncate"
                        data-testid={`entity-name-${conv.id}`}
                      >
                        {conv.relatedEntityName}
                      </span>
                    </div>
                  )}

                  {/* Tags */}
                  {conv.tags && conv.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {conv.tags.slice(0, 3).map((tag, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className="text-xs px-1.5 py-0"
                          data-testid={`tag-${conv.id}-${idx}`}
                        >
                          {tag}
                        </Badge>
                      ))}
                      {conv.tags.length > 3 && (
                        <Badge
                          variant="outline"
                          className="text-xs px-1.5 py-0"
                        >
                          +{conv.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Date */}
                  <p className="text-xs text-muted-foreground">
                    {new Date(conv.updatedAt).toLocaleDateString("pt-PT", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  ),
);

export default function ChatPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  
  // Track if we've processed the initial URL param and the last processed ID
  const initialUrlProcessedRef = useRef(false);
  const lastProcessedUrlIdRef = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedEntityType, setSelectedEntityType] = useState<string | null>(
    null,
  );
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<
    Array<{ file: File; preview: string; id: string }>
  >([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [fileMetadata, setFileMetadata] = useState<
    Record<string, FileAttachment>
  >({});
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [editingConversation, setEditingConversation] =
    useState<Conversation | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newTags, setNewTags] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousConversationIdRef = useRef<string | null>(null);
  const skipAutoDeleteRef = useRef<boolean>(false);
  const lastSyncedConversationIdRef = useRef<string | null>(null);
  const isSendingMessageRef = useRef<boolean>(false);
  const { toast } = useToast();
  
  // Check subscription and credit status
  const subscriptionStatus = useSubscriptionStatus();

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

  // SSE listener for real-time conversation and message updates
  useEffect(() => {
    console.log('[Chat] 🔌 Setting up SSE connection for real-time updates');
    const eventSource = new EventSource('/api/realtime/stream', {
      withCredentials: true,
    });

    eventSource.onopen = () => {
      console.log('[Chat] ✅ SSE connection established');
    };

    // Listen for conversation created events
    eventSource.addEventListener('conversation.created', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Chat] 🆕 Conversation created via SSE:', data);
        // Refetch ALL conversations queries (use refetchQueries to force immediate refetch)
        queryClient.refetchQueries({ 
          predicate: (query) => {
            const queryKey = query.queryKey as string[];
            const matches = queryKey[0] === "/api/conversations" && !queryKey.includes("messages");
            if (matches) {
              console.log('[Chat] 🔄 Refetching conversation query:', queryKey);
            }
            return matches;
          }
        });
        console.log('[Chat] ✅ Conversations refetch triggered');
      } catch (e) {
        console.error('[Chat] ❌ Failed to parse conversation.created event:', e);
      }
    });

    // Listen for conversation updated events
    eventSource.addEventListener('conversation.updated', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Chat] 🔄 Conversation updated via SSE:', data);
        console.log('[Chat] 🔄 Conversation data:', {
          conversationId: data.conversationId,
          tenantId: data.tenantId,
          conversation: data.conversation,
        });
        
        // Invalidate ALL conversations queries to ensure cache is cleared and refetched
        // This ensures updated conversations appear in the list immediately
        queryClient.invalidateQueries({ 
          predicate: (query) => {
            const queryKey = query.queryKey as string[];
            const matches = queryKey[0] === "/api/conversations" && !queryKey.includes("messages");
            if (matches) {
              console.log('[Chat] 🔄 Invalidating conversation query:', queryKey);
            }
            return matches;
          }
        });
        console.log('[Chat] ✅ Conversations invalidated - will refetch automatically');
      } catch (e) {
        console.error('[Chat] ❌ Failed to parse conversation.updated event:', e);
        console.error('[Chat] ❌ Event data:', event.data);
      }
    });

    // Listen for message created events
    eventSource.addEventListener('message.created', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Chat] 💬 Message created via SSE:', data);
        console.log('[Chat] 💬 Message data:', {
          conversationId: data.conversationId,
          messageId: data.messageId,
          tenantId: data.tenantId,
        });
        // Invalidate messages query for this specific conversation
        queryClient.invalidateQueries({ 
          queryKey: ["/api/conversations", data.conversationId, "messages"] 
        });
        console.log('[Chat] ✅ Messages invalidated for conversation:', data.conversationId);
        
        // Also invalidate conversations list to update unread counts
        queryClient.invalidateQueries({
          predicate: (query) => {
            const queryKey = query.queryKey as string[];
            return queryKey[0] === "/api/conversations" && !queryKey.includes("messages");
          }
        });
      } catch (e) {
        console.error('[Chat] ❌ Failed to parse message.created event:', e);
        console.error('[Chat] ❌ Event data:', event.data);
      }
    });
    
    // Listen for conversation created events (for new automation notifications)
    eventSource.addEventListener('conversation.created', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Chat] ✨ Conversation created via SSE:', data);
        console.log('[Chat] ✨ Conversation data:', {
          conversationId: data.conversationId,
          tenantId: data.tenantId,
          conversation: data.conversation,
        });
        
        // Invalidate conversations list to show new conversation
        queryClient.invalidateQueries({
          predicate: (query) => {
            const queryKey = query.queryKey as string[];
            const matches = queryKey[0] === "/api/conversations" && !queryKey.includes("messages");
            if (matches) {
              console.log('[Chat] ✨ Invalidating conversation query for new conversation:', queryKey);
            }
            return matches;
          }
        });
        console.log('[Chat] ✅ Conversations invalidated after new conversation created');
      } catch (e) {
        console.error('[Chat] ❌ Failed to parse conversation.created event:', e);
        console.error('[Chat] ❌ Event data:', event.data);
      }
    });

    eventSource.onerror = (error) => {
      console.error('[Chat] ❌ SSE connection error:', error);
      // Don't close - let EventSource auto-reconnect with credentials
      // Closing and reopening creates a new connection without session cookies
    };

    return () => {
      eventSource.close();
      console.log('[Chat] 🔌 SSE connection closed');
    };
  }, [queryClient]);

  // Debounce search query to avoid re-rendering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: conversations, isLoading: loadingConversations } = useQuery<
    Conversation[]
  >({
    queryKey: [
      "/api/conversations",
      debouncedSearchQuery,
      selectedTags,
      selectedEntityType,
      "assistme",
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("agentType", "assistme");
      if (debouncedSearchQuery) params.append("q", debouncedSearchQuery);
      if (selectedEntityType) params.append("entityType", selectedEntityType);
      selectedTags.forEach((tag) => params.append("tags", tag));

      const query = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/conversations${query}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
  });

  // Pre-select conversation from URL query param (e.g., /chat?id=uuid from notification click)
  useEffect(() => {
    // Skip if still loading conversations
    if (loadingConversations) {
      return;
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const conversationIdFromUrl = urlParams.get('id');
    
    // Reset processed flag if URL ID changed (user navigated to different conversation)
    if (conversationIdFromUrl !== lastProcessedUrlIdRef.current) {
      initialUrlProcessedRef.current = false;
      lastProcessedUrlIdRef.current = conversationIdFromUrl;
    }
    
    if (conversationIdFromUrl) {
      // If we already have this conversation selected, no need to change
      if (selectedConversationId === conversationIdFromUrl) {
        // Mark as processed since we're already viewing this conversation
        if (!initialUrlProcessedRef.current) {
          initialUrlProcessedRef.current = true;
        }
        return;
      }
      
      // If conversations list is available, check if it exists (for validation)
      // But allow setting the conversationId even if not in list yet (handles race conditions)
      if (conversations && conversations.length > 0) {
        const conversationExists = conversations.some(
          (conv) => conv.id === conversationIdFromUrl
        );
        
        if (conversationExists) {
          setSelectedConversationId(conversationIdFromUrl);
          initialUrlProcessedRef.current = true;
          // Remove ?id= parameter from URL after selecting conversation to prevent interference with normal switching
          if (window.location.search.includes('id=')) {
            const newUrl = window.location.pathname;
            window.history.replaceState({}, '', newUrl);
          }
        } else {
          // Conversation not in list yet, but set it anyway (messages query will work)
          // This handles the race condition where notification arrives before conversation list updates
          console.log('[Chat] Conversation from URL not in list yet, selecting anyway:', conversationIdFromUrl);
          setSelectedConversationId(conversationIdFromUrl);
          // Don't mark as processed - allow re-checking when list updates
        }
      } else {
        // No conversations list yet, but set the ID from URL anyway
        // This ensures we select it as soon as possible
        console.log('[Chat] Setting conversation from URL before list loads:', conversationIdFromUrl);
        setSelectedConversationId(conversationIdFromUrl);
        // Don't mark as processed - allow re-checking when list loads
      }
    } else {
      // No ID in URL, mark as processed if we haven't already
      if (!initialUrlProcessedRef.current) {
        initialUrlProcessedRef.current = true;
      }
      lastProcessedUrlIdRef.current = null;
    }
  }, [conversations, loadingConversations, selectedConversationId]);

  const { data: fetchedMessages, isLoading: loadingMessages, error: messagesError, isError: isMessagesError } = useQuery<
    Message[]
  >({
    queryKey: ["/api/conversations", selectedConversationId, "messages"],
    enabled: !!selectedConversationId,
    // Retry logic is handled by queryClient defaultOptions
  });

  useEffect(() => {
    // Silently handle errors - don't show pool exhaustion errors to users
    // If there's an error after retries are exhausted, just keep existing messages
    if (isMessagesError && messagesError) {
      const errorMessage = (messagesError as Error)?.message || String(messagesError) || "";
      const isPoolError = 
        errorMessage.includes("MaxClientsInSessionMode") || 
        errorMessage.includes("max clients reached") ||
        errorMessage.includes("pool_size") ||
        errorMessage.includes("connection pool exhausted");
      
      if (isPoolError) {
        // Silently handle pool errors - keep existing messages, don't show error to user
        // The query will automatically retry when refetched or when conversation changes
        console.warn(`[Chat] Database pool exhausted after retries, keeping existing messages. Will retry on next refetch.`);
        return;
      }
    }

    if (fetchedMessages && Array.isArray(fetchedMessages)) {
      // Skip syncing if we're actively sending a message (prevents race condition
      // where empty array from refetch overwrites optimistic user message)
      if (isSendingMessageRef.current) {
        return;
      }

      // Check if we switched to a different conversation
      const conversationChanged =
        lastSyncedConversationIdRef.current !== selectedConversationId;

      if (conversationChanged) {
        // Always sync when switching conversations
        setMessages(fetchedMessages);
        lastSyncedConversationIdRef.current = selectedConversationId;
      } else {
        // Smart merge: only sync if fetched has MORE messages than local state
        // This prevents overwriting optimistic updates with empty arrays
        // when a new conversation is created
        if (fetchedMessages.length >= messages.length) {
          setMessages(fetchedMessages);
          lastSyncedConversationIdRef.current = selectedConversationId;
        }
      }
    }
  }, [fetchedMessages, selectedConversationId, isMessagesError, messagesError, messages]);

  // 🔧 FIX: Reset streaming state when switching conversations
  // This prevents the loading dots from appearing in all conversations
  // BUT: Skip reset if we're actively sending a message (creating new conversation)
  useEffect(() => {
    if (!isSendingMessageRef.current) {
      setIsStreaming(false);
      setProgressMessage("");
    }
  }, [selectedConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/conversations", {
        title: "New Conversation",
        agentType: "assistme",
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "/api/conversations",
      });
      // Skip auto-delete for this new conversation
      skipAutoDeleteRef.current = true;
      setSelectedConversationId(data.id);
      setMessages([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create conversation",
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
      await apiRequest("DELETE", `/api/conversations/${id}`);
      return { id, hadMessages };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "/api/conversations",
      });

      const wasSelected = selectedConversationId === data.id;

      if (wasSelected) {
        setSelectedConversationId(null);
        setMessages([]);
      }

      // Don't show toast for empty conversations
      if (data.hadMessages) {
        toast({
          title: "Conversation deleted",
        });
      }
    },
  });

  const generateTitleMutation = useMutation({
    mutationFn: async ({
      conversationId,
      isManual,
    }: {
      conversationId: string;
      isManual?: boolean;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/conversations/${conversationId}/generate-title`,
      );
      const data = await res.json();
      return { ...data, isManual };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "/api/conversations",
      });

      // Only show toast for manual title generation (from context menu)
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
      const res = await apiRequest("PATCH", `/api/conversations/${id}/title`, {
        title,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "/api/conversations",
      });
      setRenameDialogOpen(false);
      setEditingConversation(null);
      setNewTitle("");
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
      const res = await apiRequest("PATCH", `/api/conversations/${id}/tags`, {
        tags,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "/api/conversations",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/conversations/tags/all"],
      });
      setTagsDialogOpen(false);
      setEditingConversation(null);
      setNewTags("");
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

  // Fetch all available tags
  const { data: allTagsData } = useQuery<{ tags: string[] }>({
    queryKey: ["/api/conversations/tags/all"],
  });

  useEffect(() => {
    if (allTagsData?.tags) {
      setAvailableTags(allTagsData.tags);
    }
  }, [allTagsData]);

  // Auto-delete empty conversations when navigating away
  useEffect(() => {
    const previousId = previousConversationIdRef.current;

    // Check if we're navigating away from a conversation
    if (
      previousId &&
      previousId !== selectedConversationId &&
      !skipAutoDeleteRef.current
    ) {
      // Check if the previous conversation has any messages
      const cachedMessages = queryClient.getQueryData<Message[]>([
        "/api/conversations",
        previousId,
        "messages",
      ]);

      // If conversation is empty (no messages), delete it silently
      if (cachedMessages && cachedMessages.length === 0) {
        deleteConversationMutation.mutate({
          id: previousId,
          hadMessages: false,
        });
      }
    }

    // Reset skip flag and update ref
    skipAutoDeleteRef.current = false;
    previousConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  // Clean up empty conversations on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (selectedConversationId && !skipAutoDeleteRef.current) {
        const cachedMessages = queryClient.getQueryData<Message[]>([
          "/api/conversations",
          selectedConversationId,
          "messages",
        ]);

        if (cachedMessages && cachedMessages.length === 0) {
          // Use keepalive fetch for reliable DELETE on unload
          fetch(`/api/conversations/${selectedConversationId}`, {
            method: "DELETE",
            credentials: "include",
            keepalive: true,
          }).catch(() => {
            // Silently fail - user is leaving anyway
          });
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [selectedConversationId]);

  const startChatWith = (initialMessage: string) => {
    createConversationMutation.mutate();
    setTimeout(() => {
      setMessage(initialMessage);
    }, 500);
  };

  const handleFileSelect = async (files: FileList) => {
    const fileArray = Array.from(files);
    const newFiles = fileArray.map((file) => ({
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      id: crypto.randomUUID(),
    }));
    setSelectedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => {
    setSelectedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return [];

    setIsUploadingFiles(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach(({ file }) => {
        formData.append("files", file);
      });

      const res = await fetch("/api/files/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Falha no upload dos arquivos");
      }

      const data = await res.json();
      const files = data.files || [];

      // Store file metadata for rendering
      const metadata: Record<string, FileAttachment> = {};
      files.forEach((f: any) => {
        metadata[f.id] = {
          id: f.id,
          originalName: f.originalName,
          size: f.size,
          mimeType: f.mimeType,
        };
      });
      setFileMetadata((prev) => ({ ...prev, ...metadata }));

      return files;
    } catch (error) {
      toast({
        title: "Erro no upload",
        description:
          error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const sendMessage = async () => {
    if ((!message.trim() && selectedFiles.length === 0) || isStreaming) return;

    // Check subscription and credits BEFORE sending
    if (!subscriptionStatus.canUseAI) {
      toast({
        title: subscriptionStatus.reason === 'no_subscription' ? 'Subscription Required' : 'Credits Depleted',
        description: subscriptionStatus.message,
        variant: 'destructive',
      });
      return;
    }

    // Flag that we're sending a message (prevents streaming reset on conversation creation)
    isSendingMessageRef.current = true;

    try {
      // Upload files first if any
      const uploadedFiles = await uploadFiles();
      const fileIds = uploadedFiles.map((f: { id: string }) => f.id);

      // Auto-create conversation if none selected
      let conversationId = selectedConversationId;
      if (!conversationId) {
        setProgressMessage("Starting conversation");
        const res = await apiRequest("POST", "/api/conversations", {
          title: "New Conversation",
          agentType: "assistme",
        });
        const data = await res.json();
        conversationId = data.id;
        setSelectedConversationId(conversationId);
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === "/api/conversations",
        });
      }

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        attachmentIds: fileIds.length > 0 ? fileIds : undefined,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setMessage("");
      setSelectedFiles([]);
      setIsStreaming(true);
      setProgressMessage("AssistME is thinking");
      const response = await fetch(
        `/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            content: userMessage.content,
            attachmentIds: fileIds.length > 0 ? fileIds : undefined,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";
      const assistantMessageId = crypto.randomUUID();
      let assistantMessageCreated = false;

      if (reader) {
        let buffer = "";
        let currentEventType = "";
        const activeToolMessages = new Map<string, string>(); // toolName -> messageId

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) {
              // Empty line separates SSE events - don't reset currentEventType here!
              continue;
            }

            if (line.startsWith("event: ")) {
              currentEventType = line.slice(7).trim();
              console.log("[SSE Event Type]", currentEventType);
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
                console.log("[SSE Data]", currentEventType, parsed);

                // Handle different event types
                if (currentEventType === "tool_start" && parsed.tool) {
                  console.log(
                    "[SSE] 🔧 Creating tool message for:",
                    parsed.tool,
                  );
                  // 🔧 CREATE NEW TOOL MESSAGE
                  const toolMessageId = crypto.randomUUID();
                  activeToolMessages.set(parsed.tool, toolMessageId);

                  setMessages((prev) => [
                    ...prev,
                    {
                      id: toolMessageId,
                      role: "tool",
                      content: `Executando ${parsed.tool}...`,
                      createdAt: new Date().toISOString(),
                      metadata: {
                        toolName: parsed.tool,
                        toolParams: parsed.params,
                        toolStatus: "running",
                      },
                    },
                  ]);
                } else if (
                  currentEventType === "tool_progress" &&
                  parsed.tool
                ) {
                  // 📊 UPDATE TOOL PROGRESS
                  const toolMessageId = activeToolMessages.get(parsed.tool);
                  if (toolMessageId) {
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === toolMessageId
                          ? {
                              ...msg,
                              metadata: {
                                ...msg.metadata,
                                toolProgress: parsed.progress,
                              },
                            }
                          : msg,
                      ),
                    );
                  }
                } else if (
                  currentEventType === "tool_complete" &&
                  parsed.tool
                ) {
                  // ✅ MARK TOOL AS COMPLETE
                  const toolMessageId = activeToolMessages.get(parsed.tool);
                  if (toolMessageId) {
                    const hasError = parsed.result?.error;
                    const wasSkipped = parsed.result?.skipped === true; // Check if tool was skipped
                    
                    // If tool was skipped (e.g., duplicate notification), remove the message instead of showing completion
                    if (wasSkipped) {
                      setMessages((prev) => prev.filter((msg) => msg.id !== toolMessageId));
                      activeToolMessages.delete(parsed.tool);
                    } else {
                      setMessages((prev) =>
                        prev.map((msg) =>
                          msg.id === toolMessageId
                            ? {
                                ...msg,
                                content: hasError
                                  ? `❌ Erro ao executar ${parsed.tool}`
                                  : `✅ ${parsed.tool} concluído`,
                                metadata: {
                                  ...msg.metadata,
                                  toolStatus: hasError ? "error" : "success",
                                  toolResult: parsed.result,
                                },
                              }
                            : msg,
                        ),
                      );
                      activeToolMessages.delete(parsed.tool);
                    }
                  }
                } else if (currentEventType === "message" && parsed.content) {
                  // 💬 STREAMING ASSISTANT MESSAGE
                  assistantMessage += parsed.content;

                  setMessages((prev) => {
                    const messageExists = prev.some(
                      (m) => m.id === assistantMessageId,
                    );
                    if (!messageExists && !assistantMessageCreated) {
                      // Create assistant message on first content
                      assistantMessageCreated = true;
                      return [
                        ...prev,
                        {
                          id: assistantMessageId,
                          role: "assistant",
                          content: assistantMessage,
                          createdAt: new Date().toISOString(),
                        },
                      ];
                    } else if (messageExists) {
                      // Update existing message
                      return prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, content: assistantMessage }
                          : msg,
                      );
                    }
                    return prev;
                  });
                } else if (currentEventType === "progress" && parsed.message) {
                  // 🔄 PROGRESS UPDATES (transient indicator)
                  console.log("[SSE Progress]", parsed.message);
                  setProgressMessage(parsed.message);
                } else if (
                  currentEventType === "complete" ||
                  currentEventType === "done"
                ) {
                  // 🏁 STREAM COMPLETED
                  setProgressMessage("");
                } else if (parsed.content) {
                  // Fallback: legacy content format
                  assistantMessage += parsed.content;

                  setMessages((prev) => {
                    const messageExists = prev.some(
                      (m) => m.id === assistantMessageId,
                    );
                    if (!messageExists && !assistantMessageCreated) {
                      // Create assistant message on first content
                      assistantMessageCreated = true;
                      return [
                        ...prev,
                        {
                          id: assistantMessageId,
                          role: "assistant",
                          content: assistantMessage,
                          createdAt: new Date().toISOString(),
                        },
                      ];
                    } else if (messageExists) {
                      // Update existing message
                      return prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, content: assistantMessage }
                          : msg,
                      );
                    }
                    return prev;
                  });
                }

                // ⚠️ DO NOT RESET currentEventType here! It persists until next "event:" line
                // This allows multi-line data payloads for the same event type
              } catch (e) {
                console.error("[SSE Parse Error]", e, line);
                // Reset on error to prevent poison state
                currentEventType = "";
              }
            }
          }
        }
      }

      queryClient.invalidateQueries({
        queryKey: ["/api/conversations", conversationId, "messages"],
      });

      // Invalidate conversations list to trigger reordering by updatedAt
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "/api/conversations",
      });

      // Auto-generate title if conversation still has default title
      // This ensures title is generated after first successful message exchange
      if (conversationId) {
        const conversation = conversations?.find(
          (c) => c.id === conversationId,
        );
        if (conversation && conversation.title === "New Conversation") {
          // Generate a meaningful title based on the conversation content (auto-generated, no toast)
          generateTitleMutation.mutate({ conversationId, isManual: false });
        }
      }
    } catch (error) {
      toast({
        title: "Failed to send message",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsStreaming(false);
      setProgressMessage("");
      isSendingMessageRef.current = false;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Mobile: Enter adiciona nova linha, Shift+Enter não faz nada especial
    // Desktop: Enter envia, Shift+Enter adiciona nova linha
    if (e.key === "Enter") {
      if (isMobile) {
        // No mobile, Enter sempre adiciona nova linha (comportamento padrão)
        // Não fazemos nada, deixamos o textarea lidar com isso
        return;
      } else {
        // No desktop, Enter sem Shift envia a mensagem
        if (!e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
        // Shift+Enter no desktop adiciona nova linha (comportamento padrão do textarea)
      }
    }
  };

  const getQuickSuggestions = (
    lastMessage: Message | undefined,
  ): QuickSuggestion[] => {
    if (!lastMessage || lastMessage.role !== "assistant") return [];

    const content = lastMessage.content.toLowerCase();

    if (
      content.includes("cliente criado") ||
      content.includes("customer created")
    ) {
      return [
        {
          icon: DollarSign,
          text: "Criar Oportunidade",
          message: "criar oportunidade para este cliente",
        },
        {
          icon: User,
          text: "Adicionar Contacto",
          message: "adicionar contacto a este cliente",
        },
      ];
    }

    if (
      content.includes("oportunidade criada") ||
      content.includes("opportunity created")
    ) {
      return [
        {
          icon: FileText,
          text: "Criar Proposta",
          message: "criar proposta para esta oportunidade",
        },
        {
          icon: Mail,
          text: "Enviar Email",
          message: "enviar email sobre esta oportunidade",
        },
      ];
    }

    return [];
  };

  const lastMessage = messages[messages.length - 1];
  const quickSuggestions = getQuickSuggestions(lastMessage);
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Close mobile sheet when conversation is selected (stable callback)
  const handleSelectConversation = useCallback(
    (id: string) => {
      setSelectedConversationId(id);
      if (isMobile) setSheetOpen(false);
    },
    [isMobile],
  );

  return (
    <div className="flex h-full">
      {/* Desktop: Resizable Sidebar + Chat Content */}
      {!isMobile && (
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Conversations Sidebar - Resizable */}
          <ResizablePanel
            defaultSize={24}
            minSize={18}
            maxSize={35}
            className="bg-sidebar"
          >
            <Sidebar collapsible="none" className="w-full">
              <SidebarContent>
                <ConversationsSidebar
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  selectedTags={selectedTags}
                  setSelectedTags={setSelectedTags}
                  selectedEntityType={selectedEntityType}
                  setSelectedEntityType={setSelectedEntityType}
                  availableTags={availableTags}
                  conversations={conversations}
                  loadingConversations={loadingConversations}
                  selectedConversationId={selectedConversationId}
                  createConversationMutation={createConversationMutation}
                  generateTitleMutation={generateTitleMutation}
                  deleteConversationMutation={deleteConversationMutation}
                  handleSelectConversation={handleSelectConversation}
                  setEditingConversation={setEditingConversation}
                  setNewTitle={setNewTitle}
                  setRenameDialogOpen={setRenameDialogOpen}
                  setNewTags={setNewTags}
                  setTagsDialogOpen={setTagsDialogOpen}
                />
              </SidebarContent>
            </Sidebar>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Chat Area */}
          <ResizablePanel defaultSize={76}>
            <div className="flex flex-col h-full">
              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="w-full mx-auto space-y-4 pb-4 px-6">
                  {/* Proactive Suggestions */}
                  <ProactiveSuggestions />

                  {/* Pattern Automation Suggestions */}
                  <PatternAutomationSuggestions />

                  {loadingMessages ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className={i % 2 === 0 ? "flex justify-end" : ""}
                      >
                        <Skeleton className="h-20 w-3/4" />
                      </div>
                    ))
                  ) : messages.length === 0 ? (
                    <div className="space-y-6">
                      <div className="text-center py-8">
                        <h2 className="text-2xl font-bold mb-2">
                          Olá! Como posso ajudar?
                        </h2>
                        <p className="text-muted-foreground">
                          Escolha uma ação abaixo ou digite sua pergunta
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card
                          className="p-4 hover-elevate cursor-pointer transition-all"
                          onClick={() => setMessage("criar novo cliente")}
                          data-testid="welcome-card-customer"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold mb-1">
                                Gestão de Clientes
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                Criar, atualizar ou pesquisar clientes
                              </p>
                            </div>
                          </div>
                        </Card>

                        <Card
                          className="p-4 hover-elevate cursor-pointer transition-all"
                          onClick={() =>
                            setMessage("criar oportunidade de venda")
                          }
                          data-testid="welcome-card-opportunity"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <TrendingUp className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold mb-1">
                                Oportunidades
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                Gerir pipeline de vendas
                              </p>
                            </div>
                          </div>
                        </Card>

                        <Card
                          className="p-4 hover-elevate cursor-pointer transition-all"
                          onClick={() => setMessage("criar fatura")}
                          data-testid="welcome-card-invoice"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <DollarSign className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold mb-1">Financeiro</h3>
                              <p className="text-sm text-muted-foreground">
                                Faturas, pagamentos e orçamentos
                              </p>
                            </div>
                          </div>
                        </Card>

                        <Card
                          className="p-4 hover-elevate cursor-pointer transition-all"
                          onClick={() => setMessage("consultar documentos")}
                          data-testid="welcome-card-documents"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <FolderOpen className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold mb-1">Documentos</h3>
                              <p className="text-sm text-muted-foreground">
                                Gerir e pesquisar documentos
                              </p>
                            </div>
                          </div>
                        </Card>
                      </div>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      // 🔧 TOOL MESSAGE RENDERING
                      if (msg.role === "tool") {
                        const isRunning =
                          msg.metadata?.toolStatus === "running";
                        const isSuccess =
                          msg.metadata?.toolStatus === "success";
                        const isError = msg.metadata?.toolStatus === "error";

                        return (
                          <div
                            key={msg.id}
                            className="flex justify-start"
                            data-testid={`message-tool-${msg.id}`}
                          >
                            <Card
                              className={`p-3 max-w-[70%] ${
                                isError
                                  ? "bg-destructive/10 border-l-4 border-l-destructive"
                                  : isSuccess
                                    ? "bg-green-500/10 border-l-4 border-l-green-500"
                                    : "bg-accent/10 border-l-4 border-l-primary"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {isRunning && (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                                )}
                                {isSuccess && (
                                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                                )}
                                {isError && (
                                  <X className="h-4 w-4 text-destructive flex-shrink-0" />
                                )}
                                <Wrench className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium">
                                    {msg.content}
                                  </p>
                                  {msg.metadata?.toolProgress?.message && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {msg.metadata.toolProgress.message}
                                      {msg.metadata.toolProgress.percentage !==
                                        undefined &&
                                        ` (${msg.metadata.toolProgress.percentage}%)`}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </Card>
                          </div>
                        );
                      }

                      // 💬 USER & ASSISTANT MESSAGE RENDERING
                      return (
                        <div
                          key={msg.id}
                          className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                          data-testid={`message-${msg.role}`}
                        >
                          <div className="max-w-[80%] space-y-2">
                            <Card
                              className={`p-4 ${
                                msg.role === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-card border-l-4 border-l-primary"
                              }`}
                            >
                              <MessageContent
                                content={msg.content}
                                isUserMessage={msg.role === "user"}
                              />

                              {/* Attachment Chips */}
                              {msg.attachmentIds &&
                                msg.attachmentIds.length > 0 && (
                                  <div
                                    className="flex flex-wrap gap-2 mt-3"
                                    data-testid="message-attachments"
                                  >
                                    {msg.attachmentIds.map((attachmentId) => {
                                      const file = fileMetadata[attachmentId];
                                      return file ? (
                                        <AttachmentChip
                                          key={attachmentId}
                                          file={file}
                                        />
                                      ) : null;
                                    })}
                                  </div>
                                )}

                              {/* Hybrid Mode Indicator */}
                              {msg.role === "assistant" &&
                                msg.metadata?.hybridMode && (
                                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                                    <Badge
                                      variant="outline"
                                      className="text-xs flex items-center gap-1"
                                    >
                                      {msg.metadata.hybridMode ===
                                        "trivial" && (
                                        <>
                                          <Zap className="h-3 w-3" /> Instant
                                        </>
                                      )}
                                      {msg.metadata.hybridMode === "simple" && (
                                        <>
                                          <Wrench className="h-3 w-3" /> Quick
                                          Tool
                                        </>
                                      )}
                                      {msg.metadata.hybridMode ===
                                        "moderate" && (
                                        <>
                                          <Bot className="h-3 w-3" /> Multi-Tool
                                        </>
                                      )}
                                      {msg.metadata.hybridMode ===
                                        "complex" && (
                                        <>
                                          <Brain className="h-3 w-3" /> Deep AI
                                        </>
                                      )}
                                    </Badge>
                                    {msg.metadata.duration_ms && (
                                      <span className="text-xs text-muted-foreground">
                                        {(
                                          msg.metadata.duration_ms / 1000
                                        ).toFixed(1)}
                                        s
                                      </span>
                                    )}
                                  </div>
                                )}
                            </Card>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {isStreaming && progressMessage && (
                    <div
                      className="flex w-full justify-start"
                      data-testid="progress-indicator"
                    >
                      <Card className="p-4 bg-accent/10 border-l-4 border-l-primary min-w-[200px]">
                        <div className="flex items-center gap-3">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          <p className="text-sm text-muted-foreground flex">
                            {progressMessage}
                            <span className="flex items-center gap-1 px-2">
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
                      </Card>
                    </div>
                  )}

                  {/* Quick Suggestions */}
                  {quickSuggestions.length > 0 && !isStreaming && (
                    <div
                      className="flex gap-2 flex-wrap"
                      data-testid="quick-suggestions"
                    >
                      {quickSuggestions.map((suggestion, idx) => {
                        const Icon = suggestion.icon;
                        return (
                          <Button
                            key={idx}
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setMessage(suggestion.message);
                              document
                                .querySelector<HTMLInputElement>(
                                  '[data-testid="input-message"]',
                                )
                                ?.focus();
                            }}
                            data-testid={`button-suggestion-${idx}`}
                          >
                            <Icon className="mr-1.5 h-3.5 w-3.5" />
                            {suggestion.text}
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input with safe-area support - Always visible */}
              <div
                className="border-t p-4 bg-background"
                style={{
                  paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
                }}
              >
                <div className="max-w-3xl mx-auto space-y-3">
                  {/* AI Blocked Banner */}
                  {!subscriptionStatus.canUseAI && !subscriptionStatus.isLoading && subscriptionStatus.reason && subscriptionStatus.message && subscriptionStatus.actionLabel && subscriptionStatus.actionPath && (
                    <AIBlockedBanner
                      reason={subscriptionStatus.reason}
                      message={subscriptionStatus.message}
                      actionLabel={subscriptionStatus.actionLabel}
                      actionPath={subscriptionStatus.actionPath}
                      creditBalance={subscriptionStatus.creditBalance}
                    />
                  )}

                  {/* File Previews */}
                  {selectedFiles.length > 0 && (
                    <div
                      className="flex flex-wrap gap-2"
                      data-testid="file-previews"
                    >
                      {selectedFiles.map(({ file, preview, id }) => (
                        <Card
                          key={id}
                          className="relative p-2 flex items-center gap-2 max-w-xs"
                          data-testid={`file-preview-${id}`}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                            onClick={() => removeFile(id)}
                            data-testid={`button-remove-file-${id}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                          {preview ? (
                            <img
                              src={preview}
                              alt={file.name}
                              className="h-12 w-12 object-cover rounded"
                            />
                          ) : (
                            <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
                              <File className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {file.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Input Row */}
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setAttachmentSheetOpen(true)}
                      disabled={isStreaming || isUploadingFiles}
                      data-testid="button-attach-file"
                    >
                      {isUploadingFiles ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Paperclip className="h-5 w-5" />
                      )}
                    </Button>
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder={
                        !subscriptionStatus.canUseAI 
                          ? "AI features unavailable"
                          : "Escreva sua mensagem..."
                      }
                      disabled={isStreaming || isUploadingFiles || !subscriptionStatus.canUseAI}
                      data-testid="input-message"
                      className="flex-1 min-h-10 max-h-32 resize-none"
                      rows={1}
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={
                        (!message.trim() && selectedFiles.length === 0) ||
                        isStreaming ||
                        isUploadingFiles ||
                        !subscriptionStatus.canUseAI
                      }
                      data-testid="button-send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Attachment Sheet */}
              <AttachmentSheet
                open={attachmentSheetOpen}
                onOpenChange={setAttachmentSheetOpen}
                onFileSelect={handleFileSelect}
              />

              {/* Rename Dialog */}
              <Dialog
                open={renameDialogOpen}
                onOpenChange={setRenameDialogOpen}
              >
                <DialogContent onClick={(e) => e.stopPropagation()}>
                  <DialogHeader>
                    <DialogTitle>Renomear Conversa</DialogTitle>
                    <DialogDescription>
                      Escolha um novo nome para esta conversa
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Título</Label>
                      <Input
                        id="title"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="Digite o novo título..."
                        data-testid="input-rename-title"
                      />
                    </div>
                  </div>
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
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => {
                        if (editingConversation && newTitle.trim()) {
                          renameMutation.mutate({
                            id: editingConversation.id,
                            title: newTitle.trim(),
                          });
                        }
                      }}
                      disabled={!newTitle.trim() || renameMutation.isPending}
                      data-testid="button-save-rename"
                    >
                      {renameMutation.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Tags Dialog */}
              <Dialog open={tagsDialogOpen} onOpenChange={setTagsDialogOpen}>
                <DialogContent onClick={(e) => e.stopPropagation()}>
                  <DialogHeader>
                    <DialogTitle>Adicionar Tags</DialogTitle>
                    <DialogDescription>
                      Adicione tags separadas por vírgula para organizar suas
                      conversas
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
                      <Input
                        id="tags"
                        value={newTags}
                        onChange={(e) => setNewTags(e.target.value)}
                        placeholder="urgente, cliente, vendas..."
                        data-testid="input-tags"
                      />
                      <p className="text-xs text-muted-foreground">
                        Exemplo: urgente, cliente, vendas
                      </p>
                    </div>
                    {availableTags.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          Tags existentes
                        </Label>
                        <div className="flex flex-wrap gap-1">
                          {availableTags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="cursor-pointer hover-elevate text-xs"
                              onClick={() => {
                                const currentTags = newTags
                                  .split(",")
                                  .map((t) => t.trim())
                                  .filter(Boolean);
                                if (!currentTags.includes(tag)) {
                                  setNewTags([...currentTags, tag].join(", "));
                                }
                              }}
                              data-testid={`available-tag-${tag}`}
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTagsDialogOpen(false);
                        setEditingConversation(null);
                        setNewTags("");
                      }}
                      data-testid="button-cancel-tags"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => {
                        if (editingConversation) {
                          const tagsArray = newTags
                            .split(",")
                            .map((t) => t.trim())
                            .filter(Boolean);
                          updateTagsMutation.mutate({
                            id: editingConversation.id,
                            tags: tagsArray,
                          });
                        }
                      }}
                      disabled={updateTagsMutation.isPending}
                      data-testid="button-save-tags"
                    >
                      {updateTagsMutation.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      {/* Mobile: Sheet Drawer + Chat Content */}
      {isMobile && (
        <>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="left" className="p-0">
              <ConversationsSidebar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedTags={selectedTags}
                setSelectedTags={setSelectedTags}
                selectedEntityType={selectedEntityType}
                setSelectedEntityType={setSelectedEntityType}
                availableTags={availableTags}
                conversations={conversations}
                loadingConversations={loadingConversations}
                selectedConversationId={selectedConversationId}
                createConversationMutation={createConversationMutation}
                generateTitleMutation={generateTitleMutation}
                deleteConversationMutation={deleteConversationMutation}
                handleSelectConversation={handleSelectConversation}
                setEditingConversation={setEditingConversation}
                setNewTitle={setNewTitle}
                setRenameDialogOpen={setRenameDialogOpen}
                setNewTags={setNewTags}
                setTagsDialogOpen={setTagsDialogOpen}
              />
            </SheetContent>
          </Sheet>

          {/* Mobile Chat Content (no resizable) */}
          <div className="flex flex-col h-full">
            {/* Mobile Header with Hamburger */}
            <div className="border-b p-3 flex items-center gap-3 bg-card">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSheetOpen(true)}
                data-testid="button-mobile-menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="font-semibold">AssistME</h1>
                <p className="text-xs text-muted-foreground">
                  Assistente Operacional
                </p>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="max-w-3xl mx-auto space-y-4 pb-4">
                {/* Proactive Suggestions */}
                <ProactiveSuggestions />

                {/* Pattern Automation Suggestions */}
                <PatternAutomationSuggestions />

                {loadingMessages ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className={i % 2 === 0 ? "flex justify-end" : ""}
                    >
                      <Skeleton className="h-20 w-3/4" />
                    </div>
                  ))
                ) : messages.length === 0 ? (
                  <div className="space-y-6">
                    <div className="text-center py-8">
                      <h2 className="text-2xl font-bold mb-2">
                        Olá! Como posso ajudar?
                      </h2>
                      <p className="text-muted-foreground">
                        Escolha uma ação abaixo ou digite sua pergunta
                      </p>
                    </div>

                    {/* Welcome cards - same as desktop */}
                    <div className="grid grid-cols-1 gap-4">
                      <Card
                        className="p-4 hover-elevate cursor-pointer transition-all"
                        onClick={() => setMessage("criar novo cliente")}
                        data-testid="welcome-card-customer"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Users className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1">
                              Gestão de Clientes
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Criar, atualizar ou pesquisar clientes
                            </p>
                          </div>
                        </div>
                      </Card>

                      <Card
                        className="p-4 hover-elevate cursor-pointer transition-all"
                        onClick={() =>
                          setMessage("criar oportunidade de venda")
                        }
                        data-testid="welcome-card-opportunity"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <TrendingUp className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1">
                              Oportunidades
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Gerir pipeline de vendas
                            </p>
                          </div>
                        </div>
                      </Card>

                      <Card
                        className="p-4 hover-elevate cursor-pointer transition-all"
                        onClick={() => setMessage("criar fatura")}
                        data-testid="welcome-card-invoice"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <DollarSign className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1">Financeiro</h3>
                            <p className="text-sm text-muted-foreground">
                              Faturas, pagamentos e orçamentos
                            </p>
                          </div>
                        </div>
                      </Card>

                      <Card
                        className="p-4 hover-elevate cursor-pointer transition-all"
                        onClick={() => setMessage("consultar documentos")}
                        data-testid="welcome-card-documents"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <FolderOpen className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1">Documentos</h3>
                            <p className="text-sm text-muted-foreground">
                              Gerir e pesquisar documentos
                            </p>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isUser = msg.role === "user";
                    return (
                      <div
                        key={msg.id}
                        className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
                        data-testid={`message-${msg.id}`}
                      >
                        <Card
                          className={`p-4 max-w-[85%] ${isUser ? "bg-primary text-primary-foreground" : ""}`}
                        >
                          {msg.metadata?.toolCalls && (
                            <ToolInvocationDisplay
                              toolCalls={msg.metadata.toolCalls}
                            />
                          )}
                          <MessageContent
                            content={msg.content}
                            isUserMessage={isUser}
                          />
                          {msg.attachmentIds && (
                            <AttachmentDisplay
                              attachmentIds={msg.attachmentIds}
                            />
                          )}
                        </Card>
                      </div>
                    );
                  })
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input with safe-area support */}
            <div
              className="border-t p-2 bg-background"
              style={{
                paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
              }}
            >
              <div className="max-w-3xl mx-auto space-y-2">
                {/* File Previews */}
                {selectedFiles.length > 0 && (
                  <div
                    className="flex flex-wrap gap-2"
                    data-testid="file-previews-mobile"
                  >
                    {selectedFiles.map(({ file, preview, id }) => (
                      <Card
                        key={id}
                        className="relative p-2 flex items-center gap-2 max-w-xs"
                        data-testid={`file-preview-mobile-${id}`}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                          onClick={() => removeFile(id)}
                          data-testid={`button-remove-file-mobile-${id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        {preview ? (
                          <img
                            src={preview}
                            alt={file.name}
                            className="h-12 w-12 object-cover rounded"
                          />
                        ) : (
                          <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
                            <File className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {/* AI Blocked Banner (Mobile) */}
                {!subscriptionStatus.canUseAI && !subscriptionStatus.isLoading && subscriptionStatus.reason && subscriptionStatus.message && subscriptionStatus.actionLabel && subscriptionStatus.actionPath && (
                  <AIBlockedBanner
                    reason={subscriptionStatus.reason}
                    message={subscriptionStatus.message}
                    actionLabel={subscriptionStatus.actionLabel}
                    actionPath={subscriptionStatus.actionPath}
                    creditBalance={subscriptionStatus.creditBalance}
                  />
                )}

                {/* Input Row */}
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAttachmentSheetOpen(true)}
                    disabled={isStreaming || isUploadingFiles || !subscriptionStatus.canUseAI}
                    data-testid="button-attach-file-mobile"
                  >
                    {isUploadingFiles ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Paperclip className="h-5 w-5" />
                    )}
                  </Button>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder={
                      !subscriptionStatus.canUseAI 
                        ? subscriptionStatus.message || "AI features unavailable"
                        : "Escreva sua mensagem..."
                    }
                    disabled={isStreaming || isUploadingFiles || !subscriptionStatus.canUseAI}
                    data-testid="input-message-mobile"
                    className="flex-1 min-h-10 max-h-32 resize-none"
                    rows={1}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={
                      (!message.trim() && selectedFiles.length === 0) ||
                      isStreaming ||
                      isUploadingFiles ||
                      !subscriptionStatus.canUseAI
                    }
                    data-testid="button-send-mobile"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Mobile also needs AttachmentSheet and Dialogs */}
            <AttachmentSheet
              open={attachmentSheetOpen}
              onOpenChange={setAttachmentSheetOpen}
              onFileSelect={handleFileSelect}
            />

            <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
              <DialogContent onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                  <DialogTitle>Renomear Conversa</DialogTitle>
                  <DialogDescription>
                    Escolha um novo nome para esta conversa
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title-mobile">Título</Label>
                    <Input
                      id="title-mobile"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Digite o novo título..."
                      data-testid="input-rename-title-mobile"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRenameDialogOpen(false);
                      setEditingConversation(null);
                      setNewTitle("");
                    }}
                    data-testid="button-cancel-rename-mobile"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => {
                      if (editingConversation && newTitle.trim()) {
                        renameMutation.mutate({
                          id: editingConversation.id,
                          title: newTitle.trim(),
                        });
                      }
                    }}
                    disabled={!newTitle.trim() || renameMutation.isPending}
                    data-testid="button-save-rename-mobile"
                  >
                    {renameMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={tagsDialogOpen} onOpenChange={setTagsDialogOpen}>
              <DialogContent onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                  <DialogTitle>Adicionar Tags</DialogTitle>
                  <DialogDescription>
                    Adicione tags separadas por vírgula para organizar suas
                    conversas
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="tags-mobile">
                      Tags (separadas por vírgula)
                    </Label>
                    <Input
                      id="tags-mobile"
                      value={newTags}
                      onChange={(e) => setNewTags(e.target.value)}
                      placeholder="urgente, cliente, vendas..."
                      data-testid="input-tags-mobile"
                    />
                    <p className="text-xs text-muted-foreground">
                      Exemplo: urgente, cliente, vendas
                    </p>
                  </div>
                  {availableTags.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Tags existentes
                      </Label>
                      <div className="flex flex-wrap gap-1">
                        {availableTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="cursor-pointer hover-elevate text-xs"
                            onClick={() => {
                              const currentTags = newTags
                                .split(",")
                                .map((t) => t.trim())
                                .filter(Boolean);
                              if (!currentTags.includes(tag)) {
                                setNewTags([...currentTags, tag].join(", "));
                              }
                            }}
                            data-testid={`available-tag-mobile-${tag}`}
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTagsDialogOpen(false);
                      setEditingConversation(null);
                      setNewTags("");
                    }}
                    data-testid="button-cancel-tags-mobile"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => {
                      if (editingConversation) {
                        const tagsArray = newTags
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean);
                        updateTagsMutation.mutate({
                          id: editingConversation.id,
                          tags: tagsArray,
                        });
                      }
                    }}
                    disabled={updateTagsMutation.isPending}
                    data-testid="button-save-tags-mobile"
                  >
                    {updateTagsMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </>
      )}
    </div>
  );
}
