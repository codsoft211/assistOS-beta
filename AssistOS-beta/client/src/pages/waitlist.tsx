import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GeometricBackground } from "@/components/GeometricBackground";
import { CheckCircle2, Mail, Calendar } from "lucide-react";

export default function WaitlistPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <GeometricBackground intensity="medium" particleCount={30} />
      
      <Card className="w-full max-w-2xl relative z-10 border-blue-500/20 bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center space-y-4 pb-8">
          <div className="flex justify-center">
            <div className="rounded-full bg-blue-500/10 p-4">
              <CheckCircle2 className="h-16 w-16 text-blue-500" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">
            Registo Concluído com Sucesso!
          </CardTitle>
          <CardDescription className="text-lg text-muted-foreground">
            Bem-vindo à lista de espera do AssistOS
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-background/50 rounded-lg p-6 space-y-4 border border-border">
            <h3 className="text-xl font-semibold text-foreground">
              O que acontece agora?
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-blue-500/10 p-2 mt-1">
                  <Mail className="h-5 w-5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-foreground mb-1">
                    Contacto Personalizado
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    A nossa equipa entrará em contacto consigo brevemente para conhecer as necessidades da sua empresa.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="rounded-full bg-blue-500/10 p-2 mt-1">
                  <Calendar className="h-5 w-5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-foreground mb-1">
                    Demonstração Gratuita
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Agende uma demonstração personalizada onde mostramos como o AssistOS pode transformar a operação da sua organização.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
            <p className="text-sm text-center text-muted-foreground">
              <strong className="text-foreground">Avaliação Gratuita:</strong> Durante a demonstração, terá acesso completo à plataforma para avaliar como o AssistOS se adapta às suas necessidades específicas.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Link href="/" className="flex-1">
              <Button variant="outline" className="w-full" data-testid="button-back-home">
                Voltar à Homepage
              </Button>
            </Link>
            <Button 
              className="flex-1" 
              asChild
              data-testid="button-contact"
            >
              <a href="mailto:contato@assistos.ai">
                Contactar Agora
              </a>
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground pt-4">
            Verificou o seu email? Enviámos uma confirmação com mais detalhes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
