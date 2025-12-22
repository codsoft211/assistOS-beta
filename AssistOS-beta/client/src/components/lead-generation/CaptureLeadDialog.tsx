import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const baseCaptureLeadSchema = z.object({
  // Contacto
  email: z.string().email("Email inválido"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  nif: z.string().optional(),
  // Evento
  eventDate: z.string().optional(),
  eventType: z.string().optional(),
  location: z.string().optional(),
  numPax: z.coerce.number().int().positive().optional().or(z.literal("")),
  // Comercial
  valuePerPax: z.coerce.number().positive().optional().or(z.literal("")),
  budgetTotal: z.coerce.number().positive().optional().or(z.literal("")),
  leadSource: z.string().optional(),
  ownerId: z.string().optional(),
  // Outros
  campaign: z.string().optional(),
  notes: z.string().optional(),
  customFields: z.record(z.any()).optional(),
});

type CaptureLeadForm = z.infer<typeof baseCaptureLeadSchema>;

interface CaptureLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CaptureLeadDialog({ open, onOpenChange }: CaptureLeadDialogProps) {
  const { toast } = useToast();

  const { data: customFieldsData, isLoading: loadingFields } = useQuery({
    queryKey: ['/api/lead-generation/fields'],
  });

  const customFields = customFieldsData?.fields || [];

  const form = useForm<CaptureLeadForm>({
    resolver: zodResolver(baseCaptureLeadSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      company: "",
      nif: "",
      eventDate: "",
      eventType: "",
      location: "",
      numPax: "",
      valuePerPax: "",
      budgetTotal: "",
      leadSource: "manual",
      ownerId: "",
      campaign: "",
      notes: "",
      customFields: {},
    },
  });

  const { data: sourcesData } = useQuery({
    queryKey: ['/api/lead-generation/sources'],
  });

  const { data: teamData } = useQuery({
    queryKey: ['/api/team'],
    queryFn: async () => {
      const response = await fetch('/api/team', { credentials: 'include' });
      if (!response.ok) return { members: [] };
      return response.json();
    },
  });

  const { data: jobSitesData } = useQuery({
    queryKey: ['/api/job-sites'],
    queryFn: async () => {
      const response = await fetch('/api/job-sites', { credentials: 'include' });
      if (!response.ok) return { jobSites: [] };
      return response.json();
    },
  });

  const sources = sourcesData?.sources || [];
  const teamMembers = teamData?.members || [];
  const jobSitesList = jobSitesData?.jobSites || [];

  // State for adding new job site inline
  const [showNewJobSite, setShowNewJobSite] = useState(false);
  const [newJobSiteName, setNewJobSiteName] = useState("");
  const [newJobSiteCity, setNewJobSiteCity] = useState("");

  // Create job site mutation
  const createJobSiteMutation = useMutation({
    mutationFn: async (data: { name: string; city: string }) => {
      const response = await fetch('/api/job-sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: data.name,
          city: data.city,
          siteType: 'venue',
        }),
      });
      if (!response.ok) throw new Error('Erro ao criar job site');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/job-sites'] });
      form.setValue("location", data.jobSite.name);
      setShowNewJobSite(false);
      setNewJobSiteName("");
      setNewJobSiteCity("");
      toast({ title: "Job Site adicionado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao criar job site", variant: "destructive" });
    },
  });

  // Watch numPax and valuePerPax for auto-calculation
  const numPax = form.watch("numPax");
  const valuePerPax = form.watch("valuePerPax");

  // Auto-calculate budgetTotal when numPax or valuePerPax changes
  useEffect(() => {
    const pax = typeof numPax === 'number' ? numPax : 0;
    const value = typeof valuePerPax === 'number' ? valuePerPax : 0;
    if (pax > 0 && value > 0) {
      form.setValue("budgetTotal", pax * value);
    }
  }, [numPax, valuePerPax, form]);

  const captureMutation = useMutation({
    mutationFn: (data: CaptureLeadForm) =>
      apiRequest('POST', '/api/lead-generation/leads', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/funil'] });
      toast({ title: "Lead capturado com sucesso" });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao capturar lead",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CaptureLeadForm) => {
    captureMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-capture-lead">
        <DialogHeader>
          <DialogTitle>Capturar Novo Lead</DialogTitle>
          <DialogDescription>
            Adicione um novo lead ao sistema
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" data-testid="input-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primeiro Nome</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-firstName" />
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
                      <Input {...field} data-testid="input-lastName" />
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
                      <Input {...field} data-testid="input-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Empresa</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-company" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nif"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NIF</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-nif" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Secção: Evento */}
              <div className="md:col-span-2 pt-4 border-t">
                <h3 className="text-sm font-medium text-muted-foreground">Detalhes do Evento</h3>
              </div>

              <FormField
                control={form.control}
                name="eventDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data do Evento</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="input-eventDate" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="eventType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Evento</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-eventType">
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="casamento">Casamento</SelectItem>
                        <SelectItem value="batizado">Batizado</SelectItem>
                        <SelectItem value="evento_corporativo">Evento Corporativo</SelectItem>
                        <SelectItem value="festa_aniversario">Festa de Aniversário</SelectItem>
                        <SelectItem value="almoco_corporativo">Almoço Corporativo</SelectItem>
                        <SelectItem value="jantar">Jantar</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Job Site (Local)</FormLabel>
                    {!showNewJobSite ? (
                      <div className="flex gap-2">
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-location" className="flex-1">
                              <SelectValue placeholder="Selecione o local" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {jobSitesList.length > 0 ? (
                              jobSitesList.map((site: any) => (
                                <SelectItem key={site.id} value={site.name}>
                                  {site.name} {site.city && `(${site.city})`}
                                </SelectItem>
                              ))
                            ) : (
                              <>
                                <SelectItem value="Casa do Cliente">Casa do Cliente</SelectItem>
                                <SelectItem value="A definir">A definir</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setShowNewJobSite(true)}
                          data-testid="button-add-job-site"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2 p-3 border rounded-md bg-muted/30">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Adicionar Novo Job Site</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowNewJobSite(false);
                              setNewJobSiteName("");
                              setNewJobSiteCity("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input
                            placeholder="Nome do local"
                            value={newJobSiteName}
                            onChange={(e) => setNewJobSiteName(e.target.value)}
                            data-testid="input-new-job-site-name"
                          />
                          <Input
                            placeholder="Cidade"
                            value={newJobSiteCity}
                            onChange={(e) => setNewJobSiteCity(e.target.value)}
                            data-testid="input-new-job-site-city"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!newJobSiteName || createJobSiteMutation.isPending}
                          onClick={() => createJobSiteMutation.mutate({ name: newJobSiteName, city: newJobSiteCity })}
                          data-testid="button-save-job-site"
                        >
                          {createJobSiteMutation.isPending ? "A guardar..." : "Guardar Job Site"}
                        </Button>
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numPax"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nº de Pessoas (PAX)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        min="1"
                        placeholder="Ex: 100"
                        data-testid="input-numPax" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Secção: Comercial */}
              <div className="md:col-span-2 pt-4 border-t">
                <h3 className="text-sm font-medium text-muted-foreground">Informação Comercial</h3>
              </div>

              <FormField
                control={form.control}
                name="valuePerPax"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor por Pessoa (€)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        step="0.01"
                        min="0"
                        placeholder="Ex: 45.00"
                        data-testid="input-valuePerPax" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="budgetTotal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget Total (€) <span className="text-xs text-muted-foreground">(auto)</span></FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        step="0.01"
                        min="0"
                        placeholder="Calculado automaticamente"
                        className="bg-muted/50"
                        data-testid="input-budgetTotal" 
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Nº Pax × Valor/Pax = Budget Total
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner (Responsável)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-ownerId">
                          <SelectValue placeholder="Selecione o responsável" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {teamMembers.map((member: any) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.firstName && member.lastName 
                              ? `${member.firstName} ${member.lastName}` 
                              : member.email}
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
                name="leadSource"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fonte</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-leadSource">
                          <SelectValue placeholder="Selecione a fonte" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        {sources.map((source: any) => (
                          <SelectItem key={source.id} value={source.id}>
                            {source.sourceName}
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
                name="campaign"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campanha</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nome da campanha" data-testid="input-campaign" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} data-testid="textarea-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {loadingFields && (
                <div className="md:col-span-2 text-sm text-muted-foreground">
                  A carregar campos personalizados...
                </div>
              )}

              {!loadingFields && customFields.length > 0 && (
                <>
                  <div className="md:col-span-2 pt-4 border-t">
                    <h3 className="text-sm font-medium mb-3">Campos Personalizados</h3>
                  </div>
                  {customFields.map((customField: any) => (
                    <FormField
                      key={customField.id}
                      control={form.control}
                      name={`customFields.${customField.name}` as any}
                      render={({ field }) => (
                        <FormItem className={(customField.type === 'textarea' || customField.type === 'text_multiline') ? 'md:col-span-2' : ''}>
                          <FormLabel>
                            {customField.label}
                            {customField.required && <span className="text-destructive ml-1">*</span>}
                          </FormLabel>
                          <FormControl>
                            {customField.type === 'text' && (
                              <Input
                                {...field}
                                value={field.value || ''}
                                data-testid={`input-custom-${customField.name}`}
                                placeholder={customField.label}
                              />
                            )}
                            {customField.type === 'number' && (
                              <Input
                                {...field}
                                value={field.value || ''}
                                type="number"
                                data-testid={`input-custom-${customField.name}`}
                                placeholder={customField.label}
                              />
                            )}
                            {customField.type === 'date' && (
                              <Input
                                {...field}
                                value={field.value || ''}
                                type="date"
                                data-testid={`input-custom-${customField.name}`}
                              />
                            )}
                            {customField.type === 'select' && customField.options && (
                              <Select onValueChange={field.onChange} value={field.value || ''}>
                                <SelectTrigger data-testid={`select-custom-${customField.name}`}>
                                  <SelectValue placeholder={`Selecione ${customField.label.toLowerCase()}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {(Array.isArray(customField.options) 
                                    ? customField.options 
                                    : []
                                  ).map((option: string) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            {(customField.type === 'textarea' || customField.type === 'text_multiline') && (
                              <Textarea
                                {...field}
                                value={field.value || ''}
                                data-testid={`textarea-custom-${customField.name}`}
                                placeholder={customField.label}
                                rows={3}
                              />
                            )}
                            {customField.type === 'auto_number' && (
                              <div className="relative">
                                <Input
                                  value={customField.config?.pattern || 'AUTO-XXXX'}
                                  disabled
                                  className="bg-muted text-muted-foreground"
                                  data-testid={`input-custom-${customField.name}`}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  Gerado automaticamente ao salvar
                                </p>
                              </div>
                            )}
                            {customField.type === 'currency' && (
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                                  {customField.config?.currencyCode === 'USD' ? '$' : '€'}
                                </span>
                                <Input
                                  {...field}
                                  value={field.value || ''}
                                  type="number"
                                  step="0.01"
                                  className="pl-8"
                                  data-testid={`input-custom-${customField.name}`}
                                  placeholder="0.00"
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    field.onChange(value ? parseFloat(value) : '');
                                  }}
                                />
                              </div>
                            )}
                            {customField.type === 'computed' && (
                              <div className="relative">
                                <Input
                                  value={field.value || 'Calculado automaticamente'}
                                  disabled
                                  className="bg-muted text-muted-foreground"
                                  data-testid={`input-custom-${customField.name}`}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  Fórmula: {customField.config?.formula || 'N/A'}
                                </p>
                              </div>
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={captureMutation.isPending || loadingFields}
                data-testid="button-submit"
              >
                {captureMutation.isPending ? "Guardando..." : "Capturar Lead"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
