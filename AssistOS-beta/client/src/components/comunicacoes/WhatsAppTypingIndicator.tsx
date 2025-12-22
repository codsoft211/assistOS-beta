import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface TypingIndicatorProps {
  contactName: string;
  isTyping: boolean;
}

export function WhatsAppTypingIndicator({ contactName, isTyping }: TypingIndicatorProps) {
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    if (isTyping) {
      setShowIndicator(true);
    } else {
      // Delay hiding to avoid flickering
      const timer = setTimeout(() => setShowIndicator(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isTyping]);

  if (!showIndicator) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 text-sm text-muted-foreground border-b">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>{contactName} is typing...</span>
    </div>
  );
}

interface TypingComposerProps {
  accountId: string;
  chatId: string;
  onTypingChange?: (isTyping: boolean) => void;
}

// Hook to send typing indicators while user types
export function useTypingIndicator({ accountId, chatId }: { accountId: string; chatId: string }) {
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);

  const sendTypingState = async (typing: boolean) => {
    try {
      await fetch('/api/user/whatsapp-web/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, chatId, isTyping: typing }),
      });
    } catch (error) {
      console.error('Failed to send typing indicator:', error);
    }
  };

  const startTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      sendTypingState(true);
    }

    // Clear existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    // Set new timeout to stop typing after 3 seconds of inactivity
    const timeout = setTimeout(() => {
      setIsTyping(false);
      sendTypingState(false);
    }, 3000);

    setTypingTimeout(timeout);
  };

  const stopTyping = () => {
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    if (isTyping) {
      setIsTyping(false);
      sendTypingState(false);
    }
  };

  return { startTyping, stopTyping, isTyping };
}
