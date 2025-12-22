import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  FolderKanban, 
  FileText, 
  DollarSign, 
  Users,
  Calendar,
  AlertCircle, 
  Edit,
  ClipboardList,
  Package,
  Clock,
  UserCheck,
  Receipt,
  TrendingUp,
  Star,
  LayoutDashboard,
  Activity,
  CheckSquare,
  ChevronRight,
  MapPin,
  Phone,
  Mail,
  Building,
  UtensilsCrossed,
  Warehouse,
  CircleDollarSign,
  BarChart3,
  MessageSquare,
  Plus,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { pt } from "date-fns/locale";

const safeNumber = (value: string | number | undefined | null, fallback: number = 0): number => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return isNaN(value) ? fallback : value;
  let str = String(value).replace(/[€$£\s]/g, '');
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');
  if (lastComma > lastDot) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    str = str.replace(/,/g, '');
  } else {
    str = str.replace(',', '.');
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? fallback : parsed;
};

interface Project {
  id: string;
  projectCode: string;
  name: string;
  description?: string;
  status: string;
  progress: number;
  tags?: string[];
  clientId: string;
  clientName?: string;
  ownerId?: string;
  ownerName?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  plannedBudget?: string;
  actualCost?: string;
  priority?: string;
  notes?: string;
  sourceLeadId?: string;
  numberOfPeople?: number;
  pricePerPerson?: string;
  createdAt: string;
  updatedAt: string;
}

interface MenuItem {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  category: string;
  quantity: string;
  unitPrice?: string;
  notes?: string;
}

interface Resource {
  id: string;
  resourceType: string;
  resourceName: string;
  quantity?: string;
  unit?: string;
  costPerUnit?: string;
  totalCost?: string;
  status: string;
}

interface Milestone {
  id: string;
  name: string;
  description?: string;
  dueDate: string;
  status: string;
  completedAt?: string;
}

interface TeamMember {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  role: string;
  hourlyRate?: string;
}

interface Task {
  id: string;
  name: string;
  description?: string;
  status: string;
  priority: string;
  assignedTo?: string;
  assignedToName?: string;
  dueDate?: string;
  completedAt?: string;
}

interface Expense {
  id: string;
  expenseDate: string;
  amount: string;
  currency: string;
  category: string;
  description?: string;
  userName?: string;
  status: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  price?: string;
  itemType: string;
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-blue-500/20 text-blue-600 border-blue-500/30",
  confirmed: "bg-green-500/20 text-green-600 border-green-500/30",
  active: "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
  in_progress: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30",
  completed: "bg-gray-500/20 text-gray-600 border-gray-500/30",
  cancelled: "bg-red-500/20 text-red-600 border-red-500/30",
  on_hold: "bg-orange-500/20 text-orange-600 border-orange-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  confirmed: "Confirmed",
  active: "Active",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  on_hold: "On Hold",
};

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "event-sheet", label: "Event Sheet", icon: ClipboardList },
  { id: "menu", label: "Menu", icon: UtensilsCrossed },
  { id: "materials", label: "Materials", icon: Package },
  { id: "warehouse", label: "Virtual Warehouse", icon: Warehouse },
  { id: "timeline", label: "Timeline", icon: Clock },
  { id: "team", label: "Team", icon: Users },
  { id: "checklist", label: "Checklist", icon: CheckSquare },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "costs", label: "Costs", icon: CircleDollarSign },
  { id: "invoicing", label: "Invoicing", icon: Receipt },
  { id: "pl", label: "P&L", icon: BarChart3 },
  { id: "nps", label: "NPS", icon: Star },
];

const editProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  date: z.string().nullable().optional(),
  numberOfPeople: z.coerce.number().int().positive().nullable().optional(),
  pricePerPerson: z.coerce.number().positive().nullable().optional(),
  plannedBudget: z.coerce.number().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

type EditProjectFormData = z.infer<typeof editProjectSchema>;

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  const [isMenuDialogOpen, setIsMenuDialogOpen] = useState(false);
  const [isMaterialDialogOpen, setIsMaterialDialogOpen] = useState(false);
  const [isMilestoneDialogOpen, setIsMilestoneDialogOpen] = useState(false);
  const [isTeamDialogOpen, setIsTeamDialogOpen] = useState(false);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  
  const [productSearch, setProductSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const { data, isLoading, error } = useQuery<{ project: Project }>({
    queryKey: ['/api/modules/projects', projectId, 'sandbox'],
    queryFn: async () => {
      const response = await fetch(`/api/modules/projects/${projectId}?environment=sandbox`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch project');
      }
      return response.json();
    },
    enabled: !!projectId,
  });

  const project = data?.project;

  const { data: menuItemsData } = useQuery<{ items: MenuItem[] }>({
    queryKey: ['/api/projetos/projects', projectId, 'menu-items'],
    queryFn: async () => {
      const response = await fetch(`/api/projetos/projects/${projectId}/menu-items?env=sandbox`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch menu items');
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: resourcesData } = useQuery<{ resources: Resource[] }>({
    queryKey: ['/api/projetos/projects', projectId, 'resources'],
    queryFn: async () => {
      const response = await fetch(`/api/projetos/projects/${projectId}/resources?env=sandbox`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch resources');
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: milestonesData } = useQuery<{ milestones: Milestone[] }>({
    queryKey: ['/api/projetos/projects', projectId, 'milestones'],
    queryFn: async () => {
      const response = await fetch(`/api/projetos/projects/${projectId}/milestones?env=sandbox`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch milestones');
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: teamData } = useQuery<{ members: TeamMember[] }>({
    queryKey: ['/api/projetos/projects', projectId, 'team'],
    queryFn: async () => {
      const response = await fetch(`/api/projetos/projects/${projectId}/team?env=sandbox`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch team');
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: tasksData } = useQuery<{ tasks: Task[] }>({
    queryKey: ['/api/projetos/projects', projectId, 'tasks'],
    queryFn: async () => {
      const response = await fetch(`/api/projetos/projects/${projectId}/tasks?env=sandbox`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: expensesData } = useQuery<{ expenses: Expense[] }>({
    queryKey: ['/api/projetos/projects', projectId, 'expenses'],
    queryFn: async () => {
      const response = await fetch(`/api/projetos/projects/${projectId}/expenses?env=sandbox`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch expenses');
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: productsData } = useQuery<{ products: Product[] }>({
    queryKey: ['/api/projetos/products/search', productSearch],
    queryFn: async () => {
      const response = await fetch(`/api/projetos/products/search?q=${encodeURIComponent(productSearch)}&env=sandbox`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    },
    enabled: isMenuDialogOpen,
  });

  const { data: usersData } = useQuery<{ users: User[] }>({
    queryKey: ['/api/projetos/users/search', userSearch],
    queryFn: async () => {
      const response = await fetch(`/api/projetos/users/search?q=${encodeURIComponent(userSearch)}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
    enabled: isTeamDialogOpen || isTaskDialogOpen,
  });

  const menuItems = menuItemsData?.items || [];
  const resources = resourcesData?.resources || [];
  const milestones = milestonesData?.milestones || [];
  const teamMembers = teamData?.members || [];
  const tasks = tasksData?.tasks || [];
  const expenses = expensesData?.expenses || [];
  const products = productsData?.products || [];
  const users = usersData?.users || [];

  const form = useForm<EditProjectFormData>({
    resolver: zodResolver(editProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      status: "planning",
      date: "",
      numberOfPeople: null,
      pricePerPerson: null,
      plannedBudget: null,
      notes: "",
    },
  });

  useEffect(() => {
    if (project && isEditModalOpen) {
      form.reset({
        name: project.name || "",
        description: project.description || "",
        status: project.status || "planning",
        date: project.date ? project.date.split('T')[0] : "",
        numberOfPeople: project.numberOfPeople || null,
        pricePerPerson: project.pricePerPerson ? parseFloat(project.pricePerPerson) : null,
        plannedBudget: project.plannedBudget ? parseFloat(project.plannedBudget) : null,
        notes: project.notes || "",
      });
    }
  }, [project, isEditModalOpen, form]);

  const updateProjectMutation = useMutation({
    mutationFn: async (data: EditProjectFormData) => {
      const response = await fetch(`/api/modules/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...data,
          environment: 'sandbox',
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update project');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Project updated successfully" });
      setIsEditModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects', projectId, 'sandbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/list'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error updating project", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const onSubmitEdit = (data: EditProjectFormData) => {
    updateProjectMutation.mutate(data);
  };

  const addMenuItemMutation = useMutation({
    mutationFn: async (data: { productId: string; category?: string; quantity?: number; notes?: string }) => {
      const response = await fetch(`/api/projetos/projects/${projectId}/menu-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...data, environment: 'sandbox' }),
      });
      if (!response.ok) throw new Error('Failed to add menu item');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Menu item added" });
      setIsMenuDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/projetos/projects', projectId, 'menu-items'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMenuItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await fetch(`/api/projetos/projects/${projectId}/menu-items/${itemId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete menu item');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Menu item removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/projetos/projects', projectId, 'menu-items'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addResourceMutation = useMutation({
    mutationFn: async (data: { resourceType: string; resourceName: string; quantity?: number; unit?: string; costPerUnit?: number }) => {
      const response = await fetch(`/api/projetos/projects/${projectId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...data, environment: 'sandbox' }),
      });
      if (!response.ok) throw new Error('Failed to add resource');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Material added" });
      setIsMaterialDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/projetos/projects', projectId, 'resources'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteResourceMutation = useMutation({
    mutationFn: async (resourceId: string) => {
      const response = await fetch(`/api/projetos/projects/${projectId}/resources/${resourceId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete resource');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Material removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/projetos/projects', projectId, 'resources'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addMilestoneMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; dueDate: string }) => {
      const response = await fetch(`/api/projetos/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...data, environment: 'sandbox' }),
      });
      if (!response.ok) throw new Error('Failed to add milestone');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Milestone added" });
      setIsMilestoneDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/projetos/projects', projectId, 'milestones'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: async (milestoneId: string) => {
      const response = await fetch(`/api/projetos/projects/${projectId}/milestones/${milestoneId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete milestone');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Milestone removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/projetos/projects', projectId, 'milestones'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addTeamMemberMutation = useMutation({
    mutationFn: async (data: { userId: string; role: string; hourlyRate?: number }) => {
      const response = await fetch(`/api/projetos/projects/${projectId}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...data, environment: 'sandbox' }),
      });
      if (!response.ok) throw new Error('Failed to add team member');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Team member added" });
      setIsTeamDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/projetos/projects', projectId, 'team'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteTeamMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const response = await fetch(`/api/projetos/projects/${projectId}/team/${memberId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to remove team member');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Team member removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/projetos/projects', projectId, 'team'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; priority?: string; dueDate?: string; assignedTo?: string }) => {
      const response = await fetch(`/api/projetos/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...data, environment: 'sandbox' }),
      });
      if (!response.ok) throw new Error('Failed to add task');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Task added" });
      setIsTaskDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/projetos/projects', projectId, 'tasks'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const response = await fetch(`/api/projetos/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update task');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projetos/projects', projectId, 'tasks'] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await fetch(`/api/projetos/projects/${projectId}/tasks/${taskId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete task');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Task removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/projetos/projects', projectId, 'tasks'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addExpenseMutation = useMutation({
    mutationFn: async (data: { expenseDate: string; amount: number; category: string; description?: string }) => {
      const response = await fetch(`/api/projetos/projects/${projectId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...data, environment: 'sandbox' }),
      });
      if (!response.ok) throw new Error('Failed to add expense');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Cost added" });
      setIsExpenseDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/projetos/projects', projectId, 'expenses'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      const response = await fetch(`/api/projetos/projects/${projectId}/expenses/${expenseId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete expense');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Cost removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/projetos/projects', projectId, 'expenses'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd/MM/yyyy", { locale: pt });
    } catch {
      return "-";
    }
  };

  const formatCurrency = (value?: string) => {
    if (!value) return "-";
    const num = parseFloat(value);
    if (isNaN(num)) return "-";
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
    }).format(num);
  };

  const getStatusBadge = (status: string) => {
    const colorClass = STATUS_COLORS[status] || STATUS_COLORS.planning;
    return (
      <Badge variant="outline" className={`${colorClass} border`}>
        {STATUS_LABELS[status] || status}
      </Badge>
    );
  };

  const getDaysUntilEvent = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      const eventDate = new Date(dateStr);
      const days = differenceInDays(eventDate, new Date());
      if (days < 0) return { days: Math.abs(days), past: true };
      return { days, past: false };
    } catch {
      return null;
    }
  };

  const currentTab = TABS.find(t => t.id === activeTab) || TABS[0];
  const CurrentIcon = currentTab.icon;

  if (error) {
    return (
      <div className="p-6">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate('/projects')}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Projects
        </Button>
        <Alert variant="destructive" data-testid="alert-project-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(error as Error).message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate('/projects')}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Projects
        </Button>
        <Alert data-testid="alert-not-found">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Project not found.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const daysInfo = project.date ? getDaysUntilEvent(project.date) : null;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between p-4 gap-4">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate('/projects')}
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-muted-foreground" />
              <span className="font-mono text-sm text-muted-foreground">{project.projectCode}</span>
            </div>

            <div className="text-lg font-medium">
              {project.name}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {daysInfo && (
              <Badge 
                variant="outline" 
                className={daysInfo.past 
                  ? "bg-gray-100 text-gray-600 border-gray-200" 
                  : "bg-blue-100 text-blue-600 border-blue-200"
                }
              >
                {daysInfo.past 
                  ? `${daysInfo.days} days ago` 
                  : `${daysInfo.days} days left`}
              </Badge>
            )}
            {getStatusBadge(project.status)}
            <Button size="sm" onClick={() => setIsEditModalOpen(true)} data-testid="button-edit-project">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </div>
        </div>

        <div className="px-4 pb-3">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-[280px]" data-testid="select-tab">
              <div className="flex items-center gap-2">
                <CurrentIcon className="h-4 w-4" />
                <SelectValue>{currentTab.label}</SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent>
              {TABS.map((tab) => {
                const TabIcon = tab.icon;
                return (
                  <SelectItem key={tab.id} value={tab.id}>
                    <div className="flex items-center gap-2">
                      <TabIcon className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6">
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <div className="overflow-x-auto">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 min-w-max md:min-w-0">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Building className="h-4 w-4" />
                        Client
                      </div>
                      <p className="font-medium">{project.clientName || "-"}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Calendar className="h-4 w-4" />
                        Event Date
                      </div>
                      <p className="font-medium">{formatDate(project.date)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Users className="h-4 w-4" />
                        People
                      </div>
                      <p className="font-medium">{project.numberOfPeople || "-"}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <DollarSign className="h-4 w-4" />
                        Price/Person
                      </div>
                      <p className="font-medium">{formatCurrency(project.pricePerPerson)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <DollarSign className="h-4 w-4" />
                        Budget
                      </div>
                      <p className="font-medium">{formatCurrency(project.plannedBudget)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <UserCheck className="h-4 w-4" />
                        Owner
                      </div>
                      <p className="font-medium">{project.ownerName || "-"}</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-lg">Project Progress</CardTitle>
                    <CardDescription>Overview of completed tasks and milestones</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Overall Progress</span>
                        <span className="font-medium">{project.progress || 0}%</span>
                      </div>
                      <Progress value={project.progress || 0} className="h-2" />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-blue-500">{menuItems.length}</p>
                        <p className="text-xs text-muted-foreground">Menu Items</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-green-500">{resources.length}</p>
                        <p className="text-xs text-muted-foreground">Materials</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-purple-500">{teamMembers.length}</p>
                        <p className="text-xs text-muted-foreground">Team Members</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-orange-500">{tasks.filter(t => t.status === 'done' || t.status === 'completed').length}/{tasks.length}</p>
                        <p className="text-xs text-muted-foreground">Checklist</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Pending Actions</h4>
                      <div className="space-y-2">
                        {menuItems.length === 0 && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 bg-yellow-500/10 rounded border border-yellow-500/20">
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                            <span>No menu defined yet</span>
                            <Button variant="ghost" size="sm" className="ml-auto h-auto p-0" onClick={() => setActiveTab("menu")}>
                              Add Menu <ChevronRight className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        {teamMembers.length === 0 && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 bg-yellow-500/10 rounded border border-yellow-500/20">
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                            <span>No team members assigned</span>
                            <Button variant="ghost" size="sm" className="ml-auto h-auto p-0" onClick={() => setActiveTab("team")}>
                              Add Team <ChevronRight className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        {menuItems.length > 0 && teamMembers.length > 0 && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 bg-green-500/10 rounded border border-green-500/20">
                            <CheckSquare className="h-4 w-4 text-green-500" />
                            <span>All key items configured!</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Next Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setActiveTab("menu")}>
                      <UtensilsCrossed className="h-4 w-4" />
                      Create Menu
                    </Button>
                    <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setActiveTab("team")}>
                      <Users className="h-4 w-4" />
                      Assign Team
                    </Button>
                    <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setActiveTab("materials")}>
                      <Package className="h-4 w-4" />
                      Add Materials
                    </Button>
                    <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setActiveTab("timeline")}>
                      <Clock className="h-4 w-4" />
                      Set Timeline
                    </Button>
                    <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setActiveTab("checklist")}>
                      <CheckSquare className="h-4 w-4" />
                      Setup Checklist
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Financial Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Planned Budget</p>
                      <p className="text-xl font-bold">{formatCurrency(project.plannedBudget)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Actual Cost</p>
                      <p className="text-xl font-bold">{formatCurrency(project.actualCost) || "€0.00"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Invoiced</p>
                      <p className="text-xl font-bold text-green-500">€0.00</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Margin</p>
                      <p className="text-xl font-bold">-</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "event-sheet" && (
            <Card data-testid="card-event-sheet">
              <CardHeader>
                <CardTitle>Event Sheet</CardTitle>
                <CardDescription>
                  Main project information and event details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Project Code</label>
                    <p className="font-mono">{project.projectCode}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <div>{getStatusBadge(project.status)}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Client</label>
                    <p>{project.clientName || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Owner</label>
                    <p>{project.ownerName || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Event Date</label>
                    <p>{formatDate(project.date)}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Priority</label>
                    <p>{project.priority || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Number of People</label>
                    <p>{project.numberOfPeople || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Price per Person</label>
                    <p>{formatCurrency(project.pricePerPerson)}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Budget</label>
                    <p>{formatCurrency(project.plannedBudget)}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Actual Cost</label>
                    <p>{formatCurrency(project.actualCost)}</p>
                  </div>
                </div>
                {project.description && (
                  <div className="space-y-1 pt-4 border-t">
                    <label className="text-sm font-medium text-muted-foreground">Description</label>
                    <p className="whitespace-pre-wrap">{project.description}</p>
                  </div>
                )}
                {project.notes && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Notes</label>
                    <p className="whitespace-pre-wrap">{project.notes}</p>
                  </div>
                )}
                {project.tags && project.tags.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Tags</label>
                    <div className="flex flex-wrap gap-2">
                      {project.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "menu" && (
            <Card data-testid="card-menu">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Menu</CardTitle>
                  <CardDescription>Event menu and catering details</CardDescription>
                </div>
                <Button size="sm" onClick={() => setIsMenuDialogOpen(true)} data-testid="button-add-menu-item">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </CardHeader>
              <CardContent>
                {menuItems.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <UtensilsCrossed className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">No menu items yet</p>
                    <p className="text-sm">Start adding dishes, beverages, and other items to this event's menu.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {menuItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg hover-elevate">
                        <div className="flex items-center gap-3">
                          <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{item.productName || 'Unknown Product'}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.productCode} • Qty: {item.quantity} {item.unitPrice ? `• ${formatCurrency(item.unitPrice)}` : ''}
                            </p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteMenuItemMutation.mutate(item.id)}
                          disabled={deleteMenuItemMutation.isPending}
                          data-testid={`button-delete-menu-item-${item.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "materials" && (
            <Card data-testid="card-materials">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Materials</CardTitle>
                  <CardDescription>Required materials and supplies</CardDescription>
                </div>
                <Button size="sm" onClick={() => setIsMaterialDialogOpen(true)} data-testid="button-add-material">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Material
                </Button>
              </CardHeader>
              <CardContent>
                {resources.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">No materials listed</p>
                    <p className="text-sm">Add equipment, supplies, and other materials needed for this event.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {resources.map((resource) => (
                      <div key={resource.id} className="flex items-center justify-between p-3 border rounded-lg hover-elevate">
                        <div className="flex items-center gap-3">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{resource.resourceName}</p>
                            <p className="text-sm text-muted-foreground">
                              {resource.resourceType} • {resource.quantity || 1} {resource.unit || 'pcs'}
                              {resource.totalCost ? ` • ${formatCurrency(resource.totalCost)}` : ''}
                            </p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteResourceMutation.mutate(resource.id)}
                          disabled={deleteResourceMutation.isPending}
                          data-testid={`button-delete-resource-${resource.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "warehouse" && (
            <Card data-testid="card-warehouse">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Virtual Warehouse</CardTitle>
                  <CardDescription>Inventory allocated and needed for this project</CardDescription>
                </div>
                <Badge variant={menuItems.length > 0 || resources.length > 0 ? "default" : "secondary"}>
                  {menuItems.length + resources.length} items
                </Badge>
              </CardHeader>
              <CardContent>
                {menuItems.length === 0 && resources.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Warehouse className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">No items reserved</p>
                    <p className="text-sm">Add menu items or materials to see projected inventory needs.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {menuItems.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-3 flex items-center gap-2">
                          <UtensilsCrossed className="h-4 w-4" />
                          Menu Items ({menuItems.length})
                        </h4>
                        <div className="space-y-2">
                          {menuItems.map((item) => (
                            <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                                  <Package className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                  <p className="font-medium">{item.productName || 'Product'}</p>
                                  <p className="text-sm text-muted-foreground">
                                    Qty needed: {safeNumber(item.quantity)} × {safeNumber(project.numberOfPeople)} pax = {safeNumber(item.quantity) * safeNumber(project.numberOfPeople)}
                                  </p>
                                </div>
                              </div>
                              <Badge variant="outline">Reserved</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {resources.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-3 flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Materials & Equipment ({resources.length})
                        </h4>
                        <div className="space-y-2">
                          {resources.map((resource) => (
                            <div key={resource.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-secondary/50 rounded flex items-center justify-center">
                                  <Warehouse className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="font-medium">{resource.resourceName}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {resource.quantity} {resource.unit || 'units'} • {resource.resourceType}
                                  </p>
                                </div>
                              </div>
                              <Badge variant="outline">Allocated</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "timeline" && (
            <Card data-testid="card-timeline">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Timeline</CardTitle>
                  <CardDescription>Event schedule and milestones</CardDescription>
                </div>
                <Button size="sm" onClick={() => setIsMilestoneDialogOpen(true)} data-testid="button-add-milestone">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Milestone
                </Button>
              </CardHeader>
              <CardContent>
                {milestones.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">No timeline set</p>
                    <p className="text-sm">Create a timeline with key milestones and deadlines.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {milestones.map((milestone) => (
                      <div key={milestone.id} className="flex items-center justify-between p-3 border rounded-lg hover-elevate">
                        <div className="flex items-center gap-3">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{milestone.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Due: {formatDate(milestone.dueDate)} • {milestone.status}
                            </p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteMilestoneMutation.mutate(milestone.id)}
                          disabled={deleteMilestoneMutation.isPending}
                          data-testid={`button-delete-milestone-${milestone.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "team" && (
            <Card data-testid="card-team">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Team</CardTitle>
                  <CardDescription>Staff assigned to this project</CardDescription>
                </div>
                <Button size="sm" onClick={() => setIsTeamDialogOpen(true)} data-testid="button-add-team-member">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </CardHeader>
              <CardContent>
                {teamMembers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">No team assigned</p>
                    <p className="text-sm">Assign team members with their roles and responsibilities.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {teamMembers.map((member) => (
                      <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg hover-elevate">
                        <div className="flex items-center gap-3">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{member.userName || 'Unknown User'}</p>
                            <p className="text-sm text-muted-foreground">
                              {member.role} {member.hourlyRate ? `• ${formatCurrency(member.hourlyRate)}/hr` : ''}
                            </p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteTeamMemberMutation.mutate(member.id)}
                          disabled={deleteTeamMemberMutation.isPending}
                          data-testid={`button-delete-team-member-${member.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "checklist" && (
            <Card data-testid="card-checklist">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Checklist</CardTitle>
                  <CardDescription>Tasks and to-do items for this event</CardDescription>
                </div>
                <Button size="sm" onClick={() => setIsTaskDialogOpen(true)} data-testid="button-add-task">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 border rounded-lg opacity-50">
                      <Checkbox disabled />
                      <span className="text-sm">Example: Confirm venue booking</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 border rounded-lg opacity-50">
                      <Checkbox disabled />
                      <span className="text-sm">Example: Send menu for approval</span>
                    </div>
                    <div className="text-center py-6 text-muted-foreground">
                      <p className="text-sm">Add your own checklist items to track progress.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg hover-elevate">
                        <div className="flex items-center gap-3">
                          <Checkbox 
                            checked={task.status === 'done' || task.status === 'completed'}
                            onCheckedChange={(checked) => {
                              updateTaskMutation.mutate({ 
                                taskId: task.id, 
                                status: checked ? 'done' : 'todo' 
                              });
                            }}
                            data-testid={`checkbox-task-${task.id}`}
                          />
                          <div>
                            <p className={`font-medium ${(task.status === 'done' || task.status === 'completed') ? 'line-through text-muted-foreground' : ''}`}>
                              {task.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {task.priority} {task.dueDate ? `• Due: ${formatDate(task.dueDate)}` : ''}
                              {task.assignedToName ? ` • ${task.assignedToName}` : ''}
                            </p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteTaskMutation.mutate(task.id)}
                          disabled={deleteTaskMutation.isPending}
                          data-testid={`button-delete-task-${task.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "activity" && (
            <Card data-testid="card-activity">
              <CardHeader>
                <CardTitle>Activity</CardTitle>
                <CardDescription>Recent activity and history</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-3 p-3 border-l-2 border-blue-500 bg-muted/30 rounded-r">
                    <div className="flex-1">
                      <p className="text-sm">Project created</p>
                      <p className="text-xs text-muted-foreground">{formatDate(project.createdAt)}</p>
                    </div>
                  </div>
                  {project.createdAt !== project.updatedAt && (
                    <div className="flex gap-3 p-3 border-l-2 border-green-500 bg-muted/30 rounded-r">
                      <div className="flex-1">
                        <p className="text-sm">Project updated</p>
                        <p className="text-xs text-muted-foreground">{formatDate(project.updatedAt)}</p>
                      </div>
                    </div>
                  )}
                  <div className="text-center py-6 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Activity log will show updates as they happen.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "costs" && (() => {
            const budget = safeNumber(project.plannedBudget);
            const spent = expenses.reduce((sum, e) => sum + safeNumber(e.amount), 0);
            const remaining = budget - spent;
            
            return (
            <Card data-testid="card-costs">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Costs</CardTitle>
                  <CardDescription>Project cost breakdown</CardDescription>
                </div>
                <Button size="sm" onClick={() => setIsExpenseDialogOpen(true)} data-testid="button-add-expense">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Cost
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">Budget</p>
                      <p className="text-xl font-bold">{formatCurrency(String(budget))}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">Spent</p>
                      <p className="text-xl font-bold">{formatCurrency(String(spent))}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">Remaining</p>
                      <p className={`text-xl font-bold ${remaining >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {budget > 0 ? formatCurrency(String(remaining)) : "-"}
                      </p>
                    </CardContent>
                  </Card>
                </div>
                {expenses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CircleDollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">No costs recorded</p>
                    <p className="text-sm">Track expenses, labor costs, and other project costs here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {expenses.map((expense) => (
                      <div key={expense.id} className="flex items-center justify-between p-3 border rounded-lg hover-elevate">
                        <div className="flex items-center gap-3">
                          <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{expense.category}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(expense.expenseDate)} • {formatCurrency(expense.amount)}
                              {expense.description ? ` • ${expense.description}` : ''}
                            </p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteExpenseMutation.mutate(expense.id)}
                          disabled={deleteExpenseMutation.isPending}
                          data-testid={`button-delete-expense-${expense.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            );
          })()}

          {activeTab === "invoicing" && (() => {
            const numPeople = safeNumber(project.numberOfPeople);
            const pricePerPerson = safeNumber(project.pricePerPerson);
            const totalValue = numPeople * pricePerPerson;
            const invoiced = 0;
            const pending = totalValue - invoiced;
            
            return (
            <Card data-testid="card-invoicing">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Invoicing</CardTitle>
                  <CardDescription>Invoices and billing for this project</CardDescription>
                </div>
                <Button size="sm" data-testid="button-create-invoice">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Invoice
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">Total Value</p>
                      <p className="text-xl font-bold">{formatCurrency(String(totalValue))}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">Invoiced</p>
                      <p className="text-xl font-bold text-green-500">{formatCurrency(String(invoiced))}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">Pending</p>
                      <p className="text-xl font-bold text-amber-500">{formatCurrency(String(pending))}</p>
                    </CardContent>
                  </Card>
                </div>
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No invoices yet</p>
                  <p className="text-sm mb-4">Create and manage invoices for this project.</p>
                  <p className="text-xs">
                    Project value: {numPeople} people × {formatCurrency(String(pricePerPerson))} = {formatCurrency(String(totalValue))}
                  </p>
                </div>
              </CardContent>
            </Card>
            );
          })()}

          {activeTab === "pl" && (() => {
            const numPeople = safeNumber(project.numberOfPeople);
            const pricePerPerson = safeNumber(project.pricePerPerson);
            const revenue = numPeople * pricePerPerson;
            const expensesCost = expenses.reduce((sum, e) => sum + safeNumber(e.amount), 0);
            const materialsCost = resources.reduce((sum, r) => sum + (safeNumber(r.quantity) * safeNumber(r.costPerUnit)), 0);
            const allCosts = expensesCost + materialsCost;
            const grossProfit = revenue - allCosts;
            const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
            
            return (
            <Card data-testid="card-pl">
              <CardHeader>
                <CardTitle>Profit & Loss</CardTitle>
                <CardDescription>Financial analysis for this project</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">Revenue</p>
                      <p className="text-xl font-bold text-green-500">{formatCurrency(String(revenue))}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">Costs</p>
                      <p className="text-xl font-bold text-red-500">{formatCurrency(String(allCosts))}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">Gross Profit</p>
                      <p className={`text-xl font-bold ${grossProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {formatCurrency(String(grossProfit))}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">Margin</p>
                      <p className={`text-xl font-bold ${margin >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {margin.toFixed(1)}%
                      </p>
                    </CardContent>
                  </Card>
                </div>
                
                <div className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-3">Cost Breakdown</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Direct Expenses ({expenses.length} items)</span>
                        <span>{formatCurrency(String(expensesCost))}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Materials ({resources.length} items)</span>
                        <span>{formatCurrency(String(materialsCost))}</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-medium">
                        <span>Total Costs</span>
                        <span>{formatCurrency(String(allCosts))}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-3">Revenue Calculation</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Number of People</span>
                        <span>{numPeople}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Price per Person</span>
                        <span>{formatCurrency(String(pricePerPerson))}</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-medium">
                        <span>Total Revenue</span>
                        <span className="text-green-500">{formatCurrency(String(revenue))}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })()}

          {activeTab === "nps" && (
            <Card data-testid="card-nps">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>NPS - Customer Satisfaction</CardTitle>
                  <CardDescription>Net Promoter Score and feedback collection</CardDescription>
                </div>
                <Button size="sm" variant="outline" data-testid="button-send-survey">
                  <Mail className="h-4 w-4 mr-2" />
                  Send Survey
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">NPS Score</p>
                      <p className="text-2xl font-bold text-muted-foreground">--</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">Responses</p>
                      <p className="text-2xl font-bold">0</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">Response Rate</p>
                      <p className="text-2xl font-bold text-muted-foreground">0%</p>
                    </CardContent>
                  </Card>
                </div>
                
                <div className="border rounded-lg p-4 mb-6">
                  <h4 className="font-medium mb-4">NPS Scale</h4>
                  <div className="flex justify-between text-xs text-muted-foreground mb-2">
                    <span>Detractors (0-6)</span>
                    <span>Passives (7-8)</span>
                    <span>Promoters (9-10)</span>
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden">
                    <div className="bg-red-500 flex-1" />
                    <div className="bg-amber-500 flex-1" />
                    <div className="bg-green-500 flex-1" />
                  </div>
                </div>
                
                <div className="text-center py-8 text-muted-foreground">
                  <Star className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No feedback collected yet</p>
                  <p className="text-sm mb-4">Send an NPS survey to collect customer feedback after the event.</p>
                  {project.status === 'completed' ? (
                    <Button variant="default" size="sm" data-testid="button-send-nps">
                      <Mail className="h-4 w-4 mr-2" />
                      Send NPS Survey Now
                    </Button>
                  ) : (
                    <p className="text-xs text-amber-500">
                      NPS survey can be sent after the project is completed
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>
              Update the project details below. Click save when done.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitEdit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-name" />
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
                        {...field} 
                        value={field.value || ""} 
                        data-testid="input-edit-description" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value || "planning"} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Date</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                          value={field.value || ""} 
                          data-testid="input-edit-date" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="numberOfPeople"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>People</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          value={field.value ?? ""} 
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                          data-testid="input-edit-people" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pricePerPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price/Person</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          {...field} 
                          value={field.value ?? ""} 
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                          data-testid="input-edit-price-person" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="plannedBudget"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Budget</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          {...field} 
                          value={field.value ?? ""} 
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                          data-testid="input-edit-budget" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        value={field.value || ""} 
                        data-testid="input-edit-notes" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditModalOpen(false)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateProjectMutation.isPending}
                  data-testid="button-save-edit"
                >
                  {updateProjectMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isMenuDialogOpen} onOpenChange={setIsMenuDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Menu Item</DialogTitle>
            <DialogDescription>
              Search and select a product from your catalog.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Search Products</Label>
              <Input 
                placeholder="Type to search..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                data-testid="input-search-product"
              />
            </div>
            <ScrollArea className="h-[200px] border rounded-md">
              <div className="p-2 space-y-1">
                {products.map((product) => (
                  <div 
                    key={product.id}
                    className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer"
                    onClick={() => {
                      addMenuItemMutation.mutate({ productId: product.id, quantity: 1 });
                    }}
                    data-testid={`option-product-${product.id}`}
                  >
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">{product.code} • {product.itemType}</p>
                    </div>
                    <Plus className="h-4 w-4" />
                  </div>
                ))}
                {products.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {productSearch ? 'No products found' : 'Type to search products'}
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMenuDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMaterialDialogOpen} onOpenChange={setIsMaterialDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Material</DialogTitle>
            <DialogDescription>
              Add equipment, supplies, or other materials needed for this event.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            addResourceMutation.mutate({
              resourceType: formData.get('resourceType') as string,
              resourceName: formData.get('resourceName') as string,
              quantity: parseFloat(formData.get('quantity') as string) || 1,
              unit: formData.get('unit') as string,
              costPerUnit: parseFloat(formData.get('costPerUnit') as string) || 0,
            });
          }} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="resourceType">Type</Label>
                <Select name="resourceType" defaultValue="equipment">
                  <SelectTrigger id="resourceType" data-testid="select-resource-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="supplies">Supplies</SelectItem>
                    <SelectItem value="rental">Rental</SelectItem>
                    <SelectItem value="decoration">Decoration</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="resourceName">Name</Label>
                <Input name="resourceName" required data-testid="input-resource-name" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input name="quantity" type="number" step="0.01" defaultValue="1" data-testid="input-resource-qty" />
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Input name="unit" placeholder="pcs, kg, m" data-testid="input-resource-unit" />
              </div>
              <div>
                <Label htmlFor="costPerUnit">Cost/Unit</Label>
                <Input name="costPerUnit" type="number" step="0.01" data-testid="input-resource-cost" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsMaterialDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addResourceMutation.isPending}>
                {addResourceMutation.isPending ? "Adding..." : "Add Material"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isMilestoneDialogOpen} onOpenChange={setIsMilestoneDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Milestone</DialogTitle>
            <DialogDescription>
              Create a timeline milestone or deadline for this project.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            addMilestoneMutation.mutate({
              name: formData.get('name') as string,
              description: formData.get('description') as string,
              dueDate: formData.get('dueDate') as string,
            });
          }} className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Milestone Name</Label>
              <Input name="name" required data-testid="input-milestone-name" />
            </div>
            <div>
              <Label htmlFor="dueDate">Due Date</Label>
              <Input name="dueDate" type="date" required data-testid="input-milestone-date" />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea name="description" data-testid="input-milestone-description" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsMilestoneDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addMilestoneMutation.isPending}>
                {addMilestoneMutation.isPending ? "Adding..." : "Add Milestone"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isTeamDialogOpen} onOpenChange={setIsTeamDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Assign a team member to this project with their role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Search Users</Label>
              <Input 
                placeholder="Type to search..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                data-testid="input-search-user"
              />
            </div>
            <ScrollArea className="h-[200px] border rounded-md">
              <div className="p-2 space-y-1">
                {users.map((user) => (
                  <div 
                    key={user.id}
                    className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer"
                    onClick={() => {
                      addTeamMemberMutation.mutate({ userId: user.id, role: 'Team Member' });
                    }}
                    data-testid={`option-user-${user.id}`}
                  >
                    <div>
                      <p className="font-medium">{user.firstName} {user.lastName}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <Plus className="h-4 w-4" />
                  </div>
                ))}
                {users.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {userSearch ? 'No users found' : 'Type to search users'}
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTeamDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
            <DialogDescription>
              Add a new task to the project checklist.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            addTaskMutation.mutate({
              name: formData.get('name') as string,
              description: formData.get('description') as string,
              priority: formData.get('priority') as string,
              dueDate: formData.get('dueDate') as string || undefined,
            });
          }} className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Task Name</Label>
              <Input name="name" required data-testid="input-task-name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select name="priority" defaultValue="medium">
                  <SelectTrigger id="priority" data-testid="select-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dueDate">Due Date (optional)</Label>
                <Input name="dueDate" type="date" data-testid="input-task-date" />
              </div>
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea name="description" data-testid="input-task-description" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsTaskDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addTaskMutation.isPending}>
                {addTaskMutation.isPending ? "Adding..." : "Add Task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Cost</DialogTitle>
            <DialogDescription>
              Record an expense or cost for this project.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            addExpenseMutation.mutate({
              expenseDate: formData.get('expenseDate') as string,
              amount: parseFloat(formData.get('amount') as string),
              category: formData.get('category') as string,
              description: formData.get('description') as string,
            });
          }} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="expenseDate">Date</Label>
                <Input name="expenseDate" type="date" required defaultValue={new Date().toISOString().split('T')[0]} data-testid="input-expense-date" />
              </div>
              <div>
                <Label htmlFor="amount">Amount (EUR)</Label>
                <Input name="amount" type="number" step="0.01" required data-testid="input-expense-amount" />
              </div>
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select name="category" defaultValue="materials">
                <SelectTrigger id="category" data-testid="select-expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="materials">Materials</SelectItem>
                  <SelectItem value="labor">Labor</SelectItem>
                  <SelectItem value="transport">Transport</SelectItem>
                  <SelectItem value="rental">Rental</SelectItem>
                  <SelectItem value="services">Services</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea name="description" data-testid="input-expense-description" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsExpenseDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addExpenseMutation.isPending}>
                {addExpenseMutation.isPending ? "Adding..." : "Add Cost"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
