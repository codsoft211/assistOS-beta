import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Play,
    Plus,
    Edit,
    Trash2,
    Copy,
    Clock,
    Workflow as WorkflowIcon,
    History,
    Loader2,
    MoreVertical,
    Search,
    ArrowUpDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Workflow {
    id: string;
    name: string;
    description: string;
    status: 'draft' | 'published';
    environment: 'sandbox' | 'production';
    createdAt: string;
    updatedAt: string;
    publishedAt?: string;
    lastExecutedAt?: string;
    executionCount?: number;
}

export default function WorkflowsPanel() {
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [selectedEnvironment, setSelectedEnvironment] = useState<'sandbox' | 'production'>('sandbox');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'lastUpdated' | 'created' | 'name'>('lastUpdated');

    // Fetch workflows
    const { data: workflowsData, isLoading: loadingWorkflows, refetch } = useQuery({
        queryKey: ["/api/assistbuild/workflows", selectedEnvironment],
        queryFn: async () => {
            const response = await apiRequest("GET", `/api/assistbuild/workflows?environment=${selectedEnvironment}`);
            const data = await response.json();
            return data;
        },
    });

    const allWorkflows = workflowsData?.workflows || [];

    // Filter and sort workflows
    const workflows = allWorkflows
        .filter((workflow: Workflow) =>
            workflow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            workflow.description?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a: Workflow, b: Workflow) => {
            switch (sortBy) {
                case 'lastUpdated':
                    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                case 'created':
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                case 'name':
                    return a.name.localeCompare(b.name);
                default:
                    return 0;
            }
        });

    // Delete workflow mutation
    const deleteMutation = useMutation({
        mutationFn: async (workflowId: string) => {
            return await apiRequest("DELETE", `/api/assistbuild/workflows/${workflowId}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/assistbuild/workflows"] });
            toast({
                title: "Success",
                description: "Workflow deleted successfully",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message || "Failed to delete workflow",
                variant: "destructive",
            });
        },
    });

    // Duplicate workflow mutation
    const duplicateMutation = useMutation({
        mutationFn: async (workflowId: string) => {
            const response = await apiRequest("POST", `/api/assistbuild/workflows/${workflowId}/duplicate`);
            return await response.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/assistbuild/workflows"] });
            toast({
                title: "Success",
                description: "Workflow duplicated successfully",
            });
            if (data.id) {
                setLocation(`/workflows/builder/${data.id}`);
            }
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message || "Failed to duplicate workflow",
                variant: "destructive",
            });
        },
    });

    // Execute workflow mutation
    const executeMutation = useMutation({
        mutationFn: async ({ workflowId, triggerData }: { workflowId: string; triggerData?: any }) => {
            const response = await apiRequest("POST", `/api/assistbuild/workflows/${workflowId}/execute`, {
                triggerData: triggerData || {},
                environment: selectedEnvironment,
            });
            return await response.json();
        },
        onSuccess: (data: any) => {
            toast({
                title: "Success",
                description: `Workflow execution started: ${data.execution.id}`,
            });
            queryClient.invalidateQueries({ queryKey: ["/api/assistbuild/workflows"] });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message || "Failed to execute workflow",
                variant: "destructive",
            });
        },
    });

    const getStatusBadge = (status: string) => {
        if (status === 'published') {
            return <Badge variant="default" className="bg-green-700 border border-green-600">Published</Badge>;
        }
        return <Badge variant="secondary" className="bg-orange-700 border border-orange-600">Draft</Badge>;
    };

    const getRelativeTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    return (
        <div className="space-y-6">
            {/* Search and Environment Actions */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search workflows..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                        <SelectTrigger className="w-[180px]">
                            <ArrowUpDown className="h-4 w-4 mr-2" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="lastUpdated">Last updated</SelectItem>
                            <SelectItem value="created">Created date</SelectItem>
                            <SelectItem value="name">Name</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                    <div className="flex items-center gap-1 bg-muted p-1 rounded-lg shrink-0">
                        <Button
                            size="sm"
                            variant={selectedEnvironment === 'sandbox' ? 'default' : 'ghost'}
                            onClick={() => setSelectedEnvironment('sandbox')}
                        >
                            Sandbox
                        </Button>
                        <Button
                            size="sm"
                            variant={selectedEnvironment === 'production' ? 'default' : 'ghost'}
                            onClick={() => setSelectedEnvironment('production')}
                        >
                            Production
                        </Button>
                    </div>
                    <Button size="sm" className="gap-2 shrink-0" onClick={() => setLocation('/workflows/builder/new')}>
                        <Plus className="h-4 w-4" />
                        Create Workflow
                    </Button>
                </div>
            </div>

            {/* Workflows Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {loadingWorkflows ? (
                    <>
                        {[1, 2, 3, 4].map((i) => (
                            <Card key={i}>
                                <CardHeader>
                                    <Skeleton className="h-6 w-1/3" />
                                    <Skeleton className="h-4 w-2/3 mt-2" />
                                </CardHeader>
                            </Card>
                        ))}
                    </>
                ) : workflows && workflows.length > 0 ? (
                    workflows.map((workflow: Workflow) => (
                        <Card
                            key={workflow.id}
                            className="hover:shadow-sm border-l-4 border-l-primary transition-shadow cursor-pointer group"
                            onClick={() => setLocation(`/workflows/builder/${workflow.id}`)}
                        >
                            <CardHeader className="p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <CardTitle className="text-base font-semibold truncate leading-none">
                                                {workflow.name}
                                            </CardTitle>
                                            {getStatusBadge(workflow.status)}
                                        </div>
                                        <CardDescription className="line-clamp-1 text-xs">
                                            {workflow.description || "No description provided"}
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() => duplicateMutation.mutate(workflow.id)}
                                                    disabled={duplicateMutation.isPending}
                                                >
                                                    {duplicateMutation.isPending && duplicateMutation.variables === workflow.id ? (
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    ) : (
                                                        <Copy className="h-4 w-4 mr-2" />
                                                    )}
                                                    Duplicate
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => executeMutation.mutate({ workflowId: workflow.id })}
                                                    disabled={workflow.status !== 'published'}
                                                >
                                                    <Play className="h-4 w-4 mr-2" />
                                                    Execute
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => setLocation(`/workflows/${workflow.id}/executions`)}
                                                >
                                                    <History className="h-4 w-4 mr-2" />
                                                    History
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => deleteMutation.mutate(workflow.id)}
                                                    disabled={deleteMutation.isPending}
                                                    className="text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        <span>Updated {getRelativeTime(workflow.updatedAt)}</span>
                                    </div>
                                    {workflow.executionCount !== undefined && (
                                        <div className="flex items-center gap-1">
                                            <Play className="h-3 w-3" />
                                            <span>{workflow.executionCount} runs</span>
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                        </Card>
                    ))
                ) : (
                    <Card className="col-span-full">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <WorkflowIcon className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                            <h3 className="text-lg font-semibold mb-1">No workflows yet</h3>
                            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                                Create your first workflow to automate business processes.
                            </p>
                            <Button size="sm" className="gap-2" onClick={() => setLocation('/workflows/builder/new')}>
                                <Plus className="h-4 w-4" />
                                Create Your First Workflow
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
