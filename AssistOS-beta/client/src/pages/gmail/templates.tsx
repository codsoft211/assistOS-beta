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
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Copy, Eye } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  category: string | null;
  variables: string[];
  isActive: boolean;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export default function EmailTemplatesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const { toast } = useToast();

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ["/api/gmail/templates"],
  });

  const templates = templatesData?.templates || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/gmail/templates", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/templates"] });
      setIsCreateOpen(false);
      toast({ title: "Template created successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/gmail/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/templates"] });
      setIsEditOpen(false);
      setSelectedTemplate(null);
      toast({ title: "Template updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/gmail/templates/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/templates"] });
      toast({ title: "Template deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async ({ id, variables }: { id: string; variables: Record<string, string> }) => {
      return apiRequest(`/api/gmail/templates/${id}/preview`, {
        method: "POST",
        body: JSON.stringify({ variables }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setIsPreviewOpen(true);
    },
  });

  const handlePreview = (template: EmailTemplate) => {
    const sampleVariables: Record<string, string> = {};
    template.variables.forEach(v => {
      sampleVariables[v] = `[${v}]`;
    });
    previewMutation.mutate({ id: template.id, variables: sampleVariables });
  };

  const handleDuplicate = (template: EmailTemplate) => {
    const duplicateData = {
      name: `${template.name} (Copy)`,
      subject: template.subject,
      bodyHtml: template.bodyHtml,
      bodyText: template.bodyText,
      category: template.category,
      variables: template.variables,
    };
    createMutation.mutate(duplicateData);
  };

  if (isLoading) {
    return <div className="p-8">Loading templates...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Email Templates</h1>
          <p className="text-muted-foreground">Create and manage email templates with variables</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-template">
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <TemplateForm
              onSubmit={(data) => createMutation.mutate(data)}
              onCancel={() => setIsCreateOpen(false)}
              isLoading={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>Manage your email templates</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Variables</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No templates yet. Create your first template!
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((template: EmailTemplate) => (
                  <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell className="max-w-xs truncate">{template.subject}</TableCell>
                    <TableCell>
                      {template.category && (
                        <Badge variant="outline">{template.category}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {template.variables.map((v) => (
                          <Badge key={v} variant="secondary" className="text-xs">
                            {v}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{template.usageCount}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePreview(template)}
                          data-testid={`button-preview-${template.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedTemplate(template);
                            setIsEditOpen(true);
                          }}
                          data-testid={`button-edit-${template.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDuplicate(template)}
                          data-testid={`button-duplicate-${template.id}`}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this template?")) {
                              deleteMutation.mutate(template.id);
                            }
                          }}
                          data-testid={`button-delete-${template.id}`}
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

      {selectedTemplate && (
        <Dialog open={isEditOpen} onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) setSelectedTemplate(null);
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <TemplateForm
              initialData={selectedTemplate}
              onSubmit={(data) => updateMutation.mutate({ id: selectedTemplate.id, data })}
              onCancel={() => {
                setIsEditOpen(false);
                setSelectedTemplate(null);
              }}
              isLoading={updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
          </DialogHeader>
          {previewData && (
            <div className="space-y-4">
              <div>
                <Label>Subject</Label>
                <Input value={previewData.subject} readOnly />
              </div>
              <div>
                <Label>Body HTML</Label>
                <div
                  className="border rounded-md p-4 bg-muted min-h-[200px]"
                  dangerouslySetInnerHTML={{ __html: previewData.bodyHtml }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TemplateFormProps {
  initialData?: EmailTemplate;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

function TemplateForm({ initialData, onSubmit, onCancel, isLoading }: TemplateFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    subject: initialData?.subject || "",
    bodyHtml: initialData?.bodyHtml || "",
    bodyText: initialData?.bodyText || "",
    category: initialData?.category || "",
    variables: initialData?.variables || [],
  });

  const [newVariable, setNewVariable] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const addVariable = () => {
    if (newVariable && !formData.variables.includes(newVariable)) {
      setFormData({
        ...formData,
        variables: [...formData.variables, newVariable],
      });
      setNewVariable("");
    }
  };

  const removeVariable = (variable: string) => {
    setFormData({
      ...formData,
      variables: formData.variables.filter(v => v !== variable),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{initialData ? "Edit Template" : "Create New Template"}</DialogTitle>
        <DialogDescription>
          Create email templates with variables like {`{{customerName}}`}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            data-testid="input-template-name"
          />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Select
            value={formData.category}
            onValueChange={(value) => setFormData({ ...formData, category: value })}
          >
            <SelectTrigger data-testid="select-category">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sales">Sales</SelectItem>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            required
            data-testid="input-subject"
          />
        </div>
        <div>
          <Label>Variables</Label>
          <div className="flex gap-2">
            <Input
              value={newVariable}
              onChange={(e) => setNewVariable(e.target.value)}
              placeholder="e.g. customerName"
              data-testid="input-new-variable"
            />
            <Button type="button" onClick={addVariable} variant="secondary" data-testid="button-add-variable">
              Add
            </Button>
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {formData.variables.map((v) => (
              <Badge key={v} variant="secondary">
                {`{{${v}}}`}
                <button
                  type="button"
                  onClick={() => removeVariable(v)}
                  className="ml-2 hover:text-destructive"
                  data-testid={`button-remove-variable-${v}`}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        </div>
        <Tabs defaultValue="html">
          <TabsList>
            <TabsTrigger value="html">HTML Body</TabsTrigger>
            <TabsTrigger value="text">Text Body</TabsTrigger>
          </TabsList>
          <TabsContent value="html">
            <Textarea
              value={formData.bodyHtml}
              onChange={(e) => setFormData({ ...formData, bodyHtml: e.target.value })}
              required
              rows={10}
              className="font-mono"
              data-testid="textarea-body-html"
            />
          </TabsContent>
          <TabsContent value="text">
            <Textarea
              value={formData.bodyText}
              onChange={(e) => setFormData({ ...formData, bodyText: e.target.value })}
              rows={10}
              data-testid="textarea-body-text"
            />
          </TabsContent>
        </Tabs>
        <Alert>
          <AlertDescription>
            Use variables in your template like: {`{{variableName}}`}
          </AlertDescription>
        </Alert>
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
