import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Users,
  MapPin,
  Plus,
  Search,
  Pencil,
  Trash2,
  Phone,
  Mail,
  Star,
  ChevronRight,
} from "lucide-react";

interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  nif?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  clientType?: string;
  isActive: boolean;
}

interface ClientContact {
  id: string;
  clientId: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  role?: string;
  department?: string;
  jobTitle?: string;
  isPrimary: boolean;
  isActive: boolean;
  notes?: string;
}

interface JobSite {
  id: string;
  name: string;
  code?: string;
  siteType: string;
  address?: string;
  city?: string;
  maxCapacity?: number;
  hasKitchen: boolean;
  hasParking: boolean;
  isActive: boolean;
  isFavorite: boolean;
}

export function MasterDataSettings() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<"clients" | "contacts" | "job-sites">("clients");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [isJobSiteDialogOpen, setIsJobSiteDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null);
  const [editingJobSite, setEditingJobSite] = useState<JobSite | null>(null);

  const { data: clientsData, isLoading: isLoadingClients } = useQuery<{ clients: Client[] }>({
    queryKey: ["/api/crm/clients"],
  });

  const { data: contactsData, isLoading: isLoadingContacts } = useQuery<{ contacts: ClientContact[] }>({
    queryKey: ["/api/clients", selectedClient?.id, "contacts"],
    enabled: !!selectedClient,
  });

  const { data: jobSitesData, isLoading: isLoadingJobSites } = useQuery<{ jobSites: JobSite[] }>({
    queryKey: ["/api/job-sites"],
  });

  const createClientMutation = useMutation({
    mutationFn: async (data: Partial<Client>) => {
      return await apiRequest("POST", "/api/crm/clients", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      setIsClientDialogOpen(false);
      setEditingClient(null);
      toast({ title: "Cliente criado com sucesso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar cliente", description: error.message, variant: "destructive" });
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Client> }) => {
      return await apiRequest("PATCH", `/api/crm/clients/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      setIsClientDialogOpen(false);
      setEditingClient(null);
      toast({ title: "Cliente atualizado com sucesso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar cliente", description: error.message, variant: "destructive" });
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: Partial<ClientContact>) => {
      return await apiRequest("POST", `/api/clients/${selectedClient?.id}/contacts`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", selectedClient?.id, "contacts"] });
      setIsContactDialogOpen(false);
      setEditingContact(null);
      toast({ title: "Contacto criado com sucesso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar contacto", description: error.message, variant: "destructive" });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ClientContact> }) => {
      return await apiRequest("PATCH", `/api/clients/${selectedClient?.id}/contacts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", selectedClient?.id, "contacts"] });
      setIsContactDialogOpen(false);
      setEditingContact(null);
      toast({ title: "Contacto atualizado com sucesso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar contacto", description: error.message, variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/clients/${selectedClient?.id}/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", selectedClient?.id, "contacts"] });
      toast({ title: "Contacto removido com sucesso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao remover contacto", description: error.message, variant: "destructive" });
    },
  });

  const createJobSiteMutation = useMutation({
    mutationFn: async (data: Partial<JobSite>) => {
      return await apiRequest("POST", "/api/job-sites", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-sites"] });
      setIsJobSiteDialogOpen(false);
      setEditingJobSite(null);
      toast({ title: "Local de serviço criado com sucesso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar local de serviço", description: error.message, variant: "destructive" });
    },
  });

  const updateJobSiteMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<JobSite> }) => {
      return await apiRequest("PATCH", `/api/job-sites/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-sites"] });
      setIsJobSiteDialogOpen(false);
      setEditingJobSite(null);
      toast({ title: "Local de serviço atualizado com sucesso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar local de serviço", description: error.message, variant: "destructive" });
    },
  });

  const clients = clientsData?.clients || [];
  const contacts = contactsData?.contacts || [];
  const jobSites = jobSitesData?.jobSites || [];

  const filteredClients = clients.filter((c) =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.nif?.includes(searchTerm)
  );

  const filteredJobSites = jobSites.filter((js) =>
    js.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    js.city?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveClient = (formData: FormData) => {
    const data = {
      name: formData.get("name") as string,
      email: formData.get("email") as string || undefined,
      phone: formData.get("phone") as string || undefined,
      nif: formData.get("nif") as string || undefined,
      address: formData.get("address") as string || undefined,
      city: formData.get("city") as string || undefined,
      postalCode: formData.get("postalCode") as string || undefined,
      country: formData.get("country") as string || "Portugal",
      clientType: formData.get("clientType") as string || "empresa",
    };

    if (editingClient) {
      updateClientMutation.mutate({ id: editingClient.id, data });
    } else {
      createClientMutation.mutate(data);
    }
  };

  const handleSaveContact = (formData: FormData) => {
    const data = {
      firstName: formData.get("firstName") as string || undefined,
      lastName: formData.get("lastName") as string || undefined,
      email: formData.get("email") as string || undefined,
      phone: formData.get("phone") as string || undefined,
      mobile: formData.get("mobile") as string || undefined,
      role: formData.get("role") as string || undefined,
      department: formData.get("department") as string || undefined,
      jobTitle: formData.get("jobTitle") as string || undefined,
      isPrimary: formData.get("isPrimary") === "on",
      notes: formData.get("notes") as string || undefined,
    };

    if (editingContact) {
      updateContactMutation.mutate({ id: editingContact.id, data });
    } else {
      createContactMutation.mutate(data);
    }
  };

  const handleSaveJobSite = (formData: FormData) => {
    const data = {
      name: formData.get("name") as string,
      code: formData.get("code") as string || undefined,
      siteType: formData.get("siteType") as string || "venue",
      address: formData.get("address") as string || undefined,
      city: formData.get("city") as string || undefined,
      postalCode: formData.get("postalCode") as string || undefined,
      maxCapacity: formData.get("maxCapacity") ? parseInt(formData.get("maxCapacity") as string) : undefined,
      hasKitchen: formData.get("hasKitchen") === "on",
      hasParking: formData.get("hasParking") === "on",
      isFavorite: formData.get("isFavorite") === "on",
    };

    if (editingJobSite) {
      updateJobSiteMutation.mutate({ id: editingJobSite.id, data });
    } else {
      createJobSiteMutation.mutate(data);
    }
  };

  const getSiteTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      venue: "Espaço de Eventos",
      client_home: "Casa do Cliente",
      rental: "Espaço Alugado",
      outdoor: "Exterior",
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" data-testid="text-master-data-title">
            Dados Mestres
          </h2>
          <p className="text-muted-foreground">
            Gestão centralizada de entidades partilhadas entre módulos
          </p>
        </div>
      </div>

      <Tabs value={activeSection} onValueChange={(v) => setActiveSection(v as any)}>
        <TabsList data-testid="tabs-master-data">
          <TabsTrigger value="clients" data-testid="tab-clients">
            <Building2 className="h-4 w-4 mr-2" />
            Clientes
          </TabsTrigger>
          <TabsTrigger value="contacts" data-testid="tab-contacts">
            <Users className="h-4 w-4 mr-2" />
            Contactos
          </TabsTrigger>
          <TabsTrigger value="job-sites" data-testid="tab-job-sites">
            <MapPin className="h-4 w-4 mr-2" />
            Locais de Serviço
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="clients" className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar clientes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-clients"
                />
              </div>
              <Dialog open={isClientDialogOpen} onOpenChange={setIsClientDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => setEditingClient(null)}
                    data-testid="button-add-client"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Cliente
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingClient ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
                    <DialogDescription>
                      {editingClient ? "Atualize os dados do cliente." : "Adicione um novo cliente ao sistema."}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); handleSaveClient(new FormData(e.currentTarget)); }}>
                    <div className="space-y-4 py-4">
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="name">Nome / Empresa *</Label>
                          <Input id="name" name="name" defaultValue={editingClient?.name} required data-testid="input-client-name" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="clientType">Tipo</Label>
                            <Select name="clientType" defaultValue={editingClient?.clientType || "empresa"}>
                              <SelectTrigger data-testid="select-client-type">
                                <SelectValue placeholder="Tipo de cliente" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="empresa">Empresa</SelectItem>
                                <SelectItem value="particular">Particular</SelectItem>
                                <SelectItem value="governo">Governo</SelectItem>
                                <SelectItem value="ong">ONG</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="nif">NIF</Label>
                            <Input id="nif" name="nif" defaultValue={editingClient?.nif} data-testid="input-client-nif" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" name="email" type="email" defaultValue={editingClient?.email} data-testid="input-client-email" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="phone">Telefone</Label>
                            <Input id="phone" name="phone" defaultValue={editingClient?.phone} data-testid="input-client-phone" />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="address">Morada</Label>
                          <Input id="address" name="address" defaultValue={editingClient?.address} data-testid="input-client-address" />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="grid gap-2 col-span-2">
                            <Label htmlFor="city">Cidade</Label>
                            <Input id="city" name="city" defaultValue={editingClient?.city} data-testid="input-client-city" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="postalCode">Código Postal</Label>
                            <Input id="postalCode" name="postalCode" defaultValue={editingClient?.postalCode} data-testid="input-client-postal-code" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsClientDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={createClientMutation.isPending || updateClientMutation.isPending} data-testid="button-save-client">
                        {(createClientMutation.isPending || updateClientMutation.isPending) ? "A guardar..." : "Guardar"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                {isLoadingClients ? (
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : filteredClients.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Building2 className="mx-auto h-12 w-12 mb-3 opacity-50" />
                    <p>Nenhum cliente encontrado</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>NIF</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Cidade</TableHead>
                        <TableHead className="w-[100px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClients.map((client) => (
                        <TableRow
                          key={client.id}
                          className="cursor-pointer hover-elevate"
                          onClick={() => {
                            setSelectedClient(client);
                            setActiveSection("contacts");
                          }}
                          data-testid={`row-client-${client.id}`}
                        >
                          <TableCell className="font-medium">{client.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {client.clientType === "empresa" ? "Empresa" : client.clientType === "particular" ? "Particular" : client.clientType || "Empresa"}
                            </Badge>
                          </TableCell>
                          <TableCell>{client.nif || "-"}</TableCell>
                          <TableCell>{client.email || "-"}</TableCell>
                          <TableCell>{client.phone || "-"}</TableCell>
                          <TableCell>{client.city || "-"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingClient(client);
                                  setIsClientDialogOpen(true);
                                }}
                                data-testid={`button-edit-client-${client.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contacts" className="space-y-4">
            {!selectedClient ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Users className="mx-auto h-12 w-12 mb-3 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground mb-4">
                    Selecione um cliente na tab "Clientes" para ver os seus contactos
                  </p>
                  <Button variant="outline" onClick={() => setActiveSection("clients")}>
                    <Building2 className="h-4 w-4 mr-2" />
                    Ver Clientes
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedClient(null)}>
                      ← Voltar
                    </Button>
                    <div>
                      <h3 className="text-lg font-semibold">{selectedClient.name}</h3>
                      <p className="text-sm text-muted-foreground">Contactos desta empresa</p>
                    </div>
                  </div>
                  <Dialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => setEditingContact(null)} data-testid="button-add-contact">
                        <Plus className="h-4 w-4 mr-2" />
                        Novo Contacto
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>{editingContact ? "Editar Contacto" : "Novo Contacto"}</DialogTitle>
                        <DialogDescription>
                          {editingContact ? "Atualize os dados do contacto." : "Adicione um novo contacto para " + selectedClient.name}
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={(e) => { e.preventDefault(); handleSaveContact(new FormData(e.currentTarget)); }}>
                        <div className="space-y-4 py-4">
                          <div className="grid gap-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="grid gap-2">
                                <Label htmlFor="firstName">Nome</Label>
                                <Input id="firstName" name="firstName" defaultValue={editingContact?.firstName} data-testid="input-contact-first-name" />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="lastName">Apelido</Label>
                                <Input id="lastName" name="lastName" defaultValue={editingContact?.lastName} data-testid="input-contact-last-name" />
                              </div>
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="email">Email</Label>
                              <Input id="email" name="email" type="email" defaultValue={editingContact?.email} data-testid="input-contact-email" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="grid gap-2">
                                <Label htmlFor="phone">Telefone</Label>
                                <Input id="phone" name="phone" defaultValue={editingContact?.phone} data-testid="input-contact-phone" />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="mobile">Telemóvel</Label>
                                <Input id="mobile" name="mobile" defaultValue={editingContact?.mobile} data-testid="input-contact-mobile" />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="grid gap-2">
                                <Label htmlFor="role">Cargo</Label>
                                <Input id="role" name="role" defaultValue={editingContact?.role} placeholder="ex: Diretor Comercial" data-testid="input-contact-role" />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="department">Departamento</Label>
                                <Input id="department" name="department" defaultValue={editingContact?.department} placeholder="ex: Compras" data-testid="input-contact-department" />
                              </div>
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="notes">Notas</Label>
                              <Textarea id="notes" name="notes" defaultValue={editingContact?.notes} data-testid="input-contact-notes" />
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch id="isPrimary" name="isPrimary" defaultChecked={editingContact?.isPrimary} />
                              <Label htmlFor="isPrimary">Contacto Principal</Label>
                            </div>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setIsContactDialogOpen(false)}>
                            Cancelar
                          </Button>
                          <Button type="submit" disabled={createContactMutation.isPending || updateContactMutation.isPending} data-testid="button-save-contact">
                            {(createContactMutation.isPending || updateContactMutation.isPending) ? "A guardar..." : "Guardar"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>

                <Card>
                  <CardContent className="p-0">
                    {isLoadingContacts ? (
                      <div className="p-4 space-y-3">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : contacts.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Users className="mx-auto h-12 w-12 mb-3 opacity-50" />
                        <p>Nenhum contacto registado</p>
                        <p className="text-sm mt-1">Adicione contactos para esta empresa</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Cargo</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead>Telemóvel</TableHead>
                            <TableHead className="w-[100px]">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contacts.map((contact) => (
                            <TableRow key={contact.id} data-testid={`row-contact-${contact.id}`}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {contact.fullName || `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || "-"}
                                  {contact.isPrimary && (
                                    <Badge variant="default" className="text-xs">
                                      <Star className="h-3 w-3 mr-1" />
                                      Principal
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{contact.role || contact.jobTitle || "-"}</TableCell>
                              <TableCell>
                                {contact.email ? (
                                  <div className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {contact.email}
                                  </div>
                                ) : "-"}
                              </TableCell>
                              <TableCell>
                                {contact.phone ? (
                                  <div className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {contact.phone}
                                  </div>
                                ) : "-"}
                              </TableCell>
                              <TableCell>{contact.mobile || "-"}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setEditingContact(contact);
                                      setIsContactDialogOpen(true);
                                    }}
                                    data-testid={`button-edit-contact-${contact.id}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteContactMutation.mutate(contact.id)}
                                    disabled={deleteContactMutation.isPending}
                                    data-testid={`button-delete-contact-${contact.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="job-sites" className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar locais..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-job-sites"
                />
              </div>
              <Dialog open={isJobSiteDialogOpen} onOpenChange={setIsJobSiteDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => setEditingJobSite(null)} data-testid="button-add-job-site">
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Local
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingJobSite ? "Editar Local de Serviço" : "Novo Local de Serviço"}</DialogTitle>
                    <DialogDescription>
                      {editingJobSite ? "Atualize os dados do local." : "Adicione um novo local de serviço."}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); handleSaveJobSite(new FormData(e.currentTarget)); }}>
                    <div className="space-y-4 py-4">
                      <div className="grid gap-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="grid gap-2 col-span-2">
                            <Label htmlFor="name">Nome *</Label>
                            <Input id="name" name="name" defaultValue={editingJobSite?.name} required data-testid="input-job-site-name" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="code">Código</Label>
                            <Input id="code" name="code" defaultValue={editingJobSite?.code} placeholder="JS001" data-testid="input-job-site-code" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="siteType">Tipo de Local</Label>
                            <Select name="siteType" defaultValue={editingJobSite?.siteType || "venue"}>
                              <SelectTrigger data-testid="select-job-site-type">
                                <SelectValue placeholder="Tipo" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="venue">Espaço de Eventos</SelectItem>
                                <SelectItem value="client_home">Casa do Cliente</SelectItem>
                                <SelectItem value="rental">Espaço Alugado</SelectItem>
                                <SelectItem value="outdoor">Exterior</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="maxCapacity">Capacidade Máx.</Label>
                            <Input id="maxCapacity" name="maxCapacity" type="number" defaultValue={editingJobSite?.maxCapacity} placeholder="100" data-testid="input-job-site-capacity" />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="address">Morada</Label>
                          <Input id="address" name="address" defaultValue={editingJobSite?.address} data-testid="input-job-site-address" />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="grid gap-2 col-span-2">
                            <Label htmlFor="city">Cidade</Label>
                            <Input id="city" name="city" defaultValue={editingJobSite?.city} data-testid="input-job-site-city" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="postalCode">Código Postal</Label>
                            <Input id="postalCode" name="postalCode" data-testid="input-job-site-postal-code" />
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2">
                            <Switch id="hasKitchen" name="hasKitchen" defaultChecked={editingJobSite?.hasKitchen} />
                            <Label htmlFor="hasKitchen">Tem Cozinha</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch id="hasParking" name="hasParking" defaultChecked={editingJobSite?.hasParking} />
                            <Label htmlFor="hasParking">Tem Estacionamento</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch id="isFavorite" name="isFavorite" defaultChecked={editingJobSite?.isFavorite} />
                            <Label htmlFor="isFavorite">Favorito</Label>
                          </div>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsJobSiteDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={createJobSiteMutation.isPending || updateJobSiteMutation.isPending} data-testid="button-save-job-site">
                        {(createJobSiteMutation.isPending || updateJobSiteMutation.isPending) ? "A guardar..." : "Guardar"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                {isLoadingJobSites ? (
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : filteredJobSites.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <MapPin className="mx-auto h-12 w-12 mb-3 opacity-50" />
                    <p>Nenhum local de serviço encontrado</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Cidade</TableHead>
                        <TableHead>Capacidade</TableHead>
                        <TableHead>Características</TableHead>
                        <TableHead className="w-[80px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredJobSites.map((site) => (
                        <TableRow key={site.id} data-testid={`row-job-site-${site.id}`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {site.isFavorite && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                              {site.name}
                            </div>
                          </TableCell>
                          <TableCell>{site.code || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{getSiteTypeLabel(site.siteType)}</Badge>
                          </TableCell>
                          <TableCell>{site.city || "-"}</TableCell>
                          <TableCell>{site.maxCapacity ? `${site.maxCapacity} pax` : "-"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {site.hasKitchen && <Badge variant="outline" className="text-xs">Cozinha</Badge>}
                              {site.hasParking && <Badge variant="outline" className="text-xs">Parking</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingJobSite(site);
                                setIsJobSiteDialogOpen(true);
                              }}
                              data-testid={`button-edit-job-site-${site.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
