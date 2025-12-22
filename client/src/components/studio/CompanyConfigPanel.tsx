import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Save, Plus, X, Trash2 } from "lucide-react";

const companySchema = z.object({
  // Legal & Contact Info
  legalName: z.string().nullable().transform(val => val ?? ""),
  brandName: z.string().nullable().transform(val => val ?? ""),
  nif: z.string().nullable().transform(val => val ?? ""),
  address: z.string().nullable().transform(val => val ?? ""),
  city: z.string().nullable().transform(val => val ?? ""),
  postalCode: z.string().nullable().transform(val => val ?? ""),
  country: z.string().nullable().transform(val => val ?? ""),
  phone: z.string().nullable().transform(val => val ?? ""),
  email: z.union([z.string().email(), z.literal("")]).nullable().transform(val => val ?? ""),
  website: z.union([z.string().url(), z.literal("")]).nullable().transform(val => val ?? ""),
  
  // Business Context
  sector: z.string().nullable().transform(val => val ?? ""),
  businessType: z.string().nullable().transform(val => val ?? ""),
  businessDescription: z.string().nullable().transform(val => val ?? ""),
  additionalInfo: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })).nullable().transform(val => val ?? []),
  
  // Read-only fields (not edited in form, but included for completeness)
  brandFiles: z.array(z.object({
    url: z.string(),
    bucket: z.string(),
    path: z.string(),
    name: z.string(),
    mimeType: z.string(),
    size: z.number().optional().nullable(),
    uploadedAt: z.string().optional().nullable(),
  })).optional().nullable().transform(val => val ?? []),
  onboardingContext: z.object({
    businessType: z.string().optional().nullable(),
    mainChallenges: z.array(z.string()).optional().nullable(),
    currentProcess: z.string().optional().nullable(),
    goals: z.array(z.string()).optional().nullable(),
    teamSize: z.number().optional().nullable(),
    conversationSummary: z.string().optional().nullable(),
  }).optional().nullable().transform(val => val ?? {}),  
  
  // Branding
  logo: z.string().nullable().transform(val => val ?? ""),
});

type CompanyFormData = z.infer<typeof companySchema>;

const sectorOptions = [
  { value: "technology", label: "Technology" },
  { value: "finance/fintech", label: "Finance / Fintech" },
  { value: "healthcare", label: "Healthcare" },
  { value: "retail/e-commerce", label: "Retail / E-commerce" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "consulting", label: "Consulting" },
  { value: "education", label: "Education" },
  { value: "real-estate", label: "Real Estate" },
  { value: "transportation", label: "Transportation / Logistics" },
  { value: "media/entertainment", label: "Media / Entertainment" },
  { value: "energy/utilities", label: "Energy / Utilities" },
  { value: "nonprofit", label: "Nonprofit" },
  { value: "government", label: "Government" },
];

const businessTypeOptions = [
  { value: "b2b", label: "B2B (Business to Business)" },
  { value: "b2c", label: "B2C (Business to Consumer)" },
  { value: "b2b2c", label: "B2B2C (Hybrid)" },
  { value: "saas", label: "SaaS (Software as a Service)" },
  { value: "marketplace", label: "Marketplace" },
  { value: "consulting", label: "Consulting/Services" },
  { value: "subscription", label: "Subscription" },
  { value: "agency/professional-services", label: "Agency / Professional Services" },
  { value: "mobile-app", label: "Mobile App" },
  { value: "platform", label: "Platform" },
  { value: "other", label: "Other" },
];

export default function CompanyConfigPanel() {
  const [activeTab, setActiveTab] = useState("legal");
  const { toast } = useToast();

  // Fetch company data using React Query (automatically refetches when cache is invalidated)
  const { data: companyData, isLoading, error } = useQuery({
    queryKey: ["/api/company"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/company");
      return res.json();
    },
    staleTime: 0, // Always consider data stale, refetch when invalidated
    refetchOnWindowFocus: true, // Refetch when user returns to window
  });

  const form = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      legalName: "",
      brandName: "",
      nif: "",
      address: "",
      city: "",
      postalCode: "",
      country: "",
      phone: "",
      email: "",
      website: "",
      logo: "",
      sector: "",
      businessType: "",
      businessDescription: "",
      additionalInfo: [],
      brandFiles: [],
      onboardingContext: {},      
    },
  });

  // Reset form when data loads (moved to useEffect to avoid infinite re-render)
  useEffect(() => {
    if (companyData && !form.formState.isDirty) {
      // Convert null values to empty strings to prevent React warnings
      const cleanData = {
        ...companyData,
        legalName: companyData.legalName ?? "",
        brandName: companyData.brandName ?? "",
        nif: companyData.nif ?? "",
        address: companyData.address ?? "",
        city: companyData.city ?? "",
        postalCode: companyData.postalCode ?? "",
        country: companyData.country ?? "",
        phone: companyData.phone ?? "",
        email: companyData.email ?? "",
        website: companyData.website ?? "",
        logo: companyData.logo ?? "",
        sector: companyData.sector ?? "",
        businessType: companyData.businessType ?? "",
        businessDescription: companyData.businessDescription ?? "",
        additionalInfo: companyData.additionalInfo ?? [],
        brandFiles: companyData.brandFiles ?? [],
        onboardingContext: companyData.onboardingContext ?? {},
      };
      form.reset(cleanData);
    }
  }, [companyData, form]);

  // Listen for real-time company updates (e.g., from AssistBuild)
  useEffect(() => {
    const eventSource = new EventSource('/api/realtime/stream', {
      withCredentials: true,
    });

    const handleCompanyUpdated = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[CompanyConfig] Company updated via SSE:', data);
        
        // Invalidate cache to trigger refetch
        queryClient.invalidateQueries({
          queryKey: ["/api/company"],
        });
        
        toast({
          title: "Company updated",
          description: "Company information has been updated",
        });
      } catch (err) {
        console.error('[CompanyConfig] Error parsing SSE event:', err);
      }
    };

    eventSource.addEventListener('company.updated', handleCompanyUpdated);

    eventSource.onerror = (error) => {
      console.error('[CompanyConfig] SSE connection error:', error);
    };

    return () => {
      eventSource.removeEventListener('company.updated', handleCompanyUpdated);
      eventSource.close();
    };
  }, [toast]);

  // Update company mutation
  const updateMutation = useMutation({
    mutationFn: async (data: CompanyFormData) => {
      const res = await apiRequest("PATCH", "/api/company", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company"] });
      toast({
        title: "Company updated",
        description: "Your company information has been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update company",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CompanyFormData) => {
    console.log('[CompanyConfig] ✅ Form submitted with data:', data);
    console.log('[CompanyConfig] Form errors:', form.formState.errors);
    
    // Convert empty strings to undefined for optional fields to pass backend validation
    const cleanData = {
      ...data,
      email: data.email === "" ? undefined : data.email,
      website: data.website === "" ? undefined : data.website,
      logo: data.logo === "" ? undefined : data.logo,
    };
    
    console.log('[CompanyConfig] Sending clean data:', cleanData);
    updateMutation.mutate(cleanData as any);
  };
  
  const onError = (errors: any) => {
    console.log('[CompanyConfig] ❌ Form validation errors:', errors);
    toast({
      title: "Validation errors",
      description: "Please check the form for errors",
      variant: "destructive",
    });
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company
          </CardTitle>
          <CardDescription>Configure company information and brand assets</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-destructive">
            <p className="font-medium" data-testid="text-error-title">Failed to load company data</p>
            <p className="text-sm mt-2" data-testid="text-error-message">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/company"] })}
              data-testid="button-retry-company"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company
          </CardTitle>
          <CardDescription>Configure company information and brand assets</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Company
        </CardTitle>
        <CardDescription>Configure company information and brand assets</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="legal" data-testid="tab-legal">Legal Info</TabsTrigger>
                <TabsTrigger value="business" data-testid="tab-business">Business Context</TabsTrigger>
                <TabsTrigger value="branding" data-testid="tab-branding">Branding</TabsTrigger>
                <TabsTrigger value="additional" data-testid="tab-additional">Additional Info</TabsTrigger>
              </TabsList>

              {/* Tab 1: Legal & Contact Info */}
              <TabsContent value="legal" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="legalName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Legal Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Company Legal Name SA" {...field} data-testid="input-legal-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="brandName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brand Name</FormLabel>
                        <FormControl>
                          <Input placeholder="MyBrand" {...field} data-testid="input-brand-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="nif"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NIF/NIPC</FormLabel>
                      <FormControl>
                        <Input placeholder="500123456" {...field} data-testid="input-nif" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Street address" {...field} data-testid="input-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input placeholder="Porto" {...field} data-testid="input-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="postalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postal Code</FormLabel>
                        <FormControl>
                          <Input placeholder="4000-123" {...field} data-testid="input-postal-code" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <FormControl>
                          <Input placeholder="Portugal" {...field} data-testid="input-country" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="+351 123 456 789" {...field} data-testid="input-phone" />
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
                          <Input type="email" placeholder="contact@company.com" {...field} data-testid="input-email" />
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
                          <Input type="url" placeholder="https://company.com" {...field} data-testid="input-website" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              {/* Tab 2: Business Context */}
              <TabsContent value="business" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="sector"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sector/Industry</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-sector">
                              <SelectValue placeholder="Select sector" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sectorOptions.map((option) => (
                              <SelectItem 
                                key={option.value} 
                                value={option.value}
                                data-testid={`option-sector-${option.value}`}
                              >
                                {option.label}
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
                    name="businessType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-business-type">
                              <SelectValue placeholder="Select business type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {businessTypeOptions.map((option) => (
                              <SelectItem 
                                key={option.value} 
                                value={option.value}
                                data-testid={`option-business-type-${option.value}`}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="businessDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe your business activities, products, services, and target market..."
                          className="min-h-[200px]"
                          {...field}
                          data-testid="input-business-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              {/* Tab 3: Branding */}
              <TabsContent value="branding" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="logo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Logo URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://example.com/logo.png" {...field} data-testid="input-logo" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-sm" data-testid="text-branding-placeholder">File upload and brand files management coming soon...</p>
                  <p className="text-xs mt-2" data-testid="text-branding-details">Will integrate with /api/uploads for file storage</p>
                </div>
              </TabsContent>

              {/* Tab 4: Additional Info */}
              <TabsContent value="additional" className="space-y-4 mt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium">Additional Information</h3>
                      <p className="text-xs text-muted-foreground">Store custom key-value information about your company</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const currentInfo = form.getValues("additionalInfo") || [];
                        form.setValue("additionalInfo", [...currentInfo, { key: "", value: "" }], { shouldDirty: true });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Field
                    </Button>
                  </div>

                  {form.watch("additionalInfo")?.length > 0 ? (
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-1/3">Key</TableHead>
                            <TableHead className="w-1/2">Value</TableHead>
                            <TableHead className="w-16"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {form.watch("additionalInfo")?.map((item: any, index: number) => (
                            <TableRow key={index}>
                              <TableCell>
                                <Input
                                  placeholder="e.g., VAT Number"
                                  value={item?.key || ""}
                                  onChange={(e) => {
                                    const currentInfo = form.getValues("additionalInfo") || [];
                                    currentInfo[index] = { ...currentInfo[index], key: e.target.value };
                                    form.setValue("additionalInfo", currentInfo, { shouldDirty: true });
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  placeholder="e.g., PT123456789"
                                  value={item?.value || ""}
                                  onChange={(e) => {
                                    const currentInfo = form.getValues("additionalInfo") || [];
                                    currentInfo[index] = { ...currentInfo[index], value: e.target.value };
                                    form.setValue("additionalInfo", currentInfo, { shouldDirty: true });
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    const currentInfo = form.getValues("additionalInfo") || [];
                                    form.setValue(
                                      "additionalInfo",
                                      currentInfo.filter((_: any, i: number) => i !== index),
                                      { shouldDirty: true }
                                    );
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                      <p className="text-sm">No additional information added yet</p>
                      <p className="text-xs mt-1">Click "Add Field" to start adding custom data</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2">
              <Button
                type="submit"
                disabled={updateMutation.isPending || !form.formState.isDirty}
                data-testid="button-save-company"
                onClick={() => console.log('[CompanyConfig] 🖱️ Submit button clicked')}
              >
                {updateMutation.isPending ? (
                  <>
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
