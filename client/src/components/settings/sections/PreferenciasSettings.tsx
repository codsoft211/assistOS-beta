import { useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Settings, Sun, Moon, Monitor, Languages, MessageSquare, Bell, FileText } from 'lucide-react';

import { SectionHeader } from '@/components/settings/common/SectionHeader';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useTranslation } from 'react-i18next';

interface UserPreferences {
  theme: "light" | "dark" | "system";
  language: "pt-PT" | "en-US";
  tenantContext?: string;
  aiTone: "formal" | "casual" | "technical" | "friendly" | "executive";
  draftMessageTone: "formal" | "casual" | "technical" | "friendly" | "executive";
  notifications: {
    channels: {
      email: boolean;
      push: boolean;
      sms: boolean;
    };
    events: {
      emailReceived: boolean;
      teamMemberJoined: boolean;
      taskAssigned: boolean;
      systemUpdates: boolean;
    };
  };
}

const preferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  language: z.enum(['pt-PT', 'en-US']),
  tenantContext: z.string().optional(),
  aiTone: z.enum(['formal', 'casual', 'technical', 'friendly', 'executive']),
  draftMessageTone: z.enum(['formal', 'casual', 'technical', 'friendly', 'executive']),
  notifications: z.object({
    channels: z.object({
      email: z.boolean(),
      push: z.boolean(),
      sms: z.boolean(),
    }),
    events: z.object({
      emailReceived: z.boolean(),
      teamMemberJoined: z.boolean(),
      taskAssigned: z.boolean(),
      systemUpdates: z.boolean(),
    }),
  }),
});

type PreferencesFormData = z.infer<typeof preferencesSchema>;

export function PreferenciasSettings() {
  const { toast } = useToast();
  const { i18n } = useTranslation();

  // Fetch current preferences
  const { data: preferences, isLoading } = useQuery<UserPreferences>({
    queryKey: ['/api/users/preferences'],
  });

  const form = useForm<PreferencesFormData>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      theme: 'system',
      language: 'pt-PT',
      tenantContext: '',
      aiTone: 'formal',
      draftMessageTone: 'formal',
      notifications: {
        channels: {
          email: true,
          push: true,
          sms: false,
        },
        events: {
          emailReceived: true,
          teamMemberJoined: true,
          taskAssigned: true,
          systemUpdates: false,
        },
      },
    },
  });

  // Reset form when preferences load
  useEffect(() => {
    if (preferences) {
      form.reset({
        theme: preferences.theme || 'system',
        language: preferences.language || 'pt-PT',
        tenantContext: preferences.tenantContext || '',
        aiTone: preferences.aiTone || 'formal',
        draftMessageTone: preferences.draftMessageTone || 'formal',
        notifications: {
          channels: {
            email: preferences.notifications?.channels?.email ?? true,
            push: preferences.notifications?.channels?.push ?? true,
            sms: preferences.notifications?.channels?.sms ?? false,
          },
          events: {
            emailReceived: preferences.notifications?.events?.emailReceived ?? true,
            teamMemberJoined: preferences.notifications?.events?.teamMemberJoined ?? true,
            taskAssigned: preferences.notifications?.events?.taskAssigned ?? true,
            systemUpdates: preferences.notifications?.events?.systemUpdates ?? false,
          },
        },
      });
    }
  }, [preferences, form]);

  const updatePreferences = useMutation<UserPreferences, Error, PreferencesFormData>({
    mutationFn: async (data: PreferencesFormData) => {
      const res = await apiRequest('PUT', '/api/users/preferences', data);
      return await res.json();
    },
    onSuccess: (updatedPreferences) => {
      // Update cache immediately
      queryClient.setQueryData(['/api/users/preferences'], updatedPreferences);
      queryClient.invalidateQueries({ queryKey: ['/api/users/preferences'] });
      
      // Apply language change if updated
      if (updatedPreferences.language && updatedPreferences.language !== i18n.language) {
        i18n.changeLanguage(updatedPreferences.language);
      }
      
      toast({ 
        title: 'Preferências atualizadas', 
        description: 'As suas preferências foram guardadas com sucesso.' 
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao atualizar preferências', 
        description: error.message || 'Ocorreu um erro. Tente novamente.',
        variant: 'destructive' 
      });
    },
  });

  const onSubmit = (data: PreferencesFormData) => {
    updatePreferences.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="preferencias-settings-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="preferencias-settings">
      <SectionHeader 
        title="Preferências" 
        description="Personalizar a sua experiência no AssistOS"
        icon={Settings}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          {/* SECTION 1: Theme */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Sun className="size-5" />
              Aparência
            </h3>
            
            <FormField
              control={form.control}
              name="theme"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tema</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex gap-4"
                      data-testid="radio-group-theme"
                    >
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <RadioGroupItem value="light" data-testid="radio-theme-light" />
                        </FormControl>
                        <FormLabel className="font-normal flex items-center gap-1 cursor-pointer">
                          <Sun className="size-4" />
                          Claro
                        </FormLabel>
                      </FormItem>
                      
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <RadioGroupItem value="dark" data-testid="radio-theme-dark" />
                        </FormControl>
                        <FormLabel className="font-normal flex items-center gap-1 cursor-pointer">
                          <Moon className="size-4" />
                          Escuro
                        </FormLabel>
                      </FormItem>
                      
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <RadioGroupItem value="system" data-testid="radio-theme-system" />
                        </FormControl>
                        <FormLabel className="font-normal flex items-center gap-1 cursor-pointer">
                          <Monitor className="size-4" />
                          Sistema
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormDescription>
                    Escolher entre tema claro, escuro ou seguir as preferências do sistema
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Separator />

          {/* SECTION 2: Language */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Languages className="size-5" />
              Idioma
            </h3>
            
            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Idioma da Interface</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-language">
                        <SelectValue placeholder="Selecionar idioma" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pt-PT" data-testid="select-language-pt">
                        🇵🇹 Português (Portugal)
                      </SelectItem>
                      <SelectItem value="en-US" data-testid="select-language-en">
                        🇺🇸 English (United States)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Idioma utilizado na interface do AssistOS
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Separator />

          {/* SECTION 3: Tenant Context */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <FileText className="size-5" />
              Contexto Pessoal
            </h3>
            
            <FormField
              control={form.control}
              name="tenantContext"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sobre Você e o Seu Negócio</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Exemplo: Sou comercial desta empresa. Vendo livros e batatas. Estudei economia e fiz uma especialização em vendas..."
                      className="min-h-[120px] resize-none"
                      data-testid="textarea-tenantContext"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Descreva o seu papel, experiência e negócio. O assistente usará este contexto para personalizar as interações.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Separator />

          {/* SECTION 4: AI Tone */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <MessageSquare className="size-5" />
              Assistente AI
            </h3>
            
            <FormField
              control={form.control}
              name="aiTone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tom do Assistente nas Respostas</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-aiTone">
                        <SelectValue placeholder="Selecionar tom" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="formal" data-testid="select-aiTone-formal">
                        Formal
                      </SelectItem>
                      <SelectItem value="casual" data-testid="select-aiTone-casual">
                        Casual
                      </SelectItem>
                      <SelectItem value="technical" data-testid="select-aiTone-technical">
                        Técnico
                      </SelectItem>
                      <SelectItem value="friendly" data-testid="select-aiTone-friendly">
                        Amigável
                      </SelectItem>
                      <SelectItem value="executive" data-testid="select-aiTone-executive">
                        Executivo
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Define como o assistente interage consigo nas conversas
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="draftMessageTone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tom das Mensagens Redigidas para Você</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-draftMessageTone">
                        <SelectValue placeholder="Selecionar tom" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="formal" data-testid="select-draftMessageTone-formal">
                        Formal
                      </SelectItem>
                      <SelectItem value="casual" data-testid="select-draftMessageTone-casual">
                        Casual
                      </SelectItem>
                      <SelectItem value="technical" data-testid="select-draftMessageTone-technical">
                        Técnico
                      </SelectItem>
                      <SelectItem value="friendly" data-testid="select-draftMessageTone-friendly">
                        Amigável
                      </SelectItem>
                      <SelectItem value="executive" data-testid="select-draftMessageTone-executive">
                        Executivo
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Tom usado pelo assistente ao redigir emails e mensagens em seu nome
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Separator />

          {/* SECTION 5: Notifications */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Bell className="size-5" />
              Notificações
            </h3>
            
            {/* 4A. Channels */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">
                Canais de Notificação
              </h4>
              
              <FormField
                control={form.control}
                name="notifications.channels.email"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-6 hover-elevate">
                    <div>
                      <FormLabel>Email</FormLabel>
                      <FormDescription className="text-xs">
                        Receber notificações por email
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-channel-email"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="notifications.channels.push"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-6 hover-elevate">
                    <div>
                      <FormLabel>Push (Navegador)</FormLabel>
                      <FormDescription className="text-xs">
                        Notificações no navegador
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-channel-push"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="notifications.channels.sms"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-6 opacity-50">
                    <div>
                      <FormLabel>SMS</FormLabel>
                      <FormDescription className="text-xs">
                        Em breve - Notificações por SMS
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled
                        data-testid="switch-channel-sms"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            
            {/* 4B. Events */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">
                Tipos de Notificação
              </h4>
              
              <FormField
                control={form.control}
                name="notifications.events.emailReceived"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-6 hover-elevate">
                    <div>
                      <FormLabel>Novos Emails</FormLabel>
                      <FormDescription className="text-xs">
                        Quando receber um novo email
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-event-emailReceived"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="notifications.events.teamMemberJoined"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-6 hover-elevate">
                    <div>
                      <FormLabel>Novo Membro da Equipa</FormLabel>
                      <FormDescription className="text-xs">
                        Quando alguém se junta à equipa
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-event-teamMemberJoined"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="notifications.events.taskAssigned"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-6 hover-elevate">
                    <div>
                      <FormLabel>Tarefas Atribuídas</FormLabel>
                      <FormDescription className="text-xs">
                        Quando uma tarefa lhe é atribuída
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-event-taskAssigned"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="notifications.events.systemUpdates"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-6 hover-elevate">
                    <div>
                      <FormLabel>Atualizações do Sistema</FormLabel>
                      <FormDescription className="text-xs">
                        Novidades e manutenções agendadas
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-event-systemUpdates"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={updatePreferences.isPending}
              data-testid="button-save-preferences"
            >
              {updatePreferences.isPending ? 'A guardar...' : 'Guardar Preferências'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
