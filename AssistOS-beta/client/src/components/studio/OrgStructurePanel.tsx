/**
 * Organization Structure Panel
 * 
 * Displays hierarchical departments with nested teams in a cascading tree view.
 * Supports CRUD operations for departments and teams.
 * 
 * Logic:
 * - Departments can have parent departments (hierarchy)
 * - Teams MUST belong to a department
 * - Departments cannot be deleted if they have subdepartments or teams
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2,
  Users,
  Plus,
  Edit,
  Trash2,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  UserPlus,
  UserMinus,
  FolderTree,
  User,
  Crown,
} from "lucide-react";

// ==================== TYPES ====================

interface TeamMember {
  userId: string;
  userName: string;
  email: string;
  role: string | null;
  joinedAt: string;
}

interface Team {
  id: string;
  tenantId: string;
  departmentId: string | null;
  departmentName?: string;
  name: string;
  description: string | null;
  teamLeadId: string | null;
  teamLeadName?: string;
  createdAt: string;
  updatedAt: string;
  members: TeamMember[];
}

interface Department {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  parentDepartmentId: string | null;
  managerId: string | null;
  managerName?: string;
  createdAt: string;
  updatedAt: string;
  subdepartments: Department[];
  teams: Team[];
}

interface TenantUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  fullName: string;
  role: string;
}

interface OrgStructureData {
  departments: Department[];
  teams: Team[];
  summary: {
    totalDepartments: number;
    totalTeams: number;
    totalMembers: number;
  };
}

// ==================== STAT CARD ====================

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  loading 
}: { 
  title: string; 
  value: number; 
  icon: React.ElementType; 
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-8" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== TEAM CARD ====================

function TeamCard({ 
  team, 
  users,
  onEdit, 
  onDelete,
  onAddMembers,
  onRemoveMember,
}: { 
  team: Team;
  users: TenantUser[];
  onEdit: () => void;
  onDelete: () => void;
  onAddMembers: () => void;
  onRemoveMember: (userId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border rounded-lg p-3 bg-card hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0.5 hover:bg-muted rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <Users className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-sm">{team.name}</span>
          <Badge variant="secondary" className="text-xs">
            {team.members.length} member{team.members.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Team
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddMembers}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Members
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Team
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {team.description && (
        <p className="text-xs text-muted-foreground mt-1 ml-7">
          {team.description}
        </p>
      )}

      {team.teamLeadName && (
        <div className="flex items-center gap-1 mt-1 ml-7">
          <Crown className="h-3 w-3 text-amber-500" />
          <span className="text-xs text-muted-foreground">Lead: {team.teamLeadName}</span>
        </div>
      )}

      {isExpanded && team.members.length > 0 && (
        <div className="mt-3 ml-7 space-y-1.5">
          {team.members.map((member) => (
            <div 
              key={member.userId} 
              className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <User className="h-3 w-3 text-muted-foreground" />
                <span>{member.userName}</span>
                {member.role && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {member.role}
                  </Badge>
                )}
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                onClick={() => onRemoveMember(member.userId)}
              >
                <UserMinus className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {isExpanded && team.members.length === 0 && (
        <div className="mt-3 ml-7 text-xs text-muted-foreground italic">
          No members yet.{" "}
          <button onClick={onAddMembers} className="text-primary hover:underline">
            Add members
          </button>
        </div>
      )}
    </div>
  );
}

// ==================== DEPARTMENT TREE NODE ====================

function DepartmentNode({
  department,
  allDepartments,
  users,
  level = 0,
  onEditDepartment,
  onDeleteDepartment,
  onAddTeam,
  onEditTeam,
  onDeleteTeam,
  onAddTeamMembers,
  onRemoveTeamMember,
}: {
  department: Department;
  allDepartments: Department[];
  users: TenantUser[];
  level?: number;
  onEditDepartment: (dept: Department) => void;
  onDeleteDepartment: (dept: Department) => void;
  onAddTeam: (deptId: string) => void;
  onEditTeam: (team: Team) => void;
  onDeleteTeam: (team: Team) => void;
  onAddTeamMembers: (team: Team) => void;
  onRemoveTeamMember: (teamId: string, userId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = department.subdepartments.length > 0 || department.teams.length > 0;

  return (
    <div className={`${level > 0 ? 'ml-6 border-l pl-4' : ''}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-start justify-between py-2">
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <button className="p-0.5 hover:bg-muted rounded">
                {hasChildren ? (
                  isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )
                ) : (
                  <div className="w-4" />
                )}
              </button>
            </CollapsibleTrigger>
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <span className="font-semibold">{department.name}</span>
              {department.managerName && (
                <span className="text-xs text-muted-foreground ml-2">
                  (Manager: {department.managerName})
                </span>
              )}
            </div>
            <Badge variant="outline" className="text-xs">
              {department.teams.length} team{department.teams.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditDepartment(department)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Department
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddTeam(department.id)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Team
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onDeleteDepartment(department)} 
                className="text-destructive"
                disabled={department.subdepartments.length > 0 || department.teams.length > 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Department
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {department.description && (
          <p className="text-sm text-muted-foreground ml-8 -mt-1 mb-2">
            {department.description}
          </p>
        )}

        <CollapsibleContent className="space-y-2">
          {/* Teams */}
          {department.teams.length > 0 && (
            <div className="ml-8 space-y-2">
              {department.teams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  users={users}
                  onEdit={() => onEditTeam(team)}
                  onDelete={() => onDeleteTeam(team)}
                  onAddMembers={() => onAddTeamMembers(team)}
                  onRemoveMember={(userId) => onRemoveTeamMember(team.id, userId)}
                />
              ))}
            </div>
          )}

          {/* Subdepartments */}
          {department.subdepartments.map((subdept) => (
            <DepartmentNode
              key={subdept.id}
              department={subdept}
              allDepartments={allDepartments}
              users={users}
              level={level + 1}
              onEditDepartment={onEditDepartment}
              onDeleteDepartment={onDeleteDepartment}
              onAddTeam={onAddTeam}
              onEditTeam={onEditTeam}
              onDeleteTeam={onDeleteTeam}
              onAddTeamMembers={onAddTeamMembers}
              onRemoveTeamMember={onRemoveTeamMember}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================

export default function OrgStructurePanel() {
  const { toast } = useToast();
  
  // Dialog states
  const [departmentDialogOpen, setDepartmentDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Edit targets
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [targetDepartmentId, setTargetDepartmentId] = useState<string | null>(null);
  const [targetTeam, setTargetTeam] = useState<Team | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'department' | 'team'; item: Department | Team } | null>(null);

  // Form states
  const [deptForm, setDeptForm] = useState({
    name: '',
    description: '',
    parentDepartmentId: '',
    managerId: '',
  });
  
  const [teamForm, setTeamForm] = useState({
    name: '',
    description: '',
    departmentId: '',
    teamLeadId: '',
  });

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Fetch org structure
  const { data: orgData, isLoading: loadingOrg } = useQuery<OrgStructureData>({
    queryKey: ['/api/org-structure'],
  });

  // Fetch flat departments list (for parent selection)
  const { data: flatDepartments } = useQuery<any[]>({
    queryKey: ['/api/org-structure/departments'],
  });

  // Fetch users
  const { data: users, isLoading: loadingUsers } = useQuery<TenantUser[]>({
    queryKey: ['/api/org-structure/users'],
  });

  // Create department
  const createDepartmentMutation = useMutation({
    mutationFn: async (data: typeof deptForm) => {
      const res = await apiRequest('POST', '/api/org-structure/departments', {
        name: data.name,
        description: data.description || undefined,
        parentDepartmentId: data.parentDepartmentId || undefined,
        managerId: data.managerId || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/org-structure'] });
      queryClient.invalidateQueries({ queryKey: ['/api/org-structure/departments'] });
      toast({ title: 'Department created successfully' });
      setDepartmentDialogOpen(false);
      resetDeptForm();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create department', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Update department
  const updateDepartmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof deptForm }) => {
      const res = await apiRequest('PATCH', `/api/org-structure/departments/${id}`, {
        name: data.name,
        description: data.description || undefined,
        parentDepartmentId: data.parentDepartmentId || null,
        managerId: data.managerId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/org-structure'] });
      queryClient.invalidateQueries({ queryKey: ['/api/org-structure/departments'] });
      toast({ title: 'Department updated successfully' });
      setDepartmentDialogOpen(false);
      setEditingDepartment(null);
      resetDeptForm();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update department', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Delete department
  const deleteDepartmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/org-structure/departments/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/org-structure'] });
      queryClient.invalidateQueries({ queryKey: ['/api/org-structure/departments'] });
      toast({ title: 'Department deleted successfully' });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to delete department', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Create team
  const createTeamMutation = useMutation({
    mutationFn: async (data: typeof teamForm) => {
      const res = await apiRequest('POST', '/api/org-structure/teams', {
        name: data.name,
        description: data.description || undefined,
        departmentId: data.departmentId,
        teamLeadId: data.teamLeadId || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/org-structure'] });
      toast({ title: 'Team created successfully' });
      setTeamDialogOpen(false);
      resetTeamForm();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create team', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Update team
  const updateTeamMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof teamForm }) => {
      const res = await apiRequest('PATCH', `/api/org-structure/teams/${id}`, {
        name: data.name,
        description: data.description || undefined,
        departmentId: data.departmentId,
        teamLeadId: data.teamLeadId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/org-structure'] });
      toast({ title: 'Team updated successfully' });
      setTeamDialogOpen(false);
      setEditingTeam(null);
      resetTeamForm();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update team', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Delete team
  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/org-structure/teams/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/org-structure'] });
      toast({ title: 'Team deleted successfully' });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to delete team', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Add team members
  const addMembersMutation = useMutation({
    mutationFn: async ({ teamId, userIds }: { teamId: string; userIds: string[] }) => {
      const res = await apiRequest('POST', `/api/org-structure/teams/${teamId}/members`, { userIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/org-structure'] });
      toast({ title: 'Members added successfully' });
      setMembersDialogOpen(false);
      setTargetTeam(null);
      setSelectedUserIds([]);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to add members', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Remove team member
  const removeMemberMutation = useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      const res = await apiRequest('DELETE', `/api/org-structure/teams/${teamId}/members/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/org-structure'] });
      toast({ title: 'Member removed successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to remove member', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Form helpers
  const resetDeptForm = () => {
    setDeptForm({ name: '', description: '', parentDepartmentId: '', managerId: '' });
  };

  const resetTeamForm = () => {
    setTeamForm({ name: '', description: '', departmentId: '', teamLeadId: '' });
  };

  // Handlers
  const handleOpenDepartmentDialog = (dept?: Department) => {
    if (dept) {
      setEditingDepartment(dept);
      setDeptForm({
        name: dept.name,
        description: dept.description || '',
        parentDepartmentId: dept.parentDepartmentId || '',
        managerId: dept.managerId || '',
      });
    } else {
      setEditingDepartment(null);
      resetDeptForm();
    }
    setDepartmentDialogOpen(true);
  };

  const handleOpenTeamDialog = (team?: Team, deptId?: string) => {
    if (team) {
      setEditingTeam(team);
      setTeamForm({
        name: team.name,
        description: team.description || '',
        departmentId: team.departmentId || '',
        teamLeadId: team.teamLeadId || '',
      });
    } else {
      setEditingTeam(null);
      setTeamForm({
        name: '',
        description: '',
        departmentId: deptId || '',
        teamLeadId: '',
      });
    }
    setTeamDialogOpen(true);
  };

  const handleOpenMembersDialog = (team: Team) => {
    setTargetTeam(team);
    setSelectedUserIds([]);
    setMembersDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    
    if (deleteTarget.type === 'department') {
      deleteDepartmentMutation.mutate((deleteTarget.item as Department).id);
    } else {
      deleteTeamMutation.mutate((deleteTarget.item as Team).id);
    }
  };

  const handleSaveDepartment = () => {
    if (editingDepartment) {
      updateDepartmentMutation.mutate({ id: editingDepartment.id, data: deptForm });
    } else {
      createDepartmentMutation.mutate(deptForm);
    }
  };

  const handleSaveTeam = () => {
    if (editingTeam) {
      updateTeamMutation.mutate({ id: editingTeam.id, data: teamForm });
    } else {
      createTeamMutation.mutate(teamForm);
    }
  };

  const handleAddMembers = () => {
    if (!targetTeam || selectedUserIds.length === 0) return;
    addMembersMutation.mutate({ teamId: targetTeam.id, userIds: selectedUserIds });
  };

  // Get available users (not already in team)
  const availableUsers = useMemo(() => {
    if (!users || !targetTeam) return [];
    const existingIds = new Set(targetTeam.members.map(m => m.userId));
    return users.filter(u => !existingIds.has(u.id));
  }, [users, targetTeam]);

  // Loading state
  if (loadingOrg) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Organization Structure
          </CardTitle>
          <CardDescription>
            Loading departments and teams...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderTree className="h-5 w-5" />
                Organization Structure
              </CardTitle>
              <CardDescription>
                Manage your company's departments and teams hierarchy
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDepartmentDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Department
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatCard 
              title="Departments" 
              value={orgData?.summary.totalDepartments || 0} 
              icon={Building2}
              loading={loadingOrg}
            />
            <StatCard 
              title="Teams" 
              value={orgData?.summary.totalTeams || 0} 
              icon={Users}
              loading={loadingOrg}
            />
            <StatCard 
              title="Team Members" 
              value={orgData?.summary.totalMembers || 0} 
              icon={User}
              loading={loadingOrg}
            />
          </div>

          {/* Tree View */}
          {orgData?.departments && orgData.departments.length > 0 ? (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-1">
                {orgData.departments.map((dept) => (
                  <DepartmentNode
                    key={dept.id}
                    department={dept}
                    allDepartments={flatDepartments || []}
                    users={users || []}
                    onEditDepartment={handleOpenDepartmentDialog}
                    onDeleteDepartment={(d) => {
                      setDeleteTarget({ type: 'department', item: d });
                      setDeleteDialogOpen(true);
                    }}
                    onAddTeam={(deptId) => handleOpenTeamDialog(undefined, deptId)}
                    onEditTeam={handleOpenTeamDialog}
                    onDeleteTeam={(t) => {
                      setDeleteTarget({ type: 'team', item: t });
                      setDeleteDialogOpen(true);
                    }}
                    onAddTeamMembers={handleOpenMembersDialog}
                    onRemoveTeamMember={(teamId, userId) => {
                      removeMemberMutation.mutate({ teamId, userId });
                    }}
                  />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No departments yet</p>
              <p className="text-sm mt-1">Create your first department to start organizing your team</p>
              <Button 
                className="mt-4" 
                onClick={() => handleOpenDepartmentDialog()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Department
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Department Dialog */}
      <Dialog open={departmentDialogOpen} onOpenChange={setDepartmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingDepartment ? 'Edit Department' : 'Create Department'}
            </DialogTitle>
            <DialogDescription>
              {editingDepartment 
                ? 'Update department information' 
                : 'Add a new department to your organization'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="dept-name">Name *</Label>
              <Input
                id="dept-name"
                value={deptForm.name}
                onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                placeholder="e.g., Engineering"
              />
            </div>

            <div>
              <Label htmlFor="dept-description">Description</Label>
              <Textarea
                id="dept-description"
                value={deptForm.description}
                onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                placeholder="Brief description of the department"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="dept-parent">Parent Department</Label>
              <Select 
                value={deptForm.parentDepartmentId || "__none__"} 
                onValueChange={(v) => setDeptForm({ ...deptForm, parentDepartmentId: v === "__none__" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None (Top-level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (Top-level)</SelectItem>
                  {flatDepartments
                    ?.filter(d => d.id !== editingDepartment?.id)
                    .map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="dept-manager">Manager</Label>
              <Select 
                value={deptForm.managerId || "__none__"} 
                onValueChange={(v) => setDeptForm({ ...deptForm, managerId: v === "__none__" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No manager</SelectItem>
                  {users?.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDepartmentDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveDepartment}
              disabled={!deptForm.name.trim() || createDepartmentMutation.isPending || updateDepartmentMutation.isPending}
            >
              {createDepartmentMutation.isPending || updateDepartmentMutation.isPending 
                ? 'Saving...' 
                : editingDepartment ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Dialog */}
      <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTeam ? 'Edit Team' : 'Create Team'}
            </DialogTitle>
            <DialogDescription>
              {editingTeam 
                ? 'Update team information' 
                : 'Add a new team to a department'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="team-name">Name *</Label>
              <Input
                id="team-name"
                value={teamForm.name}
                onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                placeholder="e.g., Frontend Team"
              />
            </div>

            <div>
              <Label htmlFor="team-description">Description</Label>
              <Textarea
                id="team-description"
                value={teamForm.description}
                onChange={(e) => setTeamForm({ ...teamForm, description: e.target.value })}
                placeholder="Brief description of the team"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="team-department">Department *</Label>
              <Select 
                value={teamForm.departmentId} 
                onValueChange={(v) => setTeamForm({ ...teamForm, departmentId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {flatDepartments?.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="team-lead">Team Lead</Label>
              <Select 
                value={teamForm.teamLeadId || "__none__"} 
                onValueChange={(v) => setTeamForm({ ...teamForm, teamLeadId: v === "__none__" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select team lead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No lead</SelectItem>
                  {users?.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveTeam}
              disabled={!teamForm.name.trim() || !teamForm.departmentId || createTeamMutation.isPending || updateTeamMutation.isPending}
            >
              {createTeamMutation.isPending || updateTeamMutation.isPending 
                ? 'Saving...' 
                : editingTeam ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Members Dialog */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Members</DialogTitle>
            <DialogDescription>
              Select users to add to {targetTeam?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {availableUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                All users are already members of this team
              </p>
            ) : (
              <ScrollArea className="h-[300px] border rounded-md p-2">
                <div className="space-y-1">
                  {availableUsers.map((user) => (
                    <div 
                      key={user.id}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-muted ${
                        selectedUserIds.includes(user.id) ? 'bg-primary/10' : ''
                      }`}
                      onClick={() => {
                        setSelectedUserIds(prev => 
                          prev.includes(user.id) 
                            ? prev.filter(id => id !== user.id)
                            : [...prev, user.id]
                        );
                      }}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                        selectedUserIds.includes(user.id) 
                          ? 'bg-primary border-primary text-primary-foreground' 
                          : 'border-muted-foreground'
                      }`}>
                        {selectedUserIds.includes(user.id) && (
                          <svg className="h-3 w-3" viewBox="0 0 12 12">
                            <path fill="currentColor" d="M10.3 2.3L4 8.6 1.7 6.3 0.3 7.7l3.7 3.7 8-8z"/>
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{user.fullName}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {user.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddMembers}
              disabled={selectedUserIds.length === 0 || addMembersMutation.isPending}
            >
              {addMembersMutation.isPending 
                ? 'Adding...' 
                : `Add ${selectedUserIds.length} Member${selectedUserIds.length !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.type === 'department' ? 'Department' : 'Team'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'department' ? (
                <>
                  This will permanently delete the department "{(deleteTarget?.item as Department)?.name}".
                  Make sure there are no subdepartments or teams before deleting.
                </>
              ) : (
                <>
                  This will permanently delete the team "{(deleteTarget?.item as Team)?.name}" 
                  and remove all team member associations.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteDepartmentMutation.isPending || deleteTeamMutation.isPending 
                ? 'Deleting...' 
                : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

