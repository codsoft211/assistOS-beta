
import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Building2, Briefcase, MapPin, Phone, Plus, FileText, Upload, X, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const companySchema = z.object({
  // Informação Básica
  nome: z.string().min(1, "Nome da empresa é obrigatório"),
  marca: z.string().optional(),
  nif: z.string().optional(),
  
  // Contexto de Negócio
  setor: z.string().optional(),
  tipoNegocio: z.string().optional(),
  descricaoAtividade: z.string().optional(),
  
  // Morada
  morada: z.string().optional(),
  cidade: z.string().optional(),
  codigoPostal: z.string().optional(),
  pais: z.string().optional(),
  
  // Contactos
  telefone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  website: z.string().url("URL inválido").optional().or(z.literal("")),
});

type CompanyFormData = z.infer<typeof companySchema>;

interface CustomField {
  id: string;
  label: string;
  value: string;
}

interface BrandFile {
  id: string;
  file: File;
  description: string;
}

export function CompanyConfiguration() {
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [brandFiles, setBrandFiles] = useState<BrandFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const form = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      nome: "",
      marca: "",
      nif: "",
      setor: "",
      tipoNegocio: "",
      descricaoAtividade: "",
      morada: "",
      cidade: "",
      codigoPostal: "",
      pais: "",
      telefone: "",
      email: "",
      website: "",
    },
  });

  const onSubmit = (data: CompanyFormData) => {
    console.log("Company data:", data);
    console.log("Custom fields:", customFields);
    console.log("Brand files:", brandFiles);
    
    toast({
      title: "Configuração Guardada",
      description: "As informações da empresa foram guardadas com sucesso.",
    });
  };

  const addCustomField = () => {
    setCustomFields([
      ...customFields,
      { id: crypto.randomUUID(), label: "", value: "" },
    ]);
  };

  const removeCustomField = (id: string) => {
    setCustomFields(customFields.filter((field) => field.id !== id));
  };

  const updateCustomField = (id: string, key: "label" | "value", value: string) => {
    setCustomFields(
      customFields.map((field) =>
        field.id === id ? { ...field, [key]: value } : field
      )
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      // Validate file size (max 20MB)
      if (file.size > 20 * 1024 * 1024) {
        toast({
          title: "Ficheiro muito grande",
          description: `${file.name} excede o limite de 20MB`,
          variant: "destructive",
        });
        return;
      }

      // Validate file type
      const validTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ];

      if (!validTypes.includes(file.type)) {
        toast({
          title: "Tipo de ficheiro inválido",
          description: `${file.name} não é um tipo de ficheiro aceite`,
          variant: "destructive",
        });
        return;
      }

      setBrandFiles([
        ...brandFiles,
        { id: crypto.randomUUID(), file, description: "" },
      ]);
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeBrandFile = (id: string) => {
    setBrandFiles(brandFiles.filter((f) => f.id !== id));
  };

  const updateFileDescription = (id: string, description: string) => {
    setBrandFiles(
      brandFiles.map((f) => (f.id === id ? { ...f, description } : f))
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Informação Básica */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Informação Básica
            </CardTitle>
            <CardDescription>Informações fundamentais da empresa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Empresa *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Nome legal da empresa" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="marca"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marca</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Nome comercial ou marca" />
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
                    <Input {...field} placeholder="Número de Identificação Fiscal" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Contexto de Negócio */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Contexto de Negócio
            </CardTitle>
            <CardDescription>Informações sobre o setor e atividade</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="setor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Setor/Indústria</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o setor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="tecnologia">Tecnologia</SelectItem>
                      <SelectItem value="comercio">Comércio</SelectItem>
                      <SelectItem value="servicos">Serviços</SelectItem>
                      <SelectItem value="industria">Indústria</SelectItem>
                      <SelectItem value="saude">Saúde</SelectItem>
                      <SelectItem value="educacao">Educação</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipoNegocio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Negócio</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="b2b">B2B (Business to Business)</SelectItem>
                      <SelectItem value="b2c">B2C (Business to Consumer)</SelectItem>
                      <SelectItem value="b2b2c">B2B2C (Híbrido)</SelectItem>
                      <SelectItem value="saas">SaaS</SelectItem>
                      <SelectItem value="ecommerce">E-commerce</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descricaoAtividade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição da Atividade</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Descreva brevemente a atividade principal da empresa"
                      rows={4}
                    />
                  </FormControl>
                  <FormDescription>
                    Breve descrição do que a empresa faz e seus principais produtos/serviços
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Morada */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Morada
            </CardTitle>
            <CardDescription>Localização física da empresa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="morada"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Morada</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Rua, Número, Andar" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Cidade" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="codigoPostal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código Postal</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="0000-000" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="pais"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>País</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Portugal" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Contactos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Contactos
            </CardTitle>
            <CardDescription>Informações de contacto da empresa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="telefone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="+351 000 000 000" />
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
                    <Input {...field} type="email" placeholder="contacto@empresa.pt" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input {...field} type="url" placeholder="https://www.empresa.pt" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Informações Adicionais */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Informações Adicionais
            </CardTitle>
            <CardDescription>Campos personalizados para informações específicas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {customFields.map((field) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  placeholder="Nome do campo"
                  value={field.label}
                  onChange={(e) => updateCustomField(field.id, "label", e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Valor"
                  value={field.value}
                  onChange={(e) => updateCustomField(field.id, "value", e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCustomField(field.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button type="button" variant="outline" onClick={addCustomField} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Campo Personalizado
            </Button>
          </CardContent>
        </Card>

        {/* Ficheiros da Marca */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Ficheiros da Marca
            </CardTitle>
            <CardDescription>
              Carregue documentos da marca (PDF, Word, TXT, Imagens - Máx 20MB por ficheiro)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                Arraste ficheiros para aqui ou clique para selecionar
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Selecionar Ficheiros
              </Button>
            </div>

            {brandFiles.length > 0 && (
              <div className="space-y-3">
                {brandFiles.map((brandFile) => (
                  <div key={brandFile.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <span className="text-sm font-medium">{brandFile.file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({(brandFile.file.size / 1024).toFixed(2)} KB)
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeBrandFile(brandFile.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      placeholder="Descrição do ficheiro (opcional)"
                      value={brandFile.description}
                      onChange={(e) => updateFileDescription(brandFile.id, e.target.value)}
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-end">
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            Cancelar
          </Button>
          <Button type="submit">
            Guardar Configuração
          </Button>
        </div>
      </form>
    </Form>
  );
}
