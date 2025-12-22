import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Paperclip, Loader2, Smile, Mic, Sparkles } from "lucide-react";

interface QuickAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

interface ChatComposerProps {
  message: string;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onAttach: () => void;
  isStreaming: boolean;
  isUploadingFiles: boolean;
  hasFiles: boolean;
  quickActions?: QuickAction[];
  placeholder?: string;
  testId?: string;
}

export function ChatComposer({
  message,
  onMessageChange,
  onSend,
  onKeyDown,
  onAttach,
  isStreaming,
  isUploadingFiles,
  hasFiles,
  quickActions = [],
  placeholder = "Type your message...",
  testId = "input-message",
}: ChatComposerProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const disabled = isStreaming || isUploadingFiles;
  const canSend = (message.trim() || hasFiles) && !disabled;

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {/* Main Composer Card with Glassmorphism */}
      <Card
        className={`relative overflow-hidden border-2 transition-all duration-300 hover-elevate ${
          isFocused
            ? "border-primary/50 shadow-lg shadow-primary/10"
            : "border-border hover:border-primary/30"
        } ${
          isHovered ? "shadow-md" : ""
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Gradient Background Glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary/5 pointer-events-none" />
        
        {/* Subtle Shimmer on Hover */}
        {isHovered && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent pointer-events-none animate-shimmer" />
        )}

        <div className="relative p-4 space-y-3">
          {/* Quick Actions Row (Top Band) */}
          {quickActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action, idx) => {
                const Icon = action.icon;
                return (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="cursor-pointer hover-elevate active-elevate-2 px-3 py-1.5"
                    onClick={action.action}
                    data-testid={`chip-quick-action-${idx}`}
                  >
                    <Icon className="h-3 w-3 mr-1.5" />
                    <span className="text-xs">{action.label}</span>
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Input Area (Middle Band) */}
          <div className="flex items-end gap-3">
            {/* Main Textarea with Rounded Design */}
            <div className="flex-1 relative">
              <Textarea
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={placeholder}
                disabled={disabled}
                data-testid={testId}
                className="resize-none border-0 bg-muted/50 rounded-2xl min-h-[44px] max-h-32 px-4 py-3 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:bg-background/80 transition-colors"
                rows={1}
              />
            </div>

            {/* Send Button - Prominent & Adorable */}
            <Button
              onClick={onSend}
              disabled={!canSend}
              size="icon"
              className={`rounded-full shrink-0 transition-all ${
                canSend
                  ? "bg-primary hover:bg-primary/90 hover:scale-105 active:scale-95 shadow-md shadow-primary/30"
                  : ""
              }`}
              data-testid="button-send"
            >
              {isStreaming ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Utility Toolbar (Bottom Band) */}
          <div className="flex items-center gap-1.5 pt-1">
            {/* Attachment Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onAttach}
              disabled={disabled}
              className="h-8 px-2.5 hover-elevate"
              data-testid="button-attach-file"
            >
              {isUploadingFiles ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Paperclip className="h-4 w-4 mr-1.5" />
              )}
              <span className="text-xs">Attach</span>
            </Button>

            {/* Emoji Picker (Placeholder) */}
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="h-8 px-2.5 hover-elevate"
              data-testid="button-emoji"
            >
              <Smile className="h-4 w-4 mr-1.5" />
              <span className="text-xs">Emoji</span>
            </Button>

            {/* Voice Input (Placeholder) */}
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="h-8 px-2.5 hover-elevate"
              data-testid="button-voice"
            >
              <Mic className="h-4 w-4 mr-1.5" />
              <span className="text-xs">Voice</span>
            </Button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* AI Sparkle Indicator */}
            {isFocused && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-fade-in">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>AssistME is ready</span>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
