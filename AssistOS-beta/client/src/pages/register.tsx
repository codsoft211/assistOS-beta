import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SiGoogle } from "react-icons/si";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";

const registerSchema = z.object({
  organizationName: z.string().trim().min(1, "Organization name is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const registerViaInviteSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegisterFormData = z.infer<typeof registerSchema>;
type RegisterViaInviteFormData = z.infer<typeof registerViaInviteSchema>;

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Check if this is an invitation-based registration
  const urlParams = new URLSearchParams(window.location.search);
  const invitationToken = urlParams.get('invitationToken');
  const emailParam = urlParams.get('email');
  const isInviteRegistration = !!invitationToken;

  const form = useForm<RegisterFormData | RegisterViaInviteFormData>({
    resolver: zodResolver(isInviteRegistration ? registerViaInviteSchema : registerSchema),
    defaultValues: isInviteRegistration ? {
      firstName: "",
      lastName: "",
      email: emailParam || "",
      password: "",
      confirmPassword: "",
    } : {
      organizationName: "",
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  // Pre-fill email if provided in URL
  useEffect(() => {
    if (emailParam && !form.getValues('email')) {
      form.setValue('email', emailParam);
    }
  }, [emailParam, form]);

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormData | RegisterViaInviteFormData) => {
      if (isInviteRegistration) {
        // Register via invitation (no organization name, joins invited tenant)
        const res = await apiRequest("POST", "/api/auth/register-via-invite", {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          password: data.password,
          invitationToken: invitationToken,
        });
        return res.json();
      } else {
        // Normal registration (creates own tenant)
        const res = await apiRequest("POST", "/api/auth/register", {
          organizationName: (data as RegisterFormData).organizationName,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          password: data.password,
        });
        return res.json();
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      if (isInviteRegistration) {
        toast({
          title: "Registration successful!",
          description: "You've been added to the team. Welcome!",
        });
        setLocation("/dashboard");
      } else {
        toast({
          title: "Registo bem-sucedido!",
          description: "Bem-vindo ao AssistOS.",
        });
        setLocation("/chat");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Falha no registo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGoogleSignup = () => {
    window.location.href = "/api/auth/google";
  };

  const onSubmit = (data: RegisterFormData | RegisterViaInviteFormData) => {
    registerMutation.mutate(data);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <div className="pt-6 px-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="hover-elevate" data-testid="button-back-home">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar à Homepage
            </Button>
          </Link>
        </div>
        <CardHeader className="space-y-1 pt-4">
          <CardTitle className="text-2xl font-bold">
            {isInviteRegistration ? "Accept Invitation" : "Create an account"}
          </CardTitle>
          <CardDescription>
            {isInviteRegistration 
              ? "Create your account to join the team" 
              : "Enter your information to get started with AssistOS"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" data-testid="form-register">
              {!isInviteRegistration && (
                <FormField
                  control={form.control}
                  name="organizationName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da Organização</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Minha Empresa Lda"
                          data-testid="input-organization-name"
                          disabled={registerMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="John"
                          data-testid="input-first-name"
                          disabled={registerMutation.isPending}
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
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Doe"
                          data-testid="input-last-name"
                          disabled={registerMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="you@example.com"
                        data-testid="input-email"
                        disabled={registerMutation.isPending || isInviteRegistration}
                        readOnly={isInviteRegistration}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="At least 8 characters"
                        data-testid="input-password"
                        disabled={registerMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Confirm your password"
                        data-testid="input-confirm-password"
                        disabled={registerMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending}
                data-testid="button-register"
              >
                {registerMutation.isPending 
                  ? "Creating account..." 
                  : isInviteRegistration 
                    ? "Create account & Join Team" 
                    : "Create account"}
              </Button>
            </form>
          </Form>

          {!isInviteRegistration && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignup}
                data-testid="button-google-signup"
              >
                <SiGoogle className="mr-2 h-4 w-4" />
                Sign up with Google
              </Button>
            </>
          )}

          <div className="text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <button
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => setLocation("/login")}
              data-testid="link-login"
            >
              Sign in
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
