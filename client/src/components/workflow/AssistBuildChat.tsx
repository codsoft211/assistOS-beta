import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useConversationMutations } from "@/hooks/useConversationMutations";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { assistbuildConversationApi } from "@/lib/conversations";
import type { ConversationConfig } from "@/lib/conversations";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Send,
    Loader2,
    Paperclip,
    X,
    Bot
} from "lucide-react";
import SafeMessageRenderer from "@/components/studio/SafeMessageRenderer";
import { queryClient } from "@/lib/queryClient";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
}

interface AssistBuildChatProps {
    workflowId?: string;
    className?: string;
}

export function AssistBuildChat({ workflowId, className }: AssistBuildChatProps) {
    const { toast } = useToast();
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState<Message[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isCreatingConversation, setIsCreatingConversation] = useState(false);
    const [progressMessage, setProgressMessage] = useState<string>("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isFirstMessageFlowRef = useRef(false);
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

    const conversationConfig: ConversationConfig = {
        agentType: "assistbuild",
        queryKeyRoot: "/api/assistbuild/conversations",
        defaultTitle: `Workflow Builder - ${workflowId || 'New'}`,
    };

    const subscriptionStatus = useSubscriptionStatus();

    const { createConversationMutation } = useConversationMutations(conversationConfig);

    // Load existing conversation or start fresh linked to this workflow
    // NOTE: Logic to link conversation to workflow ID might need backend support if we want persistent 1:1 mapping.
    // For now, we'll start a new session or load last one if possible, but simplicity suggests new session for context unless we store conversationId with workflow.
    // Ideally, we passed conversationId in props, but for now let's just maintain local session state.

    // Fetch messages if we have a conversationId
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
        enabled: !!conversationId,
    });

    useEffect(() => {
        if (fetchedMessages && !isStreaming && !isFetchingMessages) {
            setMessages(prev => {
                if (JSON.stringify(prev) !== JSON.stringify(fetchedMessages)) {
                    return fetchedMessages;
                }
                return prev;
            });
        }
    }, [fetchedMessages, isStreaming, isFetchingMessages]);

    useEffect(() => {
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    // Allowed file types
    const ALLOWED_FILE_TYPES = [
        ".csv", ".xlsx", ".xls", ".json",
        "text/csv", "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/json",
    ];

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;

        const newFiles: File[] = [];
        const errors: string[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const isValidType = ALLOWED_FILE_TYPES.some(type =>
                type.startsWith('.')
                    ? file.name.toLowerCase().endsWith(type)
                    : file.type === type
            );

            if (!isValidType) {
                errors.push(`${file.name}: Invalid file type.`);
                continue;
            }
            if (file.size > 10 * 1024 * 1024) {
                errors.push(`${file.name}: File too large (max 10MB)`);
                continue;
            }
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
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSendMessage = async () => {
        if ((!message.trim() && attachedFiles.length === 0) || isStreaming) return;

        if (!subscriptionStatus.canUseAI) {
            toast({
                title: subscriptionStatus.reason === 'no_subscription' ? 'Subscription Required' : 'Credits Depleted',
                description: subscriptionStatus.message,
                variant: 'destructive',
            });
            return;
        }

        const userMessage = message.trim();
        const filesToSend = [...attachedFiles];
        setMessage("");
        setAttachedFiles([]);

        // Auto height reset
        if (textareaRef.current) textareaRef.current.style.height = "auto";

        let activeConversationId = conversationId;
        if (!activeConversationId) {
            isFirstMessageFlowRef.current = true;
            setIsCreatingConversation(true);
            setProgressMessage("💬 Starting conversation...");
            try {
                const data = await createConversationMutation.mutateAsync(
                    userMessage || conversationConfig.defaultTitle
                );
                activeConversationId = data.conversation.id;
                setConversationId(data.conversation.id);
            } catch (error: any) {
                console.error("Failed to create conversation:", error);
                setIsCreatingConversation(false);
                setProgressMessage("");
                return;
            } finally {
                setIsCreatingConversation(false);
            }
        }

        if (!activeConversationId) return;

        // Add user message to UI
        const displayContent = filesToSend.length > 0
            ? `${userMessage}\n\n📎 Attached: ${filesToSend.map(f => f.name).join(', ')}`
            : userMessage;

        const newUserMessage: Message = {
            id: crypto.randomUUID(),
            role: "user",
            content: displayContent,
            createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, newUserMessage]);

        // Add placeholder assistant message
        const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMessage]);

        setIsStreaming(true);
        setProgressMessage(filesToSend.length > 0 ? "📎 Uploading..." : "Thinking...");

        try {
            let fetchOptions: RequestInit;
            if (filesToSend.length > 0) {
                const formData = new FormData();
                formData.append('content', userMessage);
                filesToSend.forEach(file => formData.append('files', file));
                fetchOptions = { method: "POST", body: formData, credentials: "include" };
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
                fetchOptions
            );

            if (!response.ok) throw new Error("Failed to send message");
            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let shouldStop = false;

            while (!shouldStop) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        if (data === "[DONE]") {
                            setProgressMessage("");
                            shouldStop = true;
                            isFirstMessageFlowRef.current = false;
                            break;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.type === "error") {
                                toast({ title: "Error", description: parsed.error, variant: "destructive" });
                            } else if (parsed.content) {
                                setMessages(prev => {
                                    const newMsgs = [...prev];
                                    const lastMsg = newMsgs[newMsgs.length - 1];
                                    if (lastMsg.role === "assistant") {
                                        lastMsg.content += parsed.content;
                                    }
                                    return newMsgs;
                                });
                            }
                        } catch (e) {
                            // ignore parse error of partial chunks
                        }
                    }
                }
            }

            // After streaming done, invalidate query to ensure everything syncs up eventually
            queryClient.invalidateQueries({
                queryKey: [conversationConfig.queryKeyRoot, conversationConfig.agentType, conversationId, "messages"]
            });

        } catch (error) {
            console.error("Streaming error:", error);
            setIsStreaming(false);
            setProgressMessage("");
            setMessages(prev => prev.slice(0, -1)); // Remove the empty assistant message
            toast({ title: "Error", description: "Failed to create response.", variant: "destructive" });
        } finally {
            setIsStreaming(false);
            setProgressMessage("");
        }
    };

    return (
        <div className={`flex flex-col h-full bg-background border-l ${className}`}>
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between bg-muted/30">
                <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-sm">AssistBuild AI</h3>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-hidden relative">
                <ScrollArea className="h-full px-4 py-4">
                    {messages.length === 0 && !isCreatingConversation ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground opacity-50 space-y-4 mt-12">
                            <Bot className="w-12 h-12 mb-2" />
                            <p className="text-sm">Ask me to help you build or configure your workflow.</p>
                        </div>
                    ) : (
                        <div className="space-y-6 pb-4">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`text-[10px] text-muted-foreground uppercase px-1`}>
                                        {msg.role === 'user' ? 'You' : 'AssistBuild'}
                                    </div>
                                    <div className={`max-w-[90%] ${msg.role === 'user' ? '' : 'w-full'}`}>
                                        {msg.role === 'user' ? (
                                            <div className="bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm whitespace-pre-wrap">
                                                {msg.content}
                                            </div>
                                        ) : (
                                            <SafeMessageRenderer content={msg.content} messageId={msg.id} isStreaming={isStreaming} />
                                        )}
                                    </div>
                                </div>
                            ))}
                            {/* Render ghost message while creating conversation */}
                            {isCreatingConversation && (
                                <div className="flex items-start gap-2">
                                    <Skeleton className="h-8 w-8 rounded-full" />
                                    <div className="space-y-2">
                                        <Skeleton className="h-4 w-[200px]" />
                                        <Skeleton className="h-4 w-[150px]" />
                                    </div>
                                </div>
                            )}
                            {/* Invisible div for auto-scrolling */}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </ScrollArea>

                {/* Progress indicator overlay */}
                {(isStreaming || isCreatingConversation) && progressMessage && (
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center z-10">
                        <div className="bg-background/80 backdrop-blur border text-xs py-1 px-3 rounded-full shadow-sm flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>{progressMessage}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t bg-background">
                {/* File attachments preview */}
                {attachedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                        {attachedFiles.map((file, i) => (
                            <div key={i} className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-xs group">
                                <Paperclip className="w-3 h-3 text-muted-foreground" />
                                <span className="truncate max-w-[100px]">{file.name}</span>
                                <button onClick={() => setAttachedFiles(f => f.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="relative flex items-end gap-2 border rounded-xl p-2 bg-muted/20 focus-within:ring-1 ring-primary/20 transition-all">
                    <input
                        type="file"
                        multiple
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept=".csv,.xlsx,.xls,.json"
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Paperclip className="w-4 h-4" />
                    </Button>

                    <Textarea
                        ref={textareaRef}
                        value={message}
                        onChange={(e) => {
                            setMessage(e.target.value);
                            e.target.style.height = "auto";
                            e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        placeholder="Describe workflow changes..."
                        className="min-h-[32px] max-h-[150px] resize-none border-0 focus-visible:ring-0 shadow-none bg-transparent py-1.5 px-0 text-sm"
                        rows={1}
                    />

                    <Button
                        size="icon"
                        className="h-8 w-8 rounded-lg shrink-0"
                        disabled={(!message.trim() && attachedFiles.length === 0) || isStreaming || isCreatingConversation}
                        onClick={handleSendMessage}
                    >
                        {isStreaming ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </Button>
                </div>
                <div className="text-[10px] text-center text-muted-foreground mt-2">
                    AI can make mistakes. Review generated workflows.
                </div>
            </div>
        </div>
    );
}
