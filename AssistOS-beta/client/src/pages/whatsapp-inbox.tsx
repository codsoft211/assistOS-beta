import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Phone, 
  MapPin, 
  FileText, 
  Image as ImageIcon,
  Video,
  Music,
  Download,
  Check,
  CheckCheck,
  Clock,
  XCircle,
  ChevronLeft,
  ArrowLeft,
  Filter,
  Send,
  Paperclip,
  X,
  FileType,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { SelectWhatsappConversation, SelectWhatsappMessage, SelectWhatsappContact } from "@shared/schema";
import { cn } from "@/lib/utils";
import { WhatsAppMessageActions } from "@/components/comunicacoes/WhatsAppMessageActions";
import { WhatsAppConversationActions } from "@/components/comunicacoes/WhatsAppConversationActions";
import { useTypingIndicator } from "@/components/comunicacoes/WhatsAppTypingIndicator";

type ConversationWithRelations = SelectWhatsappConversation & {
  contact: SelectWhatsappContact;
  account: { id: string; phoneNumber: string; displayName: string | null; connectionType?: string };
  lastMessage?: {
    id: string;
    text: string | null;
    type: string;
    direction: string;
    timestamp: Date;
  } | null;
};

interface MessageDisplayProps {
  message: SelectWhatsappMessage;
  conversation?: ConversationWithRelations;
}

function formatTimestamp(timestamp: Date | string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffInDays === 0) {
    return format(date, 'HH:mm');
  } else if (diffInDays < 7) {
    return format(date, 'EEE HH:mm');
  } else {
    return format(date, 'dd/MM/yyyy');
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'read':
      return <CheckCheck className="h-3 w-3 text-blue-500" />;
    case 'delivered':
      return <CheckCheck className="h-3 w-3" />;
    case 'sent':
      return <Check className="h-3 w-3" />;
    case 'failed':
      return <XCircle className="h-3 w-3 text-destructive" />;
    default:
      return <Clock className="h-3 w-3" />;
  }
}

function MessageBubble({ message, conversation }: MessageDisplayProps) {
  const { toast } = useToast();
  const isOutbound = message.direction === 'outbound';
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  
  // Cast message type to string to avoid TypeScript issues with dynamic types
  const messageType = String(message.type);
  
  // System notifications should be centered
  const isSystemNotification = ['e2e_notification', 'notification', 'notification_template', 'gp2', 'group_notification'].includes(messageType);
  
  // Debug log
  console.log('[MessageBubble] Rendering message:', {
    id: message.id,
    type: messageType,
    text: message.text,
    hasText: !!message.text,
    textLength: message.text?.length
  });

  useEffect(() => {
    // Check if message has media reference (either mediaId or mediaUrl)
    const hasMediaReference = message.mediaId || message.mediaUrl;
    const isMediaType = ['image', 'video', 'audio', 'document', 'sticker', 'ptt'].includes(message.type);
    
    if (hasMediaReference && isMediaType) {
      console.log(`[WhatsApp UI] Fetching media for message ${message.id}, type: ${message.type}, hasMediaId: ${!!message.mediaId}, hasMediaUrl: ${!!message.mediaUrl}`);
      setLoadingMedia(true);
      
      fetch(`/api/whatsapp/media/${message.id}/url`)
        .then(res => {
          if (!res.ok) {
            throw new Error(`Failed to fetch media URL: ${res.status} ${res.statusText}`);
          }
          return res.json();
        })
        .then(data => {
          console.log(`[WhatsApp UI] Media URL received for ${message.id}:`, data.url.substring(0, 80));
          setMediaUrl(data.url);
          setLoadingMedia(false);
        })
        .catch(err => {
          console.error('[WhatsApp UI] Failed to load media:', err);
          setLoadingMedia(false);
        });
    }
  }, [message.id, message.mediaId, message.mediaUrl, message.type]);

  const handleDownload = () => {
    if (mediaUrl) {
      window.open(mediaUrl, '_blank');
    }
  };

  // Render system notifications differently (centered, no bubble)
  if (isSystemNotification) {
    return (
      <div className="flex justify-center mb-2" data-testid={`message-${message.id}`}>
        <span className="text-xs bg-muted px-3 py-1 rounded-full text-muted-foreground">
          {message.text || 'System notification'}
        </span>
      </div>
    );
  }

  // Check if message has quoted message
  const hasQuotedMessage = message.interactivePayload && 
    typeof message.interactivePayload === 'object' && 
    message.interactivePayload !== null &&
    'quotedMessage' in message.interactivePayload;
  
  const quotedMessage = hasQuotedMessage ? (message.interactivePayload as any).quotedMessage : null;

  return (
    <div 
      className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-2 group`}
      data-testid={`message-${message.id}`}
    >
      <div className={`max-w-[70%] ${isOutbound ? 'bg-primary text-primary-foreground' : 'bg-muted'} rounded-lg px-3 py-2 relative`}>
        {/* Quoted Message (if this is a reply) */}
        {quotedMessage && (
          <div className={`mb-2 pl-2 border-l-4 ${isOutbound ? 'border-primary-foreground/30' : 'border-primary'} py-1 flex gap-2`}>
            {/* If quoted message has media, show thumbnail */}
            {quotedMessage.hasMedia && quotedMessage.type === 'image' && quotedMessage.mediaUrl && (
              <img 
                src={quotedMessage.mediaUrl.startsWith('http') ? quotedMessage.mediaUrl : `/api${quotedMessage.mediaUrl}`}
                alt="Quoted media" 
                className="w-12 h-12 object-cover rounded flex-shrink-0"
                onError={(e) => {
                  // Hide image on error
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            {quotedMessage.hasMedia && quotedMessage.type === 'video' && quotedMessage.mediaUrl && (
              <div className="w-12 h-12 bg-muted rounded flex items-center justify-center flex-shrink-0">
                <Video className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            {quotedMessage.hasMedia && ['document', 'audio', 'ptt'].includes(quotedMessage.type) && (
              <div className="w-12 h-12 bg-muted rounded flex items-center justify-center flex-shrink-0">
                {quotedMessage.type === 'document' && <FileText className="h-6 w-6 text-muted-foreground" />}
                {(quotedMessage.type === 'audio' || quotedMessage.type === 'ptt') && <Music className="h-6 w-6 text-muted-foreground" />}
              </div>
            )}
            
            <div className="flex-1 min-w-0">
              <p className="text-xs opacity-70 font-medium mb-0.5">
                {quotedMessage.fromMe ? 'You' : (conversation?.contact.name || 'Contact')}
              </p>
              <p className="text-xs opacity-70 line-clamp-2">
                {quotedMessage.body || (quotedMessage.hasMedia ? `[${quotedMessage.type}]` : `[${quotedMessage.type} message]`)}
              </p>
            </div>
          </div>
        )}

        {/* Text Message */}
        {(messageType === 'text' || messageType === 'chat') && message.text && (
          <p className="text-sm break-words whitespace-pre-wrap" data-testid={`text-message-${message.id}`}>
            {message.text}
          </p>
        )}

        {/* Image Message */}
        {messageType === 'image' && (
          <div className="space-y-2" data-testid={`image-message-${message.id}`}>
            {loadingMedia ? (
              <div className="rounded-md overflow-hidden bg-muted" style={{ aspectRatio: '4/3', maxWidth: '320px' }}>
                <Skeleton className="h-full w-full" />
              </div>
            ) : mediaUrl ? (
              <img 
                src={mediaUrl} 
                alt="WhatsApp image" 
                className="rounded-md max-w-full max-h-96 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                style={{ minHeight: '100px' }}
                onClick={() => window.open(mediaUrl, '_blank')}
                onError={(e) => {
                  console.error('[WhatsApp UI] Failed to load image:', mediaUrl);
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement?.querySelector('.error-placeholder')?.classList.remove('hidden');
                }}
                loading="lazy"
              />
            ) : null}
            {!loadingMedia && !mediaUrl && (
              <div className="flex items-center gap-2 p-4 border rounded-md bg-destructive/10">
                <ImageIcon className="h-8 w-8 text-destructive" />
                <div>
                  <span className="text-sm font-medium">Image unavailable</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Media may have expired or failed to download
                  </p>
                </div>
              </div>
            )}
            {mediaUrl && (
              <div className="hidden error-placeholder">
                <div className="flex items-center gap-2 p-4 border rounded-md bg-destructive/10">
                  <ImageIcon className="h-8 w-8 text-destructive" />
                  <div>
                    <span className="text-sm font-medium">Failed to load image</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      The image could not be displayed
                    </p>
                  </div>
                </div>
              </div>
            )}
            {/* Show caption if it exists - only show after media loads or if no media */}
            {message.caption && !loadingMedia && (
              <p className="text-sm whitespace-pre-wrap">{String(message.caption)}</p>
            )}
          </div>
        )}

        {/* Video Message */}
        {messageType === 'video' && (
          <div className="space-y-2" data-testid={`video-message-${message.id}`}>
            {loadingMedia ? (
              <div className="rounded-md overflow-hidden bg-muted flex items-center justify-center" style={{ aspectRatio: '16/9', maxWidth: '320px', minHeight: '180px' }}>
                <Video className="h-12 w-12 text-muted-foreground animate-pulse" />
              </div>
            ) : mediaUrl ? (
              <video controls className="rounded-md max-w-full max-h-96">
                <source src={mediaUrl} type={message.mediaMimeType || 'video/mp4'} />
                Your browser does not support the video tag.
              </video>
            ) : (
              <div className="flex items-center gap-2 p-4 border rounded-md bg-destructive/10">
                <Video className="h-8 w-8 text-destructive" />
                <div>
                  <span className="text-sm font-medium">Video unavailable</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Media may have expired or failed to download
                  </p>
                </div>
              </div>
            )}
            {/* Show caption if it exists - only show after media loads or if no media */}
            {message.caption && !loadingMedia && (
              <p className="text-sm whitespace-pre-wrap">{String(message.caption)}</p>
            )}
          </div>
        )}

        {/* Audio Message & Voice Notes (PTT) */}
        {(messageType === 'audio' || messageType === 'ptt') && (
          <div className="space-y-2" data-testid={`audio-message-${message.id}`}>
            {loadingMedia ? (
              <div className="rounded-full overflow-hidden bg-muted flex items-center gap-2 px-4 py-2" style={{ width: '260px' }}>
                <Music className="h-5 w-5 text-muted-foreground animate-pulse" />
                <Skeleton className="h-2 flex-1" />
              </div>
            ) : mediaUrl ? (
              <audio controls className="w-full max-w-sm">
                <source src={mediaUrl} type={message.mediaMimeType || 'audio/ogg'} />
                Your browser does not support the audio tag.
              </audio>
            ) : (
              <div className="flex items-center gap-2 p-4 border rounded-md bg-destructive/10">
                <Music className="h-8 w-8 text-destructive" />
                <div>
                  <span className="text-sm font-medium">{messageType === 'ptt' ? 'Voice note' : 'Audio'} unavailable</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Media may have expired or failed to download
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Document Message */}
        {messageType === 'document' && (
          <>
            {loadingMedia ? (
              <div className="flex items-center gap-3 p-3 border rounded-md bg-muted">
                <FileText className="h-8 w-8 flex-shrink-0 text-muted-foreground animate-pulse" />
                <div className="flex-1 min-w-0 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Download className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </div>
            ) : mediaUrl ? (
              <div 
                className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover-elevate"
                onClick={handleDownload}
                data-testid={`document-message-${message.id}`}
              >
                <FileText className="h-8 w-8 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{message.mediaFilename || 'Document'}</p>
                  {message.mediaSize && (
                    <p className="text-xs text-muted-foreground">
                      {(message.mediaSize / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>
                <Download className="h-4 w-4 flex-shrink-0" />
              </div>
            ) : (
              <div className="flex items-center gap-2 p-4 border rounded-md bg-destructive/10">
                <FileText className="h-8 w-8 text-destructive" />
                <div>
                  <span className="text-sm font-medium">Document unavailable</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    File may have expired or failed to download
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Location Message */}
        {messageType === 'location' && message.latitude && message.longitude && (
          <>
            <div className="space-y-2" data-testid={`location-message-${message.id}`}>
              <div className="flex items-start gap-2">
                <MapPin className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  {message.locationName && (
                    <p className="text-sm font-medium">{String(message.locationName)}</p>
                  )}
                  {message.locationAddress && (
                    <p className="text-xs text-muted-foreground">{String(message.locationAddress)}</p>
                  )}
                  <a 
                    href={`https://www.google.com/maps?q=${String(message.latitude)},${String(message.longitude)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline"
                  >
                    View on Maps
                  </a>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Interactive/Buttons Message */}
        {messageType === 'interactive' ? (
          <div className="space-y-2" data-testid={`interactive-message-${message.id}`}>
            {/* Show text content if available */}
            {message.text ? (
              <p className="text-sm whitespace-pre-wrap">{String(message.text)}</p>
            ) : null}
            
            {/* Show interactive payload if available */}
            {message.interactivePayload && typeof message.interactivePayload === 'object' ? (
              <>
                {('body' in message.interactivePayload) ? (
                  <p className="text-sm">{String((message.interactivePayload as any).body)}</p>
                ) : null}
                {('buttons' in message.interactivePayload) && Array.isArray((message.interactivePayload as any).buttons) ? (
                  <div className="space-y-1">
                    {((message.interactivePayload as any).buttons as any[]).map((btn: any, idx: number) => (
                      <Button 
                        key={idx} 
                        variant="outline" 
                        size="sm" 
                        className="w-full"
                        data-testid={`button-${idx}`}
                      >
                        {String(btn.text || btn.title || 'Button')}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {/* Template Message */}
        {messageType === 'template' && (
          <div className="space-y-1" data-testid={`template-message-${message.id}`}>
            {message.templateName && (
              <p className="text-xs font-medium opacity-70">Template: {message.templateName}</p>
            )}
            {message.text && <p className="text-sm whitespace-pre-wrap">{message.text}</p>}
          </div>
        )}

        {/* Sticker - treat as image */}
        {messageType === 'sticker' && (
          <div data-testid={`sticker-message-${message.id}`}>
            {loadingMedia ? (
              <div className="rounded-md bg-muted flex items-center justify-center" style={{ width: '128px', height: '128px' }}>
                <ImageIcon className="h-12 w-12 text-muted-foreground animate-pulse" />
              </div>
            ) : mediaUrl ? (
              <img 
                src={mediaUrl} 
                alt="Sticker" 
                className="h-32 w-32 object-contain"
                onError={(e) => {
                  console.error('[WhatsApp UI] Failed to load sticker:', mediaUrl);
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement?.querySelector('.error-placeholder')?.classList.remove('hidden');
                }}
              />
            ) : null}
            {!loadingMedia && !mediaUrl && (
              <div className="flex items-center gap-2 p-4 border rounded-md bg-destructive/10">
                <ImageIcon className="h-8 w-8 text-destructive" />
                <div>
                  <span className="text-sm font-medium">Sticker unavailable</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Media may have expired or failed to download
                  </p>
                </div>
              </div>
            )}
            {mediaUrl && (
              <div className="hidden error-placeholder">
                <div className="flex items-center gap-2 p-4 border rounded-md bg-destructive/10">
                  <ImageIcon className="h-8 w-8 text-destructive" />
                  <div>
                    <span className="text-sm font-medium">Sticker unavailable</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Media may have expired or failed to download
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contacts/VCard - simple display */}
        {(messageType === 'contacts' || messageType === 'vcard' || messageType === 'multi_vcard') && (
          <div className="flex items-center gap-2 p-2 border rounded-md" data-testid={`contacts-message-${message.id}`}>
            <Phone className="h-5 w-5" />
            <span className="text-sm">{message.text || 'Contact card'}</span>
          </div>
        )}

        {/* Poll Messages */}
        {messageType === 'poll_creation' && message.interactivePayload && (
          <div className="space-y-2 p-3 border rounded-md" data-testid={`poll-message-${message.id}`}>
            <p className="text-sm font-medium">
              {typeof message.interactivePayload === 'object' && 
               message.interactivePayload !== null && 
               'name' in message.interactivePayload 
                ? String((message.interactivePayload as any).name) 
                : 'Poll'}
            </p>
            {typeof message.interactivePayload === 'object' && 
             message.interactivePayload !== null && 
             'options' in message.interactivePayload && 
             Array.isArray((message.interactivePayload as any).options) && (
              <div className="space-y-1">
                {((message.interactivePayload as any).options as any[]).map((option: any, idx: number) => (
                  <div key={idx} className="text-sm p-2 bg-muted rounded">
                    {typeof option === 'string' ? option : option.name || option.text || 'Option'}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Poll Votes */}
        {messageType === 'poll_vote' && (
          <div className="flex items-center gap-2 p-2 border rounded-md" data-testid={`poll-vote-message-${message.id}`}>
            <span className="text-sm">{message.text || 'Voted in poll'}</span>
          </div>
        )}

        {/* Reactions */}
        {messageType === 'reaction' && (
          <div className="flex items-center gap-2 p-2" data-testid={`reaction-message-${message.id}`}>
            <span className="text-lg">
              {message.interactivePayload && 
               typeof message.interactivePayload === 'object' && 
               message.interactivePayload !== null && 
               'text' in message.interactivePayload 
                ? String((message.interactivePayload as any).text) 
                : '👍'}
            </span>
            <span className="text-xs text-muted-foreground">Reacted to message</span>
          </div>
        )}

        {/* Button/List Responses */}
        {(messageType === 'buttons_response' || messageType === 'list_response') && (
          <div className="space-y-1 p-3 border rounded-md" data-testid={`response-message-${message.id}`}>
            <p className="text-xs text-muted-foreground">Response:</p>
            <p className="text-sm">{message.text || 'Selected option'}</p>
          </div>
        )}

        {/* Revoked/Deleted Messages */}
        {messageType === 'revoked' && (
          <div className="italic text-sm text-muted-foreground" data-testid={`revoked-message-${message.id}`}>
            {message.text || 'This message was deleted'}
          </div>
        )}

        {/* Call Logs */}
        {messageType === 'call_log' && (
          <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50" data-testid={`call-log-message-${message.id}`}>
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{message.text || 'Call'}</span>
          </div>
        )}

        {/* Business Messages (Order/Product) */}
        {(messageType === 'order' || messageType === 'product') && (
          <div className="space-y-1 p-3 border rounded-md" data-testid={`business-message-${message.id}`}>
            <p className="text-xs font-medium text-muted-foreground capitalize">{messageType}</p>
            {message.text && <p className="text-sm whitespace-pre-wrap">{message.text}</p>}
          </div>
        )}

        {/* HSM/Template Buttons */}
        {(messageType === 'hsm' || messageType === 'template_buttons') && (
          <>
            <div className="space-y-2" data-testid={`hsm-message-${message.id}`}>
              {(() => {
                const payload = message.interactivePayload as any;
                return (
                  <>
                    {payload && typeof payload === 'object' && payload.title && (
                      <p className="text-sm font-medium">{String(payload.title)}</p>
                    )}
                    {message.text && <p className="text-sm whitespace-pre-wrap">{message.text}</p>}
                    {payload && typeof payload === 'object' && payload.footer && (
                      <p className="text-xs text-muted-foreground">{String(payload.footer)}</p>
                    )}
                    {payload && typeof payload === 'object' && Array.isArray(payload.buttons) && (
                      <div className="space-y-1">
                        {payload.buttons.map((btn: any, idx: number) => (
                          <Button 
                            key={idx} 
                            variant="outline" 
                            size="sm" 
                            className="w-full"
                            disabled
                          >
                            {btn.text || btn.title || 'Button'}
                          </Button>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </>
        )}

        {/* Unknown/Unsupported Message Types */}
        {!['text', 'chat', 'image', 'video', 'audio', 'ptt', 'document', 'location', 
            'interactive', 'template', 'sticker', 'contacts', 'vcard', 'multi_vcard',
            'poll_creation', 'poll_vote', 'reaction', 'buttons_response', 'list_response',
            'revoked', 'order', 'product', 'hsm', 'template_buttons',
            'e2e_notification', 'notification', 'notification_template', 'gp2', 'group_notification',
            'call_log'].includes(messageType) && (
          <div className="flex items-center gap-2 p-2 border rounded-md bg-muted" data-testid={`unknown-message-${message.id}`}>
            <span className="text-xs text-muted-foreground">
              {message.text || `[${messageType} message]`}
            </span>
          </div>
        )}

        {/* Message Footer */}
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-xs opacity-70" data-testid={`timestamp-${message.id}`}>
            {formatTimestamp(message.timestamp)}
          </span>
          {isOutbound && (
            <span data-testid={`status-${message.id}`}>
              {getStatusIcon(message.status)}
            </span>
          )}
        </div>

        {/* Error Message */}
        {message.status === 'failed' && message.errorMessage && (
          <p className="text-xs text-destructive mt-1">
            {message.errorMessage}
          </p>
        )}

      </div>
    </div>
  );
}

function ConversationItem({ 
  conversation, 
  isActive,
  onClick 
}: { 
  conversation: ConversationWithRelations;
  isActive: boolean;
  onClick: () => void;
}) {
  const { contact } = conversation;
  
  return (
    <div
      onClick={onClick}
      className={`p-3 cursor-pointer hover-elevate border-b ${isActive ? 'bg-accent' : ''}`}
      data-testid={`conversation-${conversation.id}`}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={contact.profilePicUrl || undefined} />
          <AvatarFallback>
            {contact.name ? contact.name.charAt(0).toUpperCase() : contact.phoneNumber.charAt(0)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-sm truncate" data-testid={`contact-name-${conversation.id}`}>
              {contact.name || contact.phoneNumber}
            </p>
            {conversation.lastInboundMessageAt && (
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatTimestamp(conversation.lastInboundMessageAt)}
              </span>
            )}
          </div>
          
          {/* Last message preview */}
          {conversation.lastMessage && (
            <p className="text-xs text-muted-foreground truncate mt-1">
              {conversation.lastMessage.direction === 'outbound' && '✓ '}
              {(() => {
                const msg = conversation.lastMessage;
                // Show text for text/chat messages
                if (msg.type === 'text' || msg.type === 'chat') {
                  return msg.text || '(No text)';
                }
                // Show text for interactive/template messages if available
                if ((msg.type === 'interactive' || msg.type === 'template') && msg.text) {
                  return msg.text;
                }
                // Show icon + type for media and special messages
                const typeIcons: Record<string, string> = {
                  image: '📷',
                  video: '🎥',
                  audio: '🎵',
                  ptt: '🎤',
                  document: '📄',
                  location: '📍',
                  contacts: '👤',
                  vcard: '👤',
                  multi_vcard: '👥',
                  sticker: '😀',
                  poll_creation: '📊',
                  poll_vote: '✅',
                  reaction: '❤️',
                  interactive: '💬',
                  template: '📋',
                  hsm: '📋',
                  order: '🛒',
                  product: '🏷️',
                  revoked: '🚫',
                  e2e_notification: 'ℹ️',
                  notification: 'ℹ️',
                  notification_template: 'ℹ️',
                  gp2: 'ℹ️',
                  group_notification: 'ℹ️',
                  call_log: '📞',
                };
                const icon = typeIcons[msg.type] || '📎';
                // For notifications, show the actual text instead of type
                if (['e2e_notification', 'notification', 'notification_template', 'gp2', 'group_notification'].includes(msg.type)) {
                  return msg.text || `${icon} notification`;
                }
                return `${icon} ${msg.type}`;
              })()}
            </p>
          )}
          
          <div className="flex items-center justify-between gap-2 mt-1">
            <p className="text-xs text-muted-foreground truncate">
              {contact.phoneNumber}
            </p>
            {(conversation.unreadCount ?? 0) > 0 && (
              <Badge variant="default" className="h-5 min-w-5 px-1.5" data-testid={`unread-badge-${conversation.id}`}>
                {conversation.unreadCount}
              </Badge>
            )}
          </div>
          
          {contact.tags && contact.tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {contact.tags.slice(0, 2).map((tag, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs h-5">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ type }: { type: 'conversations' | 'messages' }) {
  if (type === 'conversations') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Phone className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Conversations</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Your WhatsApp conversations will appear here once you start receiving messages.
        </p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <Phone className="h-16 w-16 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">Select a Conversation</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Choose a conversation from the list to view messages.
      </p>
    </div>
  );
}

interface WhatsappTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: Array<{
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
    format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    text?: string;
    example?: { header_text?: string[]; body_text?: string[][]; };
    buttons?: Array<{ type: string; text: string; }>;
  }>;
}

function MessageComposer({ 
  conversation, 
  onMessageSent 
}: { 
  conversation: ConversationWithRelations;
  onMessageSent: () => void;
}) {
  const { toast } = useToast();
  const [messageText, setMessageText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_MESSAGE_LENGTH = 4096;
  const isOverLimit = messageText.length > MAX_MESSAGE_LENGTH;

  // Check if this is a web-connector account (doesn't support templates)
  const isWebConnector = conversation.account.connectionType === 'web-connector';

  // Typing indicator hook - Only for web-connector accounts
  const typingIndicator = isWebConnector ? useTypingIndicator({
    accountId: conversation.account.id,
    chatId: conversation.contact.phoneNumber,
  }) : null;

  // Fetch templates (only for Cloud API accounts)
  const { data: templatesData } = useQuery<{ templates: WhatsappTemplate[] }>({
    queryKey: [`/api/whatsapp/templates?accountId=${conversation.account.id}&status=APPROVED`],
    enabled: !isWebConnector, // Don't fetch for web-connector accounts
  });

  const templates = templatesData?.templates || [];
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  // Send text/media message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (data: {
      accountId: string;
      to: string;
      type: 'text' | 'image' | 'video' | 'audio' | 'document';
      text?: string;
      caption?: string;
      file?: File;
    }) => {
      // If there's a file, upload it first
      let mediaUrl: string | undefined;
      if (data.file) {
        const formData = new FormData();
        formData.append('file', data.file);
        formData.append('accountId', data.accountId);
        
        const uploadResponse = await fetch('/api/whatsapp/media/upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload media');
        }

        const uploadData = await uploadResponse.json();
        mediaUrl = uploadData.url;
      }

      // Send message
      return await apiRequest('POST', '/api/whatsapp/messages/send', {
        accountId: data.accountId,
        to: data.to,
        type: data.type,
        text: data.text,
        caption: data.caption,
        mediaUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/whatsapp/conversations/${conversation.id}/messages`] });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/conversations'] });
      toast({
        title: "Message sent",
        description: "Your message has been sent successfully.",
      });
      resetComposer();
      onMessageSent();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send message",
        description: error.message || "An error occurred while sending the message.",
        variant: "destructive",
      });
    },
  });

  // Send template message mutation
  const sendTemplateMutation = useMutation({
    mutationFn: async (data: {
      accountId: string;
      to: string;
      templateName: string;
      templateLanguage: string;
    }) => {
      return await apiRequest('POST', '/api/whatsapp/messages/send', {
        accountId: data.accountId,
        to: data.to,
        type: 'template',
        templateName: data.templateName,
        templateLanguage: data.templateLanguage,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/whatsapp/conversations/${conversation.id}/messages`] });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/conversations'] });
      toast({
        title: "Template sent",
        description: "Template message has been sent successfully.",
      });
      resetComposer();
      setShowTemplateSelector(false);
      onMessageSent();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send template",
        description: error.message || "An error occurred while sending the template.",
        variant: "destructive",
      });
    },
  });

  const resetComposer = () => {
    setMessageText("");
    setSelectedFile(null);
    setFilePreview(null);
    setCaption("");
    setSelectedTemplateId("");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 16MB for WhatsApp)
    if (file.size > 16 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "File size must be less than 16MB.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setCaption("");
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendText = () => {
    if (!messageText.trim()) {
      toast({
        title: "Empty message",
        description: "Please enter a message to send.",
        variant: "destructive",
      });
      return;
    }

    if (isOverLimit) {
      toast({
        title: "Message too long",
        description: "Message exceeds the 4096 character limit.",
        variant: "destructive",
      });
      return;
    }

    // Clear typing indicator before sending
    if (isWebConnector && typingIndicator) {
      typingIndicator.stopTyping();
    }

    sendMessageMutation.mutate({
      accountId: conversation.account.id,
      to: conversation.contact.phoneNumber,
      type: 'text',
      text: messageText.trim(),
    });
  };

  const handleSendMedia = () => {
    if (!selectedFile) return;

    // Clear typing indicator before sending
    if (isWebConnector && typingIndicator) {
      typingIndicator.stopTyping();
    }

    let type: 'image' | 'video' | 'audio' | 'document' = 'document';
    if (selectedFile.type.startsWith('image/')) type = 'image';
    else if (selectedFile.type.startsWith('video/')) type = 'video';
    else if (selectedFile.type.startsWith('audio/')) type = 'audio';

    sendMessageMutation.mutate({
      accountId: conversation.account.id,
      to: conversation.contact.phoneNumber,
      type,
      caption: caption.trim() || undefined,
      file: selectedFile,
    });
  };

  const handleSendTemplate = () => {
    if (!selectedTemplate) {
      toast({
        title: "No template selected",
        description: "Please select a template to send.",
        variant: "destructive",
      });
      return;
    }

    sendTemplateMutation.mutate({
      accountId: conversation.account.id,
      to: conversation.contact.phoneNumber,
      templateName: selectedTemplate.name,
      templateLanguage: selectedTemplate.language,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isOverLimit && !selectedFile) {
        return;
      }
      if (selectedFile) {
        handleSendMedia();
      } else {
        handleSendText();
      }
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <ImageIcon className="h-5 w-5" />;
    if (file.type.startsWith('video/')) return <Video className="h-5 w-5" />;
    if (file.type.startsWith('audio/')) return <Music className="h-5 w-5" />;
    return <FileText className="h-5 w-5" />;
  };

  const isLoading = sendMessageMutation.isPending || sendTemplateMutation.isPending;

  return (
    <div className="border-t bg-background p-4 space-y-3" data-testid="message-composer">
      {/* File Preview */}
      {selectedFile && (
        <Card className="p-3" data-testid="file-preview">
          <div className="flex items-start gap-3">
            {filePreview ? (
              <img src={filePreview} alt="Preview" className="h-20 w-20 object-cover rounded-md" />
            ) : (
              <div className="h-20 w-20 flex items-center justify-center bg-muted rounded-md">
                {getFileIcon(selectedFile)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
              <Input
                placeholder="Add a caption (optional)"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="mt-2"
                data-testid="input-caption"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRemoveFile}
              disabled={isLoading}
              data-testid="button-remove-file"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Template Selector */}
      {showTemplateSelector && (
        <Card className="p-3 space-y-3" data-testid="template-selector">
          <div className="flex items-center justify-between">
            <Label>Select Template</Label>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowTemplateSelector(false)}
              data-testid="button-close-templates"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
            <SelectTrigger data-testid="select-template">
              <SelectValue placeholder="Choose a template..." />
            </SelectTrigger>
            <SelectContent>
              {templates.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">No approved templates available</div>
              ) : (
                templates.map((template) => (
                  <SelectItem key={template.id} value={template.id} data-testid={`template-option-${template.id}`}>
                    {template.name} ({template.language})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {selectedTemplate && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-xs font-medium text-muted-foreground mb-2">Preview:</p>
              {selectedTemplate.components.map((component, idx) => (
                <div key={idx} className="text-sm mb-1">
                  {component.type === 'BODY' && component.text && (
                    <p>{component.text}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <Button
            onClick={handleSendTemplate}
            disabled={!selectedTemplateId || isLoading}
            className="w-full"
            data-testid="button-send-template"
          >
            {sendTemplateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Template
              </>
            )}
          </Button>
        </Card>
      )}

      {/* Main Input Area */}
      <div className="flex gap-2">
        {/* File Upload Button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="input-file"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || !!selectedFile}
          data-testid="button-attach-file"
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        {/* Template Button - Only show for Cloud API accounts */}
        {!isWebConnector && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowTemplateSelector(!showTemplateSelector)}
            disabled={isLoading || !!selectedFile}
            data-testid="button-toggle-templates"
          >
            <FileType className="h-5 w-5" />
          </Button>
        )}

        {/* Text Input */}
        <div className="flex-1 relative">
          <Textarea
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => {
              setMessageText(e.target.value);
              // Send typing indicator for web-connector accounts
              if (isWebConnector && typingIndicator && e.target.value.trim()) {
                typingIndicator.startTyping();
              }
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Clear typing indicator when focus lost
              if (isWebConnector && typingIndicator) {
                typingIndicator.stopTyping();
              }
            }}
            disabled={isLoading || !!selectedFile}
            className="resize-none min-h-[44px] max-h-32"
            rows={1}
            maxLength={4096}
            data-testid="textarea-message"
          />
          {messageText.length > 0 && (
            <span 
              className={cn(
                "absolute bottom-2 right-2 text-xs",
                isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"
              )}
              data-testid="character-counter"
            >
              {messageText.length}/{MAX_MESSAGE_LENGTH}
            </span>
          )}
        </div>

        {/* Send Button */}
        <Button
          onClick={selectedFile ? handleSendMedia : handleSendText}
          disabled={isLoading || (!messageText.trim() && !selectedFile) || (isOverLimit && !selectedFile)}
          data-testid="button-send-message"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>

      {isOverLimit && !selectedFile && (
        <p className="text-xs text-destructive" data-testid="error-message-limit">
          Message exceeds character limit
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}

export default function WhatsAppInbox() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [mobileShowMessages, setMobileShowMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const markedAsReadRef = useRef<Set<string>>(new Set());

  // Read conversation ID from URL query params on mount
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const conversationParam = searchParams.get('conversation');
    
    if (conversationParam) {
      setSelectedConversationId(conversationParam);
      if (isMobile) {
        setMobileShowMessages(true);
      }
    }
  }, [isMobile]);

  // Fetch conversations with higher limit to show all
  const conversationsUrl = statusFilter === 'all' 
    ? '/api/whatsapp/conversations?limit=100'
    : `/api/whatsapp/conversations?status=${statusFilter}&limit=1000`;
  
  const { data: conversationsData, isLoading: loadingConversations } = useQuery<{
    conversations: ConversationWithRelations[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: [conversationsUrl],
    refetchInterval: 2000, // Poll every 2 seconds for new conversations and read status updates
  });

  // Fetch messages for selected conversation with auto-refresh for live updates
  const { data: messagesData, isLoading: loadingMessages } = useQuery<{
    messages: SelectWhatsappMessage[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: [`/api/whatsapp/conversations/${selectedConversationId}/messages`],
    enabled: !!selectedConversationId,
    refetchInterval: 1000, // Poll every 1 second for faster reaction updates
  });

  const conversations = conversationsData?.conversations || [];
  const messages = messagesData?.messages || [];
  const selectedConversation = conversations.find(c => c.id === selectedConversationId);

  // Mark messages as read when viewing a conversation
  const markAsReadMutation = useMutation({
    mutationFn: async (messageIds: string[]) => {
      // Mark each unread inbound message as read (in parallel for speed)
      await Promise.all(
        messageIds.map(messageId => 
          apiRequest('PATCH', `/api/whatsapp/messages/${messageId}/read`)
        )
      );
    },
    onMutate: async (messageIds) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/whatsapp/conversations/${selectedConversationId}/messages`] });
      await queryClient.cancelQueries({ queryKey: ['/api/whatsapp/conversations'] });

      // Snapshot previous values
      const previousMessages = queryClient.getQueryData([`/api/whatsapp/conversations/${selectedConversationId}/messages`]);
      const previousConversations = queryClient.getQueryData(['/api/whatsapp/conversations']);

      // Optimistically update messages to read status
      queryClient.setQueryData([`/api/whatsapp/conversations/${selectedConversationId}/messages`], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          messages: old.messages.map((msg: any) => 
            messageIds.includes(msg.id) ? { ...msg, isRead: true } : msg
          ),
        };
      });

      // Optimistically update conversation unread count
      queryClient.setQueryData(['/api/whatsapp/conversations'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          conversations: old.conversations.map((conv: any) => 
            conv.id === selectedConversationId 
              ? { ...conv, unreadCount: 0 } 
              : conv
          ),
        };
      });

      return { previousMessages, previousConversations };
    },
    onError: (err, messageIds, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData([`/api/whatsapp/conversations/${selectedConversationId}/messages`], context.previousMessages);
      }
      if (context?.previousConversations) {
        queryClient.setQueryData(['/api/whatsapp/conversations'], context.previousConversations);
      }
      toast({
        title: "Failed to mark as read",
        description: "Could not update read status",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/conversations'] });
      queryClient.invalidateQueries({ queryKey: [`/api/whatsapp/conversations/${selectedConversationId}/messages`] });
    },
  });

  // Auto-mark messages as read when viewing conversation
  useEffect(() => {
    if (messages.length > 0 && selectedConversationId) {
      // Check if we've already marked this conversation as read
      if (markedAsReadRef.current.has(selectedConversationId)) {
        return;
      }
      
      // Find unread inbound messages
      const unreadInboundMessages = messages.filter(
        msg => msg.direction === 'inbound' && !msg.isRead
      );
      
      if (unreadInboundMessages.length > 0) {
        const messageIds = unreadInboundMessages.map(msg => msg.id);
        console.log(`[WhatsApp Inbox] Auto-marking ${messageIds.length} messages as read for conversation ${selectedConversationId}`);
        markAsReadMutation.mutate(messageIds);
        markedAsReadRef.current.add(selectedConversationId);
      }
    }
  }, [selectedConversationId, messages.length]); // Only trigger when conversation changes or new messages arrive
  
  // Clear the marked flag when conversation changes
  useEffect(() => {
    if (selectedConversationId) {
      // Clear the flag for this conversation when switching to it
      // This allows re-marking if new messages arrive
      const timer = setTimeout(() => {
        markedAsReadRef.current.delete(selectedConversationId);
      }, 10000); // Clear after 10 seconds
      
      return () => clearTimeout(timer);
    }
  }, [selectedConversationId]);

  // Filter conversations by search
  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      conv.contact.name?.toLowerCase().includes(searchLower) ||
      conv.contact.phoneNumber.toLowerCase().includes(searchLower)
    );
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle conversation selection
  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    if (isMobile) {
      setMobileShowMessages(true);
    }
  };

  // Handle back on mobile
  const handleMobileBack = () => {
    setMobileShowMessages(false);
    setSelectedConversationId(null);
  };

  // Conversations List Component
  const ConversationsList = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header - Fixed */}
      <div className="p-4 border-b space-y-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/comunicacoes?tab=whatsapp')}
            className="flex-shrink-0"
            title="Back to WhatsApp Communications"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold">WhatsApp Inbox</h2>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-conversations"
          />
        </div>

        {/* Status Filter */}
        <Tabs value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1" data-testid="tab-all">All</TabsTrigger>
            <TabsTrigger value="open" className="flex-1" data-testid="tab-open">Open</TabsTrigger>
            <TabsTrigger value="closed" className="flex-1" data-testid="tab-closed">Closed</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Conversations List - Scrollable */}
      <ScrollArea className="flex-1 overflow-y-auto">
        {loadingConversations ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <EmptyState type="conversations" />
        ) : (
          filteredConversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isActive={selectedConversationId === conversation.id}
              onClick={() => handleSelectConversation(conversation.id)}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );

  // Messages View Component
  const MessagesView = () => {
    if (!selectedConversation) {
      return <EmptyState type="messages" />;
    }

    const handleMessageSent = () => {
      // Auto-scroll to bottom after sending
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    };

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header - Fixed */}
        <div className="p-4 border-b flex items-center gap-3 flex-shrink-0">
          {isMobile && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleMobileBack}
              data-testid="button-back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          
          <Avatar className="h-10 w-10">
            <AvatarImage src={selectedConversation.contact.profilePicUrl || undefined} />
            <AvatarFallback>
              {selectedConversation.contact.name 
                ? selectedConversation.contact.name.charAt(0).toUpperCase() 
                : selectedConversation.contact.phoneNumber.charAt(0)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate" data-testid="header-contact-name">
              {selectedConversation.contact.name || selectedConversation.contact.phoneNumber}
            </p>
            <p className="text-xs text-muted-foreground truncate" data-testid="header-contact-phone">
              {selectedConversation.contact.phoneNumber}
            </p>
          </div>

          <Badge variant={selectedConversation.status === 'open' ? 'default' : 'secondary'} className="flex-shrink-0">
            {selectedConversation.status}
          </Badge>

          {/* Conversation Actions Menu - Only for web-connector accounts */}
          {selectedConversation.account.connectionType === 'web-connector' && (
            <WhatsAppConversationActions
              accountId={selectedConversation.account.id}
              chatId={selectedConversation.contact.phoneNumber}
              conversationId={selectedConversation.id}
            />
          )}
        </div>

        {/* Messages - Scrollable */}
        <ScrollArea className="flex-1 overflow-y-auto p-4">
          {loadingMessages ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                  <Skeleton className="h-16 w-64 rounded-lg" />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No messages yet
            </div>
          ) : (
            <>
              {messages.slice().reverse().map((message) => (
                <MessageBubble 
                  key={message.id} 
                  message={message}
                  conversation={selectedConversation}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </ScrollArea>

        {/* Message Composer - Fixed at bottom */}
        <div className="flex-shrink-0">
          <MessageComposer 
            conversation={selectedConversation} 
            onMessageSent={handleMessageSent}
          />
        </div>
      </div>
    );
  };

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
        <Sheet open={!mobileShowMessages} onOpenChange={(open) => !open && setMobileShowMessages(true)}>
          <SheetContent side="left" className="w-full p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Conversations</SheetTitle>
              <SheetDescription>WhatsApp conversations list</SheetDescription>
            </SheetHeader>
            <ConversationsList />
          </SheetContent>
        </Sheet>
        <MessagesView />
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <div className="w-80 border-r flex flex-col">
        <ConversationsList />
      </div>
      <div className="flex-1 flex flex-col">
        <MessagesView />
      </div>
    </div>
  );
}
