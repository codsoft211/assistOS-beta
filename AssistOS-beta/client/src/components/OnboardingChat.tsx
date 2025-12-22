import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Send, Search, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface OnboardingChatProps {
  onRegister?: () => void;
}

export function OnboardingChat({ onRegister }: OnboardingChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showInlineForm, setShowInlineForm] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const userMessage = inputValue.trim();
    if (!userMessage || isStreaming) return;

    // Adicionar mensagem user
    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);
    setInputValue("");
    setIsStreaming(true);

    // Iniciar resposta assistant (streaming)
    let currentResponse = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);

              // Handle actions
              if (parsed.action) {
                if (parsed.action.action === "SHOW_REGISTER_FORM") {
                  // Show inline form instead of dialog
                  setShowInlineForm(true);
                }
                if (parsed.action.action === "CHECKING_ONLINE") {
                  setIsSearching(true);
                }
              }

              // Handle content (word-by-word streaming)
              if (parsed.content) {
                currentResponse += parsed.content;
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].content = currentResponse;
                  return newMsgs;
                });
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error streaming response:", error);
      setMessages((prev) => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].content =
          "Desculpa, ocorreu um erro. Por favor tenta novamente.";
        return newMsgs;
      });
    } finally {
      setIsStreaming(false);
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao criar conta");
      }

      toast({
        title: "Conta criada com sucesso!",
        description: "A redirecionar para o AssistOS...",
      });

      // Redirect to app after successful registration
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao criar conta",
        description: error instanceof Error ? error.message : "Tenta novamente",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  // Estado inicial: apenas input (sem mensagens)
  if (messages.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto" data-testid="onboarding-empty-state">
        <div className="flex items-center gap-3">
          <Input
            type="text"
            placeholder="Bem-vindo ao Assist Start — diz olá ou faz uma pergunta..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            className="flex-1 h-14 px-6 text-base bg-slate-800/50 backdrop-blur-sm border-slate-600 text-white placeholder:text-gray-400 focus:border-blue-500 transition-colors"
            data-testid="input-chat-initial"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isStreaming}
            size="icon"
            className="h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shrink-0"
            data-testid="button-send-initial"
          >
            {isStreaming ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Estado ativo: chat completo com mensagens
  return (
    <div className="flex flex-col w-full h-[500px] md:h-[600px]">
      {/* Messages Area */}
      <ScrollArea className="flex-1" data-testid="scrollarea-messages">
        <div className="px-4 py-6 space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`card-message-${index}`}
            >
              {msg.role === "assistant" ? (
                <Card className="max-w-[85%] md:max-w-[75%] p-4 bg-slate-800/70 border-slate-700 text-left">
                  <div className="text-sm text-gray-100 whitespace-pre-wrap text-left" data-testid="text-message-content">
                    {msg.content || <Skeleton className="h-4 w-48 bg-slate-700" />}
                  </div>
                </Card>
              ) : (
                <div className="max-w-[85%] md:max-w-[75%] p-4 rounded-lg bg-blue-600/20 border border-blue-500/30">
                  <div className="text-sm text-gray-100 whitespace-pre-wrap" data-testid="text-message-content">
                    {msg.content}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Inline Registration Form */}
          {showInlineForm && (
            <div className="flex justify-start" data-testid="container-inline-form">
              <Card className="max-w-[85%] md:max-w-[75%] p-6 bg-slate-800/70 border-slate-700">
                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-1 text-white">Criar Conta no AssistOS</h3>
                    <p className="text-sm text-gray-400">
                      Estás a um passo de transformar a tua empresa com IA!
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="name" className="text-gray-300">Nome Completo</Label>
                      <Input
                        id="name"
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="João Silva"
                        required
                        className="bg-slate-700/50 border-slate-600 text-white placeholder:text-gray-500"
                        data-testid="input-name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="email" className="text-gray-300">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="joao@empresa.com"
                        required
                        className="bg-slate-700/50 border-slate-600 text-white placeholder:text-gray-500"
                        data-testid="input-email"
                      />
                    </div>

                    <div>
                      <Label htmlFor="password" className="text-gray-300">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="Mínimo 8 caracteres"
                        required
                        minLength={8}
                        className="bg-slate-700/50 border-slate-600 text-white placeholder:text-gray-500"
                        data-testid="input-password"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button 
                      type="submit" 
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white" 
                      disabled={isRegistering}
                      data-testid="button-create-account"
                    >
                      {isRegistering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Criar Conta Grátis
                    </Button>
                    
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-gray-300 hover:text-white hover:bg-slate-700"
                      onClick={() => window.location.href = "/login"}
                      data-testid="button-login"
                    >
                      Já tenho conta
                    </Button>
                  </div>

                  <p className="text-xs text-gray-500 text-center">
                    Ao criar conta, concordas com os Termos de Serviço
                  </p>
                </form>
              </Card>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Searching Badge */}
      {isSearching && (
        <div className="px-4 py-2">
          <Badge className="gap-2 bg-slate-700 text-gray-300 border-slate-600" data-testid="badge-searching">
            <Search className="h-3 w-3 animate-pulse" />
            Pesquisando online...
          </Badge>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-slate-700 p-4">
        <div className="relative flex gap-2">
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Faz qualquer pergunta sobre o AssistOS..."
            className="flex-1 pr-12 bg-slate-800/50 border-slate-600 text-white placeholder:text-gray-400"
            disabled={isStreaming}
            data-testid="input-chat"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={isStreaming || !inputValue.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="button-send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
