import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, TestTube } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EmailAutoResponder {
  id: string;
  name: string;
  triggerType: string;
  triggerValue: string;
  triggerOperator: string;
  templateId: string | null;
  responseSubject: string | null;
  responseBody: string | null;
  isActive: boolean;
  priority: number;
  maxResponsesPerDay: number;
  triggerCount: number;
  lastTriggeredAt: Date | null;
  createdAt: Date;
}

export default function AutoRespondersPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isTestOpen, setIsTestOpen] = useState(false);
  const [selectedResponder, setSelectedResponder] = useState<EmailAutoResponder | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const { toast } = useToast();

  const { data: respondersData, isLoading } = useQuery({
    queryKey: ["/api/gmail/auto-responders"],
  });

  const { data: templatesData } = useQuery({
    queryKey: ["/api/gmail/templates"],
  });

  const responders = respondersData?.responders || [];
  const templates = templatesData?.templates || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/gmail/auto-responders", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/auto-responders"] });
      setIsCreateOpen(false);
      toast({ title: "Auto-responder created successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create auto-responder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/gmail/auto-responders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/auto-responders"] });
      setIsEditOpen(false);
      setSelectedResponder(null);
      toast({ title: "Auto-responder updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update auto-responder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/gmail/auto-responders/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/auto-responders"] });
      toast({ title: "Auto-responder deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete auto-responder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: any }) => {
      return apiRequest(`/api/gmail/auto-responders/${id}/test`, {
        method: "POST",
        body: JSON.stringify(email),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (data) => {
      setTestResult(data);
    },
  });

  if (isLoading) {
    return <div className="p-8">Loading auto-responders...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Email Auto-Responders</h1>
          <p className="text-muted-foreground">Automatically respond to emails based on rules</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-responder">
              <Plus className="w-4 h-4 mr-2" />
              New Auto-Responder
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <ResponderForm
              templates={templates}
              onSubmit={(data) => createMutation.mutate(data)}
              onCancel={() => setIsCreateOpen(false)}
              isLoading={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Auto-Responders</CardTitle>
          <CardDescription>Manage your automatic email response rules</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stats</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {responders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No auto-responders yet. Create your first rule!
                  </TableCell>
                </TableRow>
              ) : (
                responders.map((responder: EmailAutoResponder) => (
                  <TableRow key={responder.id} data-testid={`row-responder-${responder.id}`}>
                    <TableCell className="font-medium">{responder.name}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant="outline">{responder.triggerType}</Badge>
                        <div className="text-xs text-muted-foreground">
                          {responder.triggerOperator}: {responder.triggerValue}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{responder.priority}</TableCell>
                    <TableCell>
                      <Badge variant={responder.isActive ? "default" : "secondary"}>
                        {responder.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>Triggered: {responder.triggerCount}x</div>
                        {responder.lastTriggeredAt && (
                          <div className="text-xs text-muted-foreground">
                            Last: {new Date(responder.lastTriggeredAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedResponder(responder);
                            setIsTestOpen(true);
                          }}
                          data-testid={`button-test-${responder.id}`}
                        >
                          <TestTube className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedResponder(responder);
                            setIsEditOpen(true);
                          }}
                          data-testid={`button-edit-${responder.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this auto-responder?")) {
                              deleteMutation.mutate(responder.id);
                            }
                          }}
                          data-testid={`button-delete-${responder.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedResponder && (
        <Dialog open={isEditOpen} onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) setSelectedResponder(null);
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <ResponderForm
              initialData={selectedResponder}
              templates={templates}
              onSubmit={(data) => updateMutation.mutate({ id: selectedResponder.id, data })}
              onCancel={() => {
                setIsEditOpen(false);
                setSelectedResponder(null);
              }}
              isLoading={updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {selectedResponder && (
        <Dialog open={isTestOpen} onOpenChange={(open) => {
          setIsTestOpen(open);
          if (!open) {
            setSelectedResponder(null);
            setTestResult(null);
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Test Auto-Responder</DialogTitle>
              <DialogDescription>Test if this rule would trigger with a sample email</DialogDescription>
            </DialogHeader>
            <TestForm
              responder={selectedResponder}
              onTest={(email) => testMutation.mutate({ id: selectedResponder.id, email })}
              testResult={testResult}
              isLoading={testMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

interface ResponderFormProps {
  initialData?: EmailAutoResponder;
  templates: any[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

function ResponderForm({ initialData, templates, onSubmit, onCancel, isLoading }: ResponderFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    triggerType: initialData?.triggerType || "subject",
    triggerValue: initialData?.triggerValue || "",
    triggerOperator: initialData?.triggerOperator || "contains",
    templateId: initialData?.templateId || "",
    responseSubject: initialData?.responseSubject || "",
    responseBody: initialData?.responseBody || "",
    isActive: initialData?.isActive ?? true,
    priority: initialData?.priority || 0,
    maxResponsesPerDay: initialData?.maxResponsesPerDay || 100,
  });

  const [useTemplate, setUseTemplate] = useState(!!initialData?.templateId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = { ...formData };
    if (useTemplate) {
      submitData.responseSubject = null;
      submitData.responseBody = null;
    } else {
      submitData.templateId = null;
    }
    onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{initialData ? "Edit Auto-Responder" : "Create New Auto-Responder"}</DialogTitle>
        <DialogDescription>Set up automatic email responses based on conditions</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            data-testid="input-responder-name"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="triggerType">Trigger Type</Label>
            <Select
              value={formData.triggerType}
              onValueChange={(value) => setFormData({ ...formData, triggerType: value })}
            >
              <SelectTrigger data-testid="select-trigger-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="subject">Subject</SelectItem>
                <SelectItem value="sender">Sender</SelectItem>
                <SelectItem value="keyword">Body Keyword</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="triggerOperator">Operator</Label>
            <Select
              value={formData.triggerOperator}
              onValueChange={(value) => setFormData({ ...formData, triggerOperator: value })}
            >
              <SelectTrigger data-testid="select-trigger-operator">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="equals">Equals</SelectItem>
                <SelectItem value="startsWith">Starts With</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="triggerValue">Trigger Value</Label>
          <Input
            id="triggerValue"
            value={formData.triggerValue}
            onChange={(e) => setFormData({ ...formData, triggerValue: e.target.value })}
            required
            placeholder="e.g. support@example.com or 'urgent'"
            data-testid="input-trigger-value"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="useTemplate"
            checked={useTemplate}
            onCheckedChange={setUseTemplate}
            data-testid="switch-use-template"
          />
          <Label htmlFor="useTemplate">Use Template</Label>
        </div>

        {useTemplate ? (
          <div>
            <Label htmlFor="templateId">Template</Label>
            <Select
              value={formData.templateId || ""}
              onValueChange={(value) => setFormData({ ...formData, templateId: value })}
            >
              <SelectTrigger data-testid="select-template">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="responseSubject">Response Subject</Label>
              <Input
                id="responseSubject"
                value={formData.responseSubject || ""}
                onChange={(e) => setFormData({ ...formData, responseSubject: e.target.value })}
                data-testid="input-response-subject"
              />
            </div>
            <div>
              <Label htmlFor="responseBody">Response Body</Label>
              <Textarea
                id="responseBody"
                value={formData.responseBody || ""}
                onChange={(e) => setFormData({ ...formData, responseBody: e.target.value })}
                rows={6}
                data-testid="textarea-response-body"
              />
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="priority">Priority (higher = runs first)</Label>
            <Input
              id="priority"
              type="number"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
              data-testid="input-priority"
            />
          </div>
          <div>
            <Label htmlFor="maxResponsesPerDay">Max Responses/Day</Label>
            <Input
              id="maxResponsesPerDay"
              type="number"
              value={formData.maxResponsesPerDay}
              onChange={(e) => setFormData({ ...formData, maxResponsesPerDay: parseInt(e.target.value) })}
              data-testid="input-max-responses"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="isActive"
            checked={formData.isActive}
            onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
            data-testid="switch-is-active"
          />
          <Label htmlFor="isActive">Active</Label>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading} data-testid="button-submit">
          {isLoading ? "Saving..." : initialData ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function TestForm({ responder, onTest, testResult, isLoading }: any) {
  const [testEmail, setTestEmail] = useState({
    fromAddress: "test@example.com",
    subject: "Test Subject",
    bodyText: "Test body content",
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>From Address</Label>
        <Input
          value={testEmail.fromAddress}
          onChange={(e) => setTestEmail({ ...testEmail, fromAddress: e.target.value })}
          data-testid="input-test-from"
        />
      </div>
      <div>
        <Label>Subject</Label>
        <Input
          value={testEmail.subject}
          onChange={(e) => setTestEmail({ ...testEmail, subject: e.target.value })}
          data-testid="input-test-subject"
        />
      </div>
      <div>
        <Label>Body</Label>
        <Textarea
          value={testEmail.bodyText}
          onChange={(e) => setTestEmail({ ...testEmail, bodyText: e.target.value })}
          data-testid="textarea-test-body"
        />
      </div>
      <Button onClick={() => onTest(testEmail)} disabled={isLoading} data-testid="button-run-test">
        {isLoading ? "Testing..." : "Run Test"}
      </Button>

      {testResult && (
        <div className="mt-4 p-4 border rounded-md">
          <div className="font-medium mb-2">
            Result: {testResult.wouldTrigger ? (
              <Badge variant="default">Would Trigger ✓</Badge>
            ) : (
              <Badge variant="secondary">Would Not Trigger</Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            <div>Tested value: {testResult.testedValue}</div>
            <div>Expected: {testResult.triggerOperator} "{testResult.triggerValue}"</div>
          </div>
        </div>
      )}
    </div>
  );
}
