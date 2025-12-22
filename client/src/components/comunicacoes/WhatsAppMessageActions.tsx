import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  MoreVertical,
  Reply,
  Forward,
  Star,
  Trash2,
  Smile,
  Copy,
  Download,
  Loader2,
} from "lucide-react";

interface MessageActionsProps {
  messageId: string;
  waMessageId: string;
  accountId: string;
  chatId: string;
  messageText?: string;
  hasMedia: boolean;
  isOutbound: boolean;
  onActionComplete?: () => void;
}

export function WhatsAppMessageActions({
  messageId,
  waMessageId,
  accountId,
  chatId,
  messageText,
  hasMedia,
  isOutbound,
  onActionComplete,
}: MessageActionsProps) {
  const { toast } = useToast();
  const [reactionDialogOpen, setReactionDialogOpen] = useState(false);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState("");
  const [replyText, setReplyText] = useState("");
  const [forwardToChatId, setForwardToChatId] = useState("");

  // React to message
  const reactMutation = useMutation({
    mutationFn: async (emoji: string) => {
      const response = await fetch('/api/user/whatsapp-web/reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, messageId: waMessageId, emoji }),
      });
      if (!response.ok) throw new Error('Failed to send reaction');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Reaction sent", description: "Your reaction has been added." });
      setReactionDialogOpen(false);
      onActionComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to react",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reply to message
  const replyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/user/whatsapp-web/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          chatId,
          text: replyText,
          quotedMessageId: waMessageId,
        }),
      });
      if (!response.ok) throw new Error('Failed to send reply');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Reply sent", description: "Your reply has been sent." });
      setReplyDialogOpen(false);
      setReplyText("");
      onActionComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to reply",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Forward message
  const forwardMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/user/whatsapp-web/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          messageId: waMessageId,
          toChatId: forwardToChatId,
        }),
      });
      if (!response.ok) throw new Error('Failed to forward message');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Message forwarded", description: "Message has been forwarded." });
      setForwardDialogOpen(false);
      setForwardToChatId("");
      onActionComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to forward",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Star message
  const starMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/user/whatsapp-web/star-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, messageId: waMessageId }),
      });
      if (!response.ok) throw new Error('Failed to star message');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Message starred", description: "Message added to starred." });
      onActionComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to star",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete for everyone
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/user/whatsapp-web/message-for-everyone', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, messageId: waMessageId }),
      });
      if (!response.ok) throw new Error('Failed to delete message');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Message deleted", description: "Message deleted for everyone." });
      queryClient.invalidateQueries({ queryKey: [`/api/whatsapp/conversations`] });
      onActionComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const popularEmojis = ["❤️", "👍", "😂", "😮", "😢", "🙏", "🔥", "🎉"];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setReactionDialogOpen(true)}>
            <Smile className="h-4 w-4 mr-2" />
            React
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setReplyDialogOpen(true)}>
            <Reply className="h-4 w-4 mr-2" />
            Reply
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setForwardDialogOpen(true)}>
            <Forward className="h-4 w-4 mr-2" />
            Forward
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => starMutation.mutate()}>
            <Star className="h-4 w-4 mr-2" />
            Star
          </DropdownMenuItem>
          {messageText && (
            <DropdownMenuItem onClick={() => {
              navigator.clipboard.writeText(messageText);
              toast({ title: "Copied", description: "Message copied to clipboard" });
            }}>
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </DropdownMenuItem>
          )}
          {hasMedia && (
            <DropdownMenuItem>
              <Download className="h-4 w-4 mr-2" />
              Download
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {isOutbound && (
            <DropdownMenuItem 
              onClick={() => {
                if (confirm("Delete this message for everyone?")) {
                  deleteMutation.mutate();
                }
              }}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete for Everyone
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Reaction Dialog */}
      <Dialog open={reactionDialogOpen} onOpenChange={setReactionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>React to Message</DialogTitle>
            <DialogDescription>
              Click an emoji to react. Click the same emoji again in WhatsApp to remove it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-3 py-4">
            {popularEmojis.map((emoji) => (
              <Button
                key={emoji}
                variant="outline"
                className="text-3xl h-16"
                onClick={() => {
                  setSelectedEmoji(emoji);
                  reactMutation.mutate(emoji);
                }}
                disabled={reactMutation.isPending}
              >
                {emoji}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <Label>Or enter custom emoji:</Label>
            <Input
              placeholder="😊"
              value={selectedEmoji}
              onChange={(e) => setSelectedEmoji(e.target.value)}
              maxLength={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReactionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => reactMutation.mutate(selectedEmoji)}
              disabled={!selectedEmoji || reactMutation.isPending}
            >
              {reactMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
              ) : (
                "Send Reaction"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reply Dialog */}
      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reply to Message</DialogTitle>
            <DialogDescription>
              Replying to: "{messageText?.substring(0, 50)}..."
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Your reply:</Label>
            <Input
              placeholder="Type your reply..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && replyText.trim()) {
                  replyMutation.mutate();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => replyMutation.mutate()}
              disabled={!replyText.trim() || replyMutation.isPending}
            >
              {replyMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
              ) : (
                "Send Reply"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Forward Dialog */}
      <Dialog open={forwardDialogOpen} onOpenChange={setForwardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forward Message</DialogTitle>
            <DialogDescription>
              Enter the recipient's phone number (with country code)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Phone number:</Label>
            <Input
              placeholder="e.g., 918789545361"
              value={forwardToChatId}
              onChange={(e) => setForwardToChatId(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForwardDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => forwardMutation.mutate()}
              disabled={!forwardToChatId.trim() || forwardMutation.isPending}
            >
              {forwardMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Forwarding...</>
              ) : (
                "Forward"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
