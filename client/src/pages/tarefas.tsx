import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, List, LayoutGrid, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
});

type CreateTaskData = z.infer<typeof createTaskSchema>;

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: string;
}

const priorityColors = {
  low: "secondary",
  normal: "default",
  high: "default",
  urgent: "destructive",
} as const;

const statusLabels = {
  pending: "To Do",
  in_progress: "Doing",
  completed: "Done",
  cancelled: "Cancelled",
};

export default function TarefasPage() {
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: tasks, isLoading, error } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const form = useForm<CreateTaskData>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "normal",
      status: "pending",
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: CreateTaskData) => {
      const res = await apiRequest("POST", "/api/tasks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: "Task created",
        description: "Your task has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateTaskData) => {
    createTaskMutation.mutate(data);
  };

  // CRITICAL FIX: Ensure displayTasks is ALWAYS an array
  const displayTasks: Task[] = Array.isArray(tasks) ? tasks : [];
  
  const kanbanColumns = {
    pending: displayTasks.filter((t) => t.status === "pending"),
    in_progress: displayTasks.filter((t) => t.status === "in_progress"),
    completed: displayTasks.filter((t) => t.status === "completed"),
  };

  const renderTaskCard = (task: Task) => (
    <Card key={task.id} className="mb-3 hover-elevate" data-testid={`task-card-${task.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium flex-1 min-w-0">{task.title}</CardTitle>
          <Badge variant={priorityColors[task.priority]} data-testid={`badge-priority-${task.id}`}>
            {task.priority}
          </Badge>
        </div>
      </CardHeader>
      {(task.description || task.assigneeName) && (
        <CardContent className="pt-0">
          {task.description && (
            <p className="text-sm text-muted-foreground mb-2 line-clamp-2" data-testid={`text-description-${task.id}`}>
              {task.description}
            </p>
          )}
          {task.assigneeName && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Assigned to:</span>
              <Badge variant="secondary" data-testid={`badge-assignee-${task.id}`}>
                {task.assigneeName}
              </Badge>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );

  return (
    <div className="h-full overflow-auto">
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-7xl mx-auto">
        {/* Header - Mobile Responsive */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold">Tarefas</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Manage and organize your tasks efficiently
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* View Toggle - Touch-friendly */}
            <div className="flex items-center gap-1 p-1 rounded-md bg-muted">
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="icon"
                className="h-11 w-11"
                onClick={() => setViewMode("list")}
                data-testid="button-view-list"
              >
                <List className="h-5 w-5" />
              </Button>
              <Button
                variant={viewMode === "kanban" ? "default" : "ghost"}
                size="icon"
                className="h-11 w-11"
                onClick={() => setViewMode("kanban")}
                data-testid="button-view-kanban"
              >
                <LayoutGrid className="h-5 w-5" />
              </Button>
            </div>

            {/* Create Task Dialog - Touch-friendly */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="min-h-11" data-testid="button-new-task">
                  <Plus className="mr-2 h-5 w-5" />
                  <span className="hidden sm:inline">Nova Tarefa</span>
                  <span className="sm:hidden">Nova</span>
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-create-task">
                <DialogHeader>
                  <DialogTitle>Create New Task</DialogTitle>
                  <DialogDescription>
                    Add a new task to your workspace. Fill in the details below.
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input placeholder="Task title" {...field} data-testid="input-task-title" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Task description"
                              {...field}
                              data-testid="input-task-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-task-priority">
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-task-status">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="pending">To Do</SelectItem>
                              <SelectItem value="in_progress">Doing</SelectItem>
                              <SelectItem value="completed">Done</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter className="flex-col sm:flex-row gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 w-full sm:w-auto"
                        onClick={() => setIsCreateDialogOpen(false)}
                        data-testid="button-cancel-task"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="min-h-11 w-full sm:w-auto"
                        disabled={createTaskMutation.isPending}
                        data-testid="button-submit-task"
                      >
                        {createTaskMutation.isPending ? "Creating..." : "Create Task"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error loading tasks</h3>
              <p className="text-muted-foreground text-center mb-4">
                {error instanceof Error ? error.message : "An error occurred"}
              </p>
              <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] })} className="min-h-11">
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : displayTasks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 md:py-16">
              <AlertCircle className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mb-4" />
              <h3 className="text-base md:text-lg font-semibold mb-2">No tasks yet</h3>
              <p className="text-sm md:text-base text-muted-foreground text-center mb-4">
                Get started by creating your first task
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)} className="min-h-11" data-testid="button-create-first-task">
                <Plus className="mr-2 h-5 w-5" />
                Create Task
              </Button>
            </CardContent>
          </Card>
        ) : viewMode === "list" ? (
          <div className="space-y-3">
            {displayTasks.map(renderTaskCard)}
          </div>
        ) : (
          <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-3">
            {/* To Do Column */}
            <div>
              <div className="mb-3 md:mb-4">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                  To Do
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {kanbanColumns.pending.length} {kanbanColumns.pending.length === 1 ? "task" : "tasks"}
                </p>
              </div>
              <ScrollArea className="h-[300px] md:h-[calc(100vh-300px)]">
                <div data-testid="kanban-column-pending">
                  {kanbanColumns.pending.map(renderTaskCard)}
                </div>
              </ScrollArea>
            </div>

            {/* Doing Column */}
            <div>
              <div className="mb-3 md:mb-4">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                  Doing
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {kanbanColumns.in_progress.length} {kanbanColumns.in_progress.length === 1 ? "task" : "tasks"}
                </p>
              </div>
              <ScrollArea className="h-[300px] md:h-[calc(100vh-300px)]">
                <div data-testid="kanban-column-in-progress">
                  {kanbanColumns.in_progress.map(renderTaskCard)}
                </div>
              </ScrollArea>
            </div>

            {/* Done Column */}
            <div>
              <div className="mb-3 md:mb-4">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                  Done
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {kanbanColumns.completed.length} {kanbanColumns.completed.length === 1 ? "task" : "tasks"}
                </p>
              </div>
              <ScrollArea className="h-[300px] md:h-[calc(100vh-300px)]">
                <div data-testid="kanban-column-completed">
                  {kanbanColumns.completed.map(renderTaskCard)}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
