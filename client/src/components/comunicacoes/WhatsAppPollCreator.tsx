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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { BarChart3, Plus, X, Loader2 } from "lucide-react";

interface PollCreatorProps {
  accountId: string;
  chatId: string;
  onSuccess?: () => void;
}

export function WhatsAppPollCreator({ accountId, chatId, onSuccess }: PollCreatorProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowMultipleAnswers, setAllowMultipleAnswers] = useState(false);

  const sendPollMutation = useMutation({
    mutationFn: async () => {
      const validOptions = options.filter(opt => opt.trim());
      if (validOptions.length < 2) {
        throw new Error('Poll must have at least 2 options');
      }
      
      const response = await fetch('/api/user/whatsapp-web/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          chatId,
          question,
          options: validOptions,
          allowMultipleAnswers,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send poll');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Poll sent",
        description: "Your poll has been sent successfully.",
      });
      setOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/conversations'] });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send poll",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setQuestion("");
    setOptions(["", ""]);
    setAllowMultipleAnswers(false);
  };

  const addOption = () => {
    if (options.length < 12) { // WhatsApp limit is 12 options
      setOptions([...options, ""]);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const canSend = question.trim() && options.filter(opt => opt.trim()).length >= 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BarChart3 className="h-4 w-4 mr-2" />
          Create Poll
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a Poll</DialogTitle>
          <DialogDescription>
            Ask a question and provide options for people to vote
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="question">Question</Label>
            <Input
              id="question"
              placeholder="What's your favorite color?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={255}
            />
          </div>

          <div className="space-y-2">
            <Label>Options (max 12)</Label>
            {options.map((option, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder={`Option ${index + 1}`}
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                  maxLength={100}
                />
                {options.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOption(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 12 && (
              <Button
                variant="outline"
                size="sm"
                onClick={addOption}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Option
              </Button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="multiple"
              checked={allowMultipleAnswers}
              onCheckedChange={(checked) => setAllowMultipleAnswers(checked as boolean)}
            />
            <label
              htmlFor="multiple"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Allow multiple answers
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => sendPollMutation.mutate()}
            disabled={!canSend || sendPollMutation.isPending}
          >
            {sendPollMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              "Send Poll"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
