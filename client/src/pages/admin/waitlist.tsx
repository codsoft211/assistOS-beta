import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Mail, Calendar, User } from "lucide-react";
import { format } from "date-fns";

type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  googleId: string | null;
  avatar: string | null;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
};

type UsersResponse = {
  users: User[];
  total: number;
};

export default function AdminWaitlistPage() {
  const { data, isLoading, error } = useQuery<UsersResponse>({
    queryKey: ["/api/admin/users"],
  });

  if (error) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Erro ao carregar utilizadores</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : "Erro desconhecido"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      {/* Header Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-total-users">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Registos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-users">
              {isLoading ? <Skeleton className="h-8 w-16" /> : data?.total || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Utilizadores registados na plataforma
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-active-users">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilizadores Ativos</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-users">
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                data?.users.filter((u) => u.isActive).length || 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Com conta ativa
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-google-users">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Login com Google</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-google-users">
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                data?.users.filter((u) => u.googleId).length || 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Registos via Google OAuth
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Registos</CardTitle>
          <CardDescription>
            Todos os utilizadores registados na plataforma, ordenados por data de registo (mais recentes primeiro)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="header-name">Nome</TableHead>
                    <TableHead data-testid="header-email">Email</TableHead>
                    <TableHead data-testid="header-method">Método</TableHead>
                    <TableHead data-testid="header-status">Estado</TableHead>
                    <TableHead data-testid="header-registered">Registado em</TableHead>
                    <TableHead data-testid="header-last-login">Último Login</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.users && data.users.length > 0 ? (
                    data.users.map((user) => (
                      <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                        <TableCell className="font-medium" data-testid={`cell-name-${user.id}`}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatar || undefined} alt={`${user.firstName} ${user.lastName}`} />
                              <AvatarFallback>
                                {user.firstName[0]}
                                {user.lastName[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span>
                              {user.firstName} {user.lastName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell data-testid={`cell-email-${user.id}`}>
                          {user.email}
                        </TableCell>
                        <TableCell data-testid={`cell-method-${user.id}`}>
                          {user.googleId ? (
                            <Badge variant="outline" data-testid={`badge-google-${user.id}`}>
                              Google
                            </Badge>
                          ) : (
                            <Badge variant="secondary" data-testid={`badge-email-${user.id}`}>
                              Email
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell data-testid={`cell-status-${user.id}`}>
                          {user.isActive ? (
                            <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20" data-testid={`badge-active-${user.id}`}>
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="destructive" data-testid={`badge-inactive-${user.id}`}>
                              Inativo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell data-testid={`cell-registered-${user.id}`}>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(user.createdAt), "dd/MM/yyyy HH:mm")}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`cell-last-login-${user.id}`}>
                          {user.lastLogin ? (
                            <div className="text-sm text-muted-foreground">
                              {format(new Date(user.lastLogin), "dd/MM/yyyy HH:mm")}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Nunca</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhum utilizador registado ainda
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
