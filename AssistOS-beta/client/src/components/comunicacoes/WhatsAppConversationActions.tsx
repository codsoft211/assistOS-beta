import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  MoreVertical,
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Pin,
  PinOff,
  Trash2,
  Eraser,
  Loader2,
} from "lucide-react";

interface ConversationActionsProps {
  accountId: string;
  chatId: string;
  conversationId: string;
  isArchived?: boolean;
  isMuted?: boolean;
  isPinned?: boolean;
}

export function WhatsAppConversationActions({
  accountId,
  chatId,
  conversationId,
  isArchived = false,
  isMuted = false,
  isPinned = false,
}: ConversationActionsProps) {
  const { toast } = useToast();

  // Archive chat
  const archiveMutation = useMutation({
    mutationFn: async () => {
      const action = isArchived ? 'unarchive' : 'archive';
      const response = await fetch(`/api/user/whatsapp-web/conversation-action/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, chatId }),
      });
      if (!response.ok) throw new Error('Failed to archive chat');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: isArchived ? "Chat unarchived" : "Chat archived",
        description: isArchived ? "Chat moved to inbox" : "Chat moved to archive",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/conversations'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Action failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mute chat
  const muteMutation = useMutation({
    mutationFn: async (duration?: number) => {
      const action = isMuted ? 'unmute' : 'mute';
      const response = await fetch(`/api/user/whatsapp-web/conversation-action/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, chatId, duration }),
      });
      if (!response.ok) throw new Error(`Failed to ${action} chat`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: isMuted ? "Chat unmuted" : "Chat muted",
        description: isMuted ? "Notifications enabled" : "Notifications disabled",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/conversations'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Action failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Pin chat
  const pinMutation = useMutation({
    mutationFn: async () => {
      const action = isPinned ? 'unpin' : 'pin';
      const response = await fetch(`/api/user/whatsapp-web/conversation-action/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, chatId }),
      });
      if (!response.ok) throw new Error('Failed to pin chat');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: isPinned ? "Chat unpinned" : "Chat pinned",
        description: isPinned ? "Chat unpinned from top" : "Chat pinned to top",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/conversations'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Action failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Clear messages
  const clearMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/user/whatsapp-web/conversation-action/clear-chat-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, chatId }),
      });
      if (!response.ok) throw new Error('Failed to clear messages');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Messages cleared", description: "All messages deleted from chat" });
      queryClient.invalidateQueries({ queryKey: [`/api/whatsapp/conversations/${conversationId}/messages`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to clear",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete chat
  const deleteChatMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/user/whatsapp-web/conversation-action/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, chatId }),
      });
      if (!response.ok) throw new Error('Failed to delete chat');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Chat deleted", description: "Chat removed from inbox" });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/conversations'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isLoading = archiveMutation.isPending || muteMutation.isPending || 
                    pinMutation.isPending || clearMutation.isPending || 
                    deleteChatMutation.isPending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <MoreVertical className="h-5 w-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => archiveMutation.mutate()}>
          {isArchived ? (
            <>
              <ArchiveRestore className="h-4 w-4 mr-2" />
              Unarchive
            </>
          ) : (
            <>
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </>
          )}
        </DropdownMenuItem>
        
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {isMuted ? (
              <>
                <BellOff className="h-4 w-4 mr-2" />
                Muted
              </>
            ) : (
              <>
                <Bell className="h-4 w-4 mr-2" />
                Mute
              </>
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {isMuted ? (
              <DropdownMenuItem onClick={() => muteMutation.mutate()}>
                Unmute
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onClick={() => muteMutation.mutate(3600)}>
                  1 hour
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => muteMutation.mutate(28800)}>
                  8 hours
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => muteMutation.mutate(604800)}>
                  1 week
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => muteMutation.mutate()}>
                  Forever
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        
        <DropdownMenuItem onClick={() => pinMutation.mutate()}>
          {isPinned ? (
            <>
              <PinOff className="h-4 w-4 mr-2" />
              Unpin
            </>
          ) : (
            <>
              <Pin className="h-4 w-4 mr-2" />
              Pin
            </>
          )}
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem
          onClick={() => {
            if (confirm("Clear all messages from this chat?")) {
              clearMutation.mutate();
            }
          }}
        >
          <Eraser className="h-4 w-4 mr-2" />
          Clear Messages
        </DropdownMenuItem>
        
        <DropdownMenuItem
          onClick={() => {
            if (confirm("Delete this chat? This cannot be undone.")) {
              deleteChatMutation.mutate();
            }
          }}
          className="text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Chat
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
