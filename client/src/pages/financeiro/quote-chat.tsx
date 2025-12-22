import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { AIBlockedBanner } from '@/components/AIBlockedBanner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface QuotePreview {
  title?: string;
  totalPrice?: string;
  items?: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
  }>;
}

export default function QuoteChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState('');
  const [quotePreview, setQuotePreview] = useState<QuotePreview | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Check subscription and credit status
  const subscriptionStatus = useSubscriptionStatus();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentStreamingMessage]);

  const handleSendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    // Check subscription and credits BEFORE sending
    if (!subscriptionStatus.canUseAI) {
      toast({
        title: subscriptionStatus.reason === 'no_subscription' ? 'Subscription Required' : 'Credits Depleted',
        description: subscriptionStatus.message,
        variant: 'destructive',
      });
      return;
    }

    const userMessage = input.trim();
    setInput('');
    
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    }]);

    setIsStreaming(true);
    setCurrentStreamingMessage('');

    try {
      const response = await fetch('/api/assistbuild/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              
              if (data === '[DONE]') {
                break;
              }

              try {
                const parsed = JSON.parse(data);
                
                if (parsed.type === 'chunk') {
                  assistantMessage += parsed.content;
                  setCurrentStreamingMessage(assistantMessage);
                }
                
                if (parsed.type === 'progress') {
                  console.log('[Progress]', parsed.message);
                }
                
                if (parsed.type === 'complete') {
                  break;
                }
                
                if (parsed.type === 'error') {
                  throw new Error(parsed.message);
                }
              } catch (e) {
                console.error('Parse error:', e);
              }
            }
          }
        }
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date()
      }]);
      
      setCurrentStreamingMessage('');
      
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao enviar mensagem',
        variant: 'destructive'
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      <div className="flex-1 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Chat de Orçamentos</CardTitle>
            </div>
            <CardDescription>
              Descreva o projeto e deixe a IA criar o orçamento automaticamente
            </CardDescription>
          </CardHeader>
          
          <CardContent className="flex-1 flex flex-col gap-4">
            <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Comece uma conversa para criar um orçamento</p>
                    <p className="text-sm mt-2">
                      Exemplo: "Preciso de um site institucional com 5 páginas"
                    </p>
                  </div>
                )}
                
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    data-testid={`message-${msg.role}-${idx}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {msg.timestamp.toLocaleTimeString('pt-PT', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                ))}
                
                {isStreaming && currentStreamingMessage && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg p-3 bg-muted">
                      <p className="whitespace-pre-wrap">{currentStreamingMessage}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="text-xs opacity-70">A escrever...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            {/* AI Blocked Banner */}
            {!subscriptionStatus.canUseAI && !subscriptionStatus.isLoading && subscriptionStatus.reason && subscriptionStatus.message && subscriptionStatus.actionLabel && subscriptionStatus.actionPath && (
              <div className="mb-2">
                <AIBlockedBanner
                  reason={subscriptionStatus.reason}
                  message={subscriptionStatus.message}
                  actionLabel={subscriptionStatus.actionLabel}
                  actionPath={subscriptionStatus.actionPath}
                  creditBalance={subscriptionStatus.creditBalance}
                />
              </div>
            )}
            
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={
                  !subscriptionStatus.canUseAI 
                    ? "AI features unavailable"
                    : "Descreva o projeto que precisa orçar..."
                }
                className="resize-none"
                rows={3}
                disabled={isStreaming || !subscriptionStatus.canUseAI}
                data-testid="input-chat-message"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!input.trim() || isStreaming || !subscriptionStatus.canUseAI}
                size="icon"
                className="h-full"
                data-testid="button-send-message"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="w-96">
        <Card>
          <CardHeader>
            <CardTitle>Preview do Orçamento</CardTitle>
            <CardDescription>
              Visualização em tempo real
            </CardDescription>
          </CardHeader>
          <CardContent>
            {quotePreview ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Título</label>
                  <p className="text-sm text-muted-foreground">{quotePreview.title}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Total</label>
                  <p className="text-2xl font-bold">{quotePreview.totalPrice}</p>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-sm">
                  O orçamento aparecerá aqui durante a criação
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
