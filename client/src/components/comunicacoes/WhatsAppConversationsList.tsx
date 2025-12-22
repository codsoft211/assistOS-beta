import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone } from "lucide-react";
import { formatDistanceToNow, Locale } from "date-fns";

interface WhatsAppContact {
  id: string;
  phoneNumber: string;
  waId: string | null;
  name: string | null;
  profilePicUrl: string | null;
  optInStatus: string;
  tags: string[] | null;
  language: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  lastMessageDirection: string | null;
}

interface WhatsAppConversation {
  id: string;
  waConversationId: string | null;
  contactId: string;
  accountId: string;
  status: 'open' | 'closed';
  unreadCount: number;
  lastInboundMessageAt: string | null;
  lastOutboundMessageAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  contact: WhatsAppContact;
  account: {
    id: string;
    phoneNumber: string;
    displayName: string | null;
  };
}

interface ConversationItemProps {
  conversation: WhatsAppConversation;
  onClick: () => void;
  locale?: Locale;
}

function ConversationItem({ conversation, onClick, locale }: ConversationItemProps) {
  const { contact } = conversation;
  const lastMessageTime = conversation.lastMessageAt || 
                          conversation.lastInboundMessageAt || 
                          conversation.lastOutboundMessageAt;

  return (
    <Card
      className={`hover-elevate transition-colors cursor-pointer ${
        conversation.unreadCount > 0 ? 'bg-accent/5' : ''
      }`}
      onClick={onClick}
      data-testid={`card-conversation-${conversation.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={contact.profilePicUrl || undefined} />
            <AvatarFallback>
              {contact.name 
                ? contact.name.charAt(0).toUpperCase() 
                : contact.phoneNumber.charAt(0)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p
                  className="font-medium truncate"
                  data-testid={`text-contact-name-${conversation.id}`}
                >
                  {contact.name || contact.phoneNumber}
                </p>
                {conversation.unreadCount > 0 && (
                  <Badge variant="default" data-testid={`badge-unread-${conversation.id}`}>
                    {conversation.unreadCount} não {conversation.unreadCount === 1 ? 'lida' : 'lidas'}
                  </Badge>
                )}
                {conversation.status === 'closed' && (
                  <Badge variant="secondary" data-testid={`badge-closed-${conversation.id}`}>
                    Fechada
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {lastMessageTime && (
                  <p
                    className="text-xs text-muted-foreground whitespace-nowrap"
                    data-testid={`text-time-${conversation.id}`}
                  >
                    {formatDistanceToNow(new Date(lastMessageTime), {
                      addSuffix: true,
                      locale,
                    })}
                  </p>
                )}
              </div>
            </div>

            {contact.name && (
              <p
                className="text-xs text-muted-foreground mb-1"
                data-testid={`text-phone-${conversation.id}`}
              >
                {contact.phoneNumber}
              </p>
            )}

            {conversation.lastMessagePreview && (
              <p
                className={`text-sm text-muted-foreground line-clamp-2 ${
                  conversation.unreadCount > 0 ? 'font-medium' : ''
                }`}
                data-testid={`text-preview-${conversation.id}`}
              >
                {conversation.lastMessagePreview}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface WhatsAppConversationsListProps {
  onConversationClick: (conversationId: string) => void;
  showHeader?: boolean;
  emptyMessage?: string;
  locale?: Locale;
}

export default function WhatsAppConversationsList({
  onConversationClick,
  showHeader = true,
  emptyMessage = "Your WhatsApp conversations will appear here once you start receiving messages.",
  locale,
}: WhatsAppConversationsListProps) {
  const { data: conversationsData, isLoading } = useQuery<{
    conversations: WhatsAppConversation[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ['/api/whatsapp/conversations'],
  });

  const conversations = conversationsData?.conversations || [];

  if (isLoading) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle>Conversas</CardTitle>
            <CardDescription>WhatsApp conversations</CardDescription>
          </CardHeader>
        )}
        <CardContent className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24" data-testid={`skeleton-conversation-${i}`} />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {showHeader && (
        <CardHeader>
          <CardTitle data-testid="text-whatsapp-inbox-title">Conversas</CardTitle>
          <CardDescription>
            {conversationsData?.pagination 
              ? `${conversationsData.pagination.total} conversa(s) no total`
              : "Loading conversations..."}
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-2">
        {conversations.length === 0 ? (
          <div className="text-center py-12" data-testid="empty-state-whatsapp">
            <Phone className="h-16 w-16 mx-auto text-muted-foreground opacity-50" />
            <h3 className="mt-4 text-lg font-semibold">Nenhuma conversa</h3>
            <p className="text-muted-foreground mt-2">{emptyMessage}</p>
          </div>
        ) : (
          conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              onClick={() => onConversationClick(conversation.id)}
              locale={locale}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
