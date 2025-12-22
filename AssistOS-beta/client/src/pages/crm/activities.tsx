import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Phone, Mail, Calendar, FileText, CheckCircle, Trash2, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";

const activityFormSchema = z.object({
  clientId: z.string().min(1, "Cliente é obrigatório"),
  activityType: z.enum(['call', 'email', 'meeting', 'note', 'task', 'whatsapp']),
  subject: z.string().min(1, "Assunto é obrigatório"),
  description: z.string().optional(),
  outcome: z.string().optional(),
  duration: z.coerce.number().optional(),
  scheduledAt: z.string().optional(),
  completedAt: z.string().optional(),
});

type ActivityFormData = z.infer<typeof activityFormSchema>;

export default function ActivitiesPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ['/api/crm/activities', clientFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (clientFilter) params.append('clientId', clientFilter);
      const response = await fetch(`/api/crm/activities?${params}`);
      if (!response.ok) throw new Error('Failed to fetch activities');
      return response.json();
    }
  });

  const { data: clients } = useQuery({
    queryKey: ['/api/crm/clientes'],
    queryFn: async () => {
      const response = await fetch('/api/crm/clientes');
      if (!response.ok) throw new Error('Failed to fetch clients');
      return response.json();
    }
  });

  const form = useForm<ActivityFormData>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      activityType: 'call',
      subject: '',
      description: '',
      outcome: '',
    }
  });

  const createMutation = useMutation({
    mutationFn: (data: ActivityFormData) => apiRequest('/api/crm/activities', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/activities'] });
      toast({ title: "Atividade criada com sucesso" });
      setOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao criar atividade", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/crm/activities/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/activities'] });
      toast({ title: "Atividade eliminada" });
    },
    onError: () => {
      toast({ title: "Erro ao eliminar atividade", variant: "destructive" });
    }
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'meeting': return <Calendar className="h-4 w-4" />;
      case 'note': return <FileText className="h-4 w-4" />;
      case 'task': return <CheckCircle className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getActivityLabel = (type: string) => {
    const labels: Record<string, string> = {
      call: 'Chamada',
      email: 'Email',
      meeting: 'Reunião',
      note: 'Nota',
      task: 'Tarefa',
      whatsapp: 'WhatsApp'
    };
    return labels[type] || type;
  };

  const onSubmit = (data: ActivityFormData) => {
    createMutation.mutate(data);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Atividades CRM</h1>
          <p className="text-muted-foreground">Timeline completa de interações com clientes</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-activity">
              <Plus className="h-4 w-4 mr-2" />
              Nova Atividade
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Registar Nova Atividade</DialogTitle>
              <DialogDescription>
                Adicione uma chamada, email, reunião ou nota
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-client">
                            <SelectValue placeholder="Selecione um cliente" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients?.clients?.map((client: any) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
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
                  name="activityType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-activity-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="call">Chamada</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="meeting">Reunião</SelectItem>
                          <SelectItem value="note">Nota</SelectItem>
                          <SelectItem value="task">Tarefa</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assunto</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ex: Follow-up proposta comercial" data-testid="input-subject" />
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
                      <FormLabel>Descrição</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Detalhes da atividade..." rows={4} data-testid="textarea-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-4 pt-4">
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-activity">
                    {createMutation.isPending ? "A guardar..." : "Guardar"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel">
                    Cancelar
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timeline de Atividades</CardTitle>
          <CardDescription>
            {data?.total || 0} atividades registadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.activities?.map((activity: any) => (
                  <TableRow key={activity.id} data-testid={`row-activity-${activity.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {getActivityIcon(activity.activityType)}
                        {getActivityLabel(activity.activityType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{activity.subject}</TableCell>
                    <TableCell className="text-muted-foreground">{activity.clientId}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true, locale: pt })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(activity.id)}
                        data-testid={`button-delete-${activity.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {data?.activities?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhuma atividade registada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
