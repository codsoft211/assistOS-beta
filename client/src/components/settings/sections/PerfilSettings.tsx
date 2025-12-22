import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Settings } from 'lucide-react';
import { useLocation } from 'wouter';

import { SectionHeader } from '@/components/settings/common/SectionHeader';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card } from '@/components/ui/card';

const profileSchema = z.object({
  firstName: z.string().min(1, 'Nome é obrigatório'),
  lastName: z.string().min(1, 'Apelido é obrigatório'),
  email: z.string().email(),
  bio: z.string().optional(),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface UserIdentity {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  isActive: boolean;
  isPlatformAdmin: boolean;
  lastLogin: Date | null;
  createdAt: Date;
}

interface UserProfile {
  bio: string | null;
  jobTitle: string | null;
  phone: string | null;
  location: string | null;
}

interface TenantWithRole {
  id: string;
  name: string;
  role: string;
}

interface AuthResponse {
  user: UserIdentity;
  activeTenant: TenantWithRole | null;
}

export function PerfilSettings() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isExtendedModalOpen, setIsExtendedModalOpen] = useState(false);

  const { data: user, isLoading: userLoading } = useQuery<UserIdentity>({
    queryKey: ['/api/users/me'],
  });

  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ['/api/users/me/profile'],
  });

  const { data: authData } = useQuery<AuthResponse>({
    queryKey: ['/api/auth/me'],
  });

  const isLoading = userLoading || profileLoading;

  const canAccessStudio = authData?.activeTenant?.role === 'owner' || authData?.activeTenant?.role === 'configurator';

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      bio: '',
      jobTitle: '',
      phone: '',
      location: '',
    },
  });

  useEffect(() => {
    if (user && profile) {
      form.reset({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        bio: profile.bio || '',
        jobTitle: profile.jobTitle || '',
        phone: profile.phone || '',
        location: profile.location || '',
      });
    }
  }, [user, profile, form]);

  const updateProfile = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const { email, ...updateData } = data;
      return apiRequest('PUT', '/api/users/me/profile', updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/me/profile'] });
      toast({ 
        title: 'Perfil atualizado', 
        description: 'As suas informações foram guardadas com sucesso.' 
      });
      setIsExtendedModalOpen(false);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erro ao atualizar perfil', 
        description: error.message || 'Ocorreu um erro. Tente novamente.',
        variant: 'destructive' 
      });
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    updateProfile.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="perfil-settings-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="perfil-settings">
      <SectionHeader 
        title="Perfil" 
        description="Gerir informações pessoais"
        icon={User}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex items-center gap-4" data-testid="avatar-section">
            <Avatar className="size-20" data-testid="avatar-preview">
              <AvatarFallback>
                {user?.firstName?.[0]?.toUpperCase()}
                {user?.lastName?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium" data-testid="text-avatar-title">Avatar</p>
              <p className="text-xs text-muted-foreground" data-testid="text-avatar-description">
                Upload de imagem disponível em breve
              </p>
            </div>
          </div>

          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    data-testid="input-firstName" 
                    placeholder="João" 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Apelido</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    data-testid="input-lastName" 
                    placeholder="Silva" 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    data-testid="input-email" 
                    disabled 
                    className="bg-muted"
                  />
                </FormControl>
                <FormMessage />
                <p className="text-xs text-muted-foreground" data-testid="text-email-note">
                  O email não pode ser alterado
                </p>
              </FormItem>
            )}
          />

          <div className="flex gap-2">
            <Button 
              type="submit" 
              disabled={updateProfile.isPending}
              data-testid="button-save-profile"
            >
              {updateProfile.isPending ? 'A guardar...' : 'Guardar'}
            </Button>
            <Button 
              type="button"
              variant="outline" 
              onClick={() => setIsExtendedModalOpen(true)}
              data-testid="button-open-extended-modal"
            >
              Editar Perfil Completo
            </Button>
          </div>
        </form>
      </Form>

      {canAccessStudio && (
        <Card className="p-6 space-y-4" data-testid="card-studio-access">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-md bg-primary/10">
              <Settings className="size-5 text-primary" />
            </div>
            <div className="flex-1 space-y-1">
              <h3 className="font-medium" data-testid="text-studio-title">
                Studio de Configuração
              </h3>
              <p className="text-sm text-muted-foreground" data-testid="text-studio-description">
                Aceda ao Studio para configurar módulos, criar entidades personalizadas e definir workflows da plataforma.
              </p>
            </div>
          </div>
          <Button
            variant="default"
            onClick={() => setLocation('/studio')}
            data-testid="button-access-studio"
            className="w-full sm:w-auto"
          >
            <Settings className="size-4 mr-2" />
            Aceder ao Studio
          </Button>
        </Card>
      )}

      <Dialog open={isExtendedModalOpen} onOpenChange={setIsExtendedModalOpen}>
        <DialogContent data-testid="dialog-extended-profile">
          <DialogHeader>
            <DialogTitle>Perfil Completo</DialogTitle>
            <DialogDescription>
              Adicionar informações adicionais ao seu perfil
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Biografia</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        data-testid="input-bio"
                        placeholder="Conte-nos sobre si..."
                        rows={4}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="jobTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        data-testid="input-jobTitle"
                        placeholder="Ex: Gestor de Projetos"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        data-testid="input-phone"
                        placeholder="+351 912 345 678"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Localização</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        data-testid="input-location"
                        placeholder="Lisboa, Portugal"
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
                  onClick={() => setIsExtendedModalOpen(false)}
                  disabled={updateProfile.isPending}
                  data-testid="button-cancel-modal"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit"
                  disabled={updateProfile.isPending}
                  data-testid="button-save-extended"
                >
                  {updateProfile.isPending ? 'A guardar...' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
