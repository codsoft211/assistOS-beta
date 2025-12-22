import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Users, Plus, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface GroupManagerProps {
  accountId: string;
}

export function WhatsAppGroupManager({ accountId }: GroupManagerProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [participants, setParticipants] = useState<string[]>([""]);

  const WORKER_URL = import.meta.env.VITE_WORKER_URL || (typeof window !== 'undefined' && window.location.origin.includes('5000') ? 'http://localhost:3001' : 'http://localhost:3001');

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const validParticipants = participants.filter(p => p.trim());
      if (validParticipants.length < 1) {
        throw new Error('Group must have at least 1 participant');
      }
      
      const response = await fetch(`${WORKER_URL}/whatsapp-web/create-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          name: groupName,
          participants: validParticipants,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create group');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Group created",
        description: `Group "${groupName}" has been created successfully.`,
      });
      setOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/conversations'] });
      
      // Optionally set description if provided
      if (groupDescription.trim() && data.groupId) {
        updateGroupDescription(data.groupId);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create group",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateGroupDescription = async (groupId: string) => {
    try {
      await fetch(`${WORKER_URL}/whatsapp-web/update-group-description`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          groupId,
          description: groupDescription,
        }),
      });
    } catch (error) {
      console.error('Failed to set group description:', error);
    }
  };

  const resetForm = () => {
    setGroupName("");
    setGroupDescription("");
    setParticipants([""]);
  };

  const addParticipant = () => {
    setParticipants([...participants, ""]);
  };

  const removeParticipant = (index: number) => {
    if (participants.length > 1) {
      setParticipants(participants.filter((_, i) => i !== index));
    }
  };

  const updateParticipant = (index: number, value: string) => {
    const newParticipants = [...participants];
    newParticipants[index] = value;
    setParticipants(newParticipants);
  };

  const canCreate = groupName.trim() && participants.filter(p => p.trim()).length >= 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users className="h-4 w-4 mr-2" />
          Create Group
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create WhatsApp Group</DialogTitle>
          <DialogDescription>
            Create a new group and add participants
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">Group Name *</Label>
            <Input
              id="group-name"
              placeholder="My Awesome Group"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-description">Description (optional)</Label>
            <Textarea
              id="group-description"
              placeholder="What's this group about?"
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              maxLength={512}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Participants (with country code)</Label>
            <p className="text-xs text-muted-foreground">
              Enter phone numbers like: 918789545361
            </p>
            {participants.map((participant, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder={`Phone number ${index + 1}`}
                  value={participant}
                  onChange={(e) => updateParticipant(index, e.target.value)}
                />
                {participants.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeParticipant(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={addParticipant}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Participant
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createGroupMutation.mutate()}
            disabled={!canCreate || createGroupMutation.isPending}
          >
            {createGroupMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Group"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface GroupActionsProps {
  accountId: string;
  groupId: string;
}

export function WhatsAppGroupActions({ accountId, groupId }: GroupActionsProps) {
  const { toast } = useToast();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const WORKER_URL = import.meta.env.VITE_WORKER_URL || (typeof window !== 'undefined' && window.location.origin.includes('5000') ? 'http://localhost:3001' : 'http://localhost:3001');

  const getInviteLinkMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${WORKER_URL}/whatsapp-web/group-invite-link/${accountId}/${groupId}`
      );
      if (!response.ok) throw new Error('Failed to get invite link');
      return response.json();
    },
    onSuccess: (data) => {
      setInviteLink(data.inviteLink);
      setShowInviteDialog(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to get invite link",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const leaveGroupMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${WORKER_URL}/whatsapp-web/leave-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, groupId }),
      });
      if (!response.ok) throw new Error('Failed to leave group');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Left group",
        description: "You have left the group.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/conversations'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to leave group",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyInviteLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      toast({ title: "Copied", description: "Invite link copied to clipboard" });
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => getInviteLinkMutation.mutate()}
          disabled={getInviteLinkMutation.isPending}
        >
          Get Invite Link
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm("Are you sure you want to leave this group?")) {
              leaveGroupMutation.mutate();
            }
          }}
          disabled={leaveGroupMutation.isPending}
        >
          Leave Group
        </Button>
      </div>

      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Group Invite Link</DialogTitle>
            <DialogDescription>
              Share this link to invite people to the group
            </DialogDescription>
          </DialogHeader>
          {inviteLink && (
            <div className="space-y-3">
              <Input value={inviteLink} readOnly />
              <Button onClick={copyInviteLink} className="w-full">
                Copy Link
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
