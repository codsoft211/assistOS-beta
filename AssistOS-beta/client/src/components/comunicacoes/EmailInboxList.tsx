import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Mail, MailOpen, Star, Paperclip } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { queryClient } from "@/lib/queryClient";

interface EmailMessage {
  id: string;
  threadId: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddress: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  isRead: boolean | null;
  isStarred: boolean | null;
  receivedAt: string;
  attachments: any;
}

interface ThreadGroup {
  threadId: string;
  messages: EmailMessage[];
  subject: string | null;
  lastMessageAt: string;
  hasUnread: boolean;
  hasStarred: boolean;
  hasAttachments: boolean;
  messageCount: number;
}

function groupByThreads(emails: EmailMessage[]): ThreadGroup[] {
  const threadMap = new Map<string, EmailMessage[]>();

  emails.forEach((email) => {
    const threadId = email.threadId || email.id;
    if (!threadMap.has(threadId)) {
      threadMap.set(threadId, []);
    }
    threadMap.get(threadId)!.push(email);
  });

  const threadGroups: ThreadGroup[] = [];
  threadMap.forEach((messages, threadId) => {
    messages.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

    const hasUnread = messages.some(m => !m.isRead);
    const hasStarred = messages.some(m => m.isStarred);
    const hasAttachments = messages.some(m => m.attachments && Array.isArray(m.attachments) && m.attachments.length > 0);

    threadGroups.push({
      threadId,
      messages,
      subject: messages[0].subject,
      lastMessageAt: messages[0].receivedAt,
      hasUnread,
      hasStarred,
      hasAttachments,
      messageCount: messages.length,
    });
  });

  threadGroups.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  return threadGroups;
}

interface ThreadCardProps {
  thread: ThreadGroup;
  isExpanded: boolean;
  onToggle: () => void;
}

function ThreadCard({ thread, isExpanded, onToggle }: ThreadCardProps) {
  const latestMessage = thread.messages[0];

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className={`hover-elevate ${thread.hasUnread ? 'border-primary/50' : ''}`}>
        <CollapsibleTrigger className="w-full" data-testid={`thread-${thread.threadId}`}>
          <CardHeader className="cursor-pointer">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="pt-1">
                  {thread.hasUnread ? (
                    <Mail className="w-5 h-5 text-primary" data-testid="icon-unread" />
                  ) : (
                    <MailOpen className="w-5 h-5 text-muted-foreground" data-testid="icon-read" />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-medium truncate ${thread.hasUnread ? 'font-bold' : ''}`}>
                      {latestMessage.fromName || latestMessage.fromAddress}
                    </span>
                    {thread.messageCount > 1 && (
                      <Badge variant="secondary" className="text-xs" data-testid={`badge-count-${thread.threadId}`}>
                        {thread.messageCount}
                      </Badge>
                    )}
                    {thread.hasStarred && (
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" data-testid="icon-starred" />
                    )}
                    {thread.hasAttachments && (
                      <Paperclip className="w-4 h-4 text-muted-foreground" data-testid="icon-attachment" />
                    )}
                  </div>
                  <div className={`text-sm truncate ${thread.hasUnread ? 'font-semibold' : ''}`}>
                    {thread.subject || "(No Subject)"}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">
                    {latestMessage.snippet}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(latestMessage.receivedAt), { addSuffix: true })}
                </span>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            <div className="border-t pt-4">
              {thread.messages.map((message, index) => (
                <div
                  key={message.id}
                  className={`space-y-2 ${index > 0 ? 'mt-4 pt-4 border-t' : ''}`}
                  data-testid={`message-${message.id}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">
                        {message.fromName || message.fromAddress}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {message.fromAddress}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(message.receivedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {message.isStarred && (
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      )}
                      {!message.isRead && (
                        <Badge variant="secondary" className="text-xs">Unread</Badge>
                      )}
                    </div>
                  </div>

                  {message.attachments && Array.isArray(message.attachments) && message.attachments.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {message.attachments.map((att: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          <Paperclip className="w-3 h-3 mr-1" />
                          {att.filename}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="bg-muted/50 rounded-md p-4 text-sm">
                    {message.bodyHtml ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
                        className="prose prose-sm max-w-none"
                      />
                    ) : (
                      <div className="whitespace-pre-wrap">{message.bodyText}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

interface EmailInboxListProps {
  showHeader?: boolean;
  emptyMessage?: string;
  locale?: Locale;
}

export default function EmailInboxList({ 
  showHeader = true, 
  emptyMessage = "No emails in inbox. Sync your Gmail account to see messages.",
}: EmailInboxListProps) {
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  const { data: messagesData, isLoading } = useQuery({
    queryKey: ["/api/gmail/messages"],
  });

  const emails: EmailMessage[] = (messagesData as any)?.emails || [];
  const threadGroups: ThreadGroup[] = groupByThreads(emails);

  const toggleThread = (threadId: string) => {
    const newExpanded = new Set(expandedThreads);
    if (newExpanded.has(threadId)) {
      newExpanded.delete(threadId);
    } else {
      newExpanded.add(threadId);
    }
    setExpandedThreads(newExpanded);
  };

  if (isLoading) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle>Conversations</CardTitle>
            <CardDescription>Emails grouped by conversation thread</CardDescription>
          </CardHeader>
        )}
        <CardContent className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24" data-testid={`skeleton-email-${i}`} />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {showHeader && (
        <CardHeader>
          <CardTitle data-testid="text-email-inbox-title">Conversations</CardTitle>
          <CardDescription>
            {emails.length} emails in {threadGroups.length} conversations
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-2">
        {threadGroups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="empty-state-emails">
            {emptyMessage}
          </div>
        ) : (
          threadGroups.map((thread) => (
            <ThreadCard
              key={thread.threadId}
              thread={thread}
              isExpanded={expandedThreads.has(thread.threadId)}
              onToggle={() => toggleThread(thread.threadId)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
