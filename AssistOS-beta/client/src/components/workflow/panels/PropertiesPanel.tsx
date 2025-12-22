import { useState, useEffect } from 'react';
import { useWorkflowStore } from '@/lib/workflow/store/workflowStore';
import { nodeRegistry } from '@/lib/workflow/registry/NodeRegistry';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Trash2, Copy, HelpCircle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export function PropertiesPanel() {
  const { selectedNodeId, nodes, updateNode, deleteNode, duplicateNode, selectNode } = useWorkflowStore();
  const [fieldsText, setFieldsText] = useState('{}');
  const [headersText, setHeadersText] = useState('{}');
  const [dataText, setDataText] = useState('{}');
  const [filtersText, setFiltersText] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);
  
  const node = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
  
  // Initialize text fields when node changes
  useEffect(() => {
    if (node) {
      setFieldsText(JSON.stringify(node.data.config?.fields || {}, null, 2));
      setHeadersText(JSON.stringify(node.data.config?.headers || {}, null, 2));
      setDataText(JSON.stringify(node.data.config?.data || {}, null, 2));
      setFiltersText(JSON.stringify(node.data.config?.filters || {}, null, 2));
      setJsonError(null);
    }
  }, [selectedNodeId, node?.id]);
  
  if (!node) return null;
  
  const definition = nodeRegistry.get(node.type!);
  const Icon = definition.icon;
  
  const handleConfigChange = (field: string, value: any) => {
    updateNode(node.id, {
      config: { ...node.data.config, [field]: value }
    });
  };
  
  const handleFieldsChange = (text: string) => {
    setFieldsText(text);
    try {
      const parsed = JSON.parse(text);
      handleConfigChange('fields', parsed);
      setJsonError(null);
    } catch (e) {
      setJsonError('Invalid JSON');
    }
  };
  
  const handleHeadersChange = (text: string) => {
    setHeadersText(text);
    try {
      const parsed = JSON.parse(text);
      handleConfigChange('headers', parsed);
      setJsonError(null);
    } catch (e) {
      setJsonError('Invalid JSON');
    }
  };
  
  const handleDataChange = (text: string) => {
    setDataText(text);
  };
  
  const handleDataBlur = () => {
    try {
      const parsed = JSON.parse(dataText);
      handleConfigChange('data', parsed);
      setJsonError(null);
    } catch (e) {
      setJsonError('Invalid JSON in Data field');
    }
  };
  
  const handleFiltersChange = (text: string) => {
    setFiltersText(text);
  };
  
  const handleFiltersBlur = () => {
    try {
      const parsed = JSON.parse(filtersText);
      handleConfigChange('filters', parsed);
      setJsonError(null);
    } catch (e) {
      setJsonError('Invalid JSON in Filters field');
    }
  };
  
  const handleDelete = () => {
    deleteNode(node.id);
    selectNode(null);
  };
  
  const handleDuplicate = () => {
    duplicateNode(node.id);
  };
  
  return (
    <Sheet open={!!selectedNodeId} onOpenChange={(open) => !open && selectNode(null)}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded ${definition.color}`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <SheetTitle>{definition.label}</SheetTitle>
              <SheetDescription className="text-xs mt-0.5">
                {definition.description}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          {/* Node Label */}
          <div className="space-y-2">
            <Label htmlFor="node-label">Node Label</Label>
            <Input
              id="node-label"
              value={node.data.label}
              onChange={(e) => updateNode(node.id, { label: e.target.value })}
              placeholder="Enter node label"
            />
            <p className="text-xs text-muted-foreground">
              A descriptive name for this node in the workflow
            </p>
          </div>
          
          <Separator />
          
          {/* Schedule Trigger Node */}
          {node.type === 'schedule_trigger' && (
            <div className="space-y-4">
              <div className="bg-indigo-50 dark:bg-indigo-950 p-3 rounded-md border border-indigo-200 dark:border-indigo-800">
                <p className="text-sm text-indigo-700 dark:text-indigo-300">
                  Configure when this workflow should run automatically.
                </p>
              </div>
              
              {/* Schedule Type */}
              <div className="space-y-2">
                <Label htmlFor="scheduleType">Schedule Type</Label>
                <Select
                  value={node.data.config?.scheduleType || 'interval'}
                  onValueChange={(value) => handleConfigChange('scheduleType', value)}
                >
                  <SelectTrigger id="scheduleType">
                    <SelectValue placeholder="Select schedule type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interval">Interval (Every X hours/minutes)</SelectItem>
                    <SelectItem value="cron">Cron Expression</SelectItem>
                    <SelectItem value="once">Run Once</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Interval */}
              {node.data.config?.scheduleType === 'interval' && (
                <div className="space-y-2">
                  <Label htmlFor="interval">Interval</Label>
                  <Select
                    value={node.data.config?.interval || '1h'}
                    onValueChange={(value) => handleConfigChange('interval', value)}
                  >
                    <SelectTrigger id="interval">
                      <SelectValue placeholder="Select interval" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5m">Every 5 minutes</SelectItem>
                      <SelectItem value="15m">Every 15 minutes</SelectItem>
                      <SelectItem value="30m">Every 30 minutes</SelectItem>
                      <SelectItem value="1h">Every hour</SelectItem>
                      <SelectItem value="6h">Every 6 hours</SelectItem>
                      <SelectItem value="12h">Every 12 hours</SelectItem>
                      <SelectItem value="1d">Every day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {/* Cron Expression */}
              {node.data.config?.scheduleType === 'cron' && (
                <div className="space-y-2">
                  <Label htmlFor="cronExpression">Cron Expression</Label>
                  <Input
                    id="cronExpression"
                    value={node.data.config?.cronExpression || '0 9 * * *'}
                    onChange={(e) => handleConfigChange('cronExpression', e.target.value)}
                    placeholder="0 9 * * *"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: minute hour day month weekday (e.g., "0 9 * * *" = daily at 9 AM)
                  </p>
                </div>
              )}
              
              {/* Timezone */}
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={node.data.config?.timezone || 'UTC'}
                  onValueChange={(value) => handleConfigChange('timezone', value)}
                >
                  <SelectTrigger id="timezone">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">Eastern (US)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific (US)</SelectItem>
                    <SelectItem value="Europe/London">London</SelectItem>
                    <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                    <SelectItem value="Asia/Kolkata">India (IST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
          {/* Fetch Invoice Node */}
          {node.type === 'fetch_invoice' && (
            <div className="space-y-4">
              <div className="bg-cyan-50 dark:bg-cyan-950 p-3 rounded-md border border-cyan-200 dark:border-cyan-800">
                <p className="text-sm text-cyan-700 dark:text-cyan-300">
                  Fetch invoices from the database based on filters.
                </p>
              </div>
              
              {/* Status Filter */}
              <div className="space-y-2">
                <Label htmlFor="status">Invoice Status</Label>
                <Select
                  value={node.data.config?.status || 'overdue'}
                  onValueChange={(value) => handleConfigChange('status', value)}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="any">Any Status</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Due Date Range */}
              <div className="space-y-2">
                <Label htmlFor="dueDateRange">Due Date Range</Label>
                <Select
                  value={node.data.config?.dueDateRange || 'past'}
                  onValueChange={(value) => handleConfigChange('dueDateRange', value)}
                >
                  <SelectTrigger id="dueDateRange">
                    <SelectValue placeholder="Select date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="past">Past Due (Overdue)</SelectItem>
                    <SelectItem value="today">Due Today</SelectItem>
                    <SelectItem value="this_week">Due This Week</SelectItem>
                    <SelectItem value="this_month">Due This Month</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Custom Date Range */}
              {node.data.config?.dueDateRange === 'custom' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="dueDateFrom">From Date</Label>
                    <Input
                      id="dueDateFrom"
                      type="date"
                      value={node.data.config?.dueDateFrom || ''}
                      onChange={(e) => handleConfigChange('dueDateFrom', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dueDateTo">To Date</Label>
                    <Input
                      id="dueDateTo"
                      type="date"
                      value={node.data.config?.dueDateTo || ''}
                      onChange={(e) => handleConfigChange('dueDateTo', e.target.value)}
                    />
                  </div>
                </>
              )}
              
              {/* Limit */}
              <div className="space-y-2">
                <Label htmlFor="limit">Maximum Invoices</Label>
                <Input
                  id="limit"
                  type="number"
                  min={1}
                  max={1000}
                  value={node.data.config?.limit || 100}
                  onChange={(e) => handleConfigChange('limit', parseInt(e.target.value) || 100)}
                  placeholder="100"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of invoices to fetch (1-1000)
                </p>
              </div>
            </div>
          )}
          
          {/* Send Email Node */}
          {node.type === 'send_email' && (
            <div className="space-y-4">
              <div className="bg-rose-50 dark:bg-rose-950 p-3 rounded-md border border-rose-200 dark:border-rose-800">
                <p className="text-sm text-rose-700 dark:text-rose-300">
                  Send emails to invoice recipients. Use {'{{variable}}'} for template substitution.
                </p>
              </div>
              
              {/* Mode */}
              <div className="space-y-2">
                <Label htmlFor="mode">Send Mode</Label>
                <Select
                  value={node.data.config?.mode || 'batch'}
                  onValueChange={(value) => handleConfigChange('mode', value)}
                >
                  <SelectTrigger id="mode">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="batch">Batch (One email per invoice)</SelectItem>
                    <SelectItem value="single">Single (One summary email)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* To Field */}
              <div className="space-y-2">
                <Label htmlFor="toField">Recipient Email Field</Label>
                <Input
                  id="toField"
                  value={node.data.config?.toField || '{{customer_email}}'}
                  onChange={(e) => handleConfigChange('toField', e.target.value)}
                  placeholder="{{customer_email}}"
                />
                <p className="text-xs text-muted-foreground">
                  Template variable for recipient email from invoice data
                </p>
              </div>
              
              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="subject">Email Subject</Label>
                <Input
                  id="subject"
                  value={node.data.config?.subject || 'Invoice Reminder - {{invoice_number}}'}
                  onChange={(e) => handleConfigChange('subject', e.target.value)}
                  placeholder="Invoice Reminder - {{invoice_number}}"
                />
              </div>
              
              {/* Body Template */}
              <div className="space-y-2">
                <Label htmlFor="bodyTemplate">Email Body Template</Label>
                <Textarea
                  id="bodyTemplate"
                  value={node.data.config?.bodyTemplate || ''}
                  onChange={(e) => handleConfigChange('bodyTemplate', e.target.value)}
                  placeholder="Dear {{customer_name}},&#10;&#10;This is a reminder about invoice {{invoice_number}}..."
                  rows={8}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Available variables: {'{{customer_name}}, {{customer_email}}, {{invoice_number}}, {{amount}}, {{due_date}}, {{days_overdue}}'}
                </p>
              </div>
              
              {/* From Name */}
              <div className="space-y-2">
                <Label htmlFor="fromName">Sender Name</Label>
                <Input
                  id="fromName"
                  value={node.data.config?.fromName || 'Accounts Team'}
                  onChange={(e) => handleConfigChange('fromName', e.target.value)}
                  placeholder="Accounts Team"
                />
              </div>
            </div>
          )}
          
          <Separator />
          
          {/* Actions */}
          <div className="space-y-2">
            <Label>Actions</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDuplicate}
                className="flex-1"
              >
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="flex-1 text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
          
          {/* Help link */}
          {definition.helpUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => window.open(definition.helpUrl, '_blank')}
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              View Documentation
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
