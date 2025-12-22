import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GeometricBackground } from "@/components/GeometricBackground";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OnboardingChat } from "@/components/OnboardingChat";
import { 
  ChevronDown, 
  Sparkles,
  MessageSquare, 
  Zap, 
  DollarSign, 
  TrendingUp, 
  FileText, 
  Package, 
  Users,
  Settings,
  Plug,
  Clock,
  Brain,
  Target,
  Rocket
} from "lucide-react";
import { useState } from "react";

// Import stock images - Tema: Humanos + Tecnologia Futurística
import businessTeamImage from "@assets/stock_images/businessman_touching_f5fbf510.jpg";
import dashboardImage from "@assets/stock_images/professional_hologra_aefe2635.jpg";
import aiWorkspaceImage from "@assets/stock_images/ai_artificial_intell_c943986d.jpg"; // A que o utilizador gostou!
import officeTeamImage from "@assets/stock_images/hand_touching_virtua_336f9788.jpg";

export default function HomePage() {
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);

  const handleRegister = () => {
    setShowRegisterDialog(true);
  };

  return (
    <div className="min-h-screen dark">
      {/* Hero Section */}
      <section className="relative h-screen flex flex-col" style={{ backgroundColor: 'hsl(210 65% 8%)' }}>
        {/* Futuristic Background */}
        <GeometricBackground intensity="high" particleCount={30} />
        
        {/* Navigation - Fixed position */}
        <nav className="relative z-10 flex items-center justify-between p-6 md:p-8 shrink-0">
          <div className="flex items-center gap-2">
            <img 
              src="/logo_dark.png" 
              alt="assistOS" 
              className="h-10" 
              data-testid="icon-logo" 
            />
          </div>
          <Link href="/login">
            <Button variant="ghost" className="text-white hover:bg-white/10" data-testid="button-login">
              Entrar
            </Button>
          </Link>
        </nav>

        {/* Hero Content - Scrollable container */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-start pt-12 md:pt-16 px-6 md:px-8 pb-24 overflow-y-auto">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight" data-testid="text-hero-title">
              Pronto para transformar a tua empresa com IA?
            </h1>
            
            <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto" data-testid="text-hero-subtitle">
              Começa agora — eu guio-te passo a passo.
            </p>

            {/* AssistStart - Onboarding Chat */}
            <div className="w-full max-w-3xl mx-auto mt-12">
              <OnboardingChat onRegister={handleRegister} />
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="relative z-10 absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce" data-testid="scroll-indicator">
          <ChevronDown className="h-8 w-8 text-gray-400" />
        </div>
      </section>

      {/* Section 1: A Visão (2 columns) */}
      <section className="py-20 md:py-32" style={{ backgroundColor: 'hsl(218 37% 13%)' }}>
        <div className="container mx-auto px-6 md:px-8 max-w-7xl">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="space-y-6" data-testid="section-visao-left">
              <Badge className="w-fit bg-blue-500/20 text-blue-400 border-blue-500/30" data-testid="badge-visao">
                <Target className="h-4 w-4 mr-2" />
                A Visão
              </Badge>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white" data-testid="text-visao-title">
                O AssistOS é o cérebro operacional da tua empresa
              </h2>
              <p className="text-lg text-gray-300" data-testid="text-visao-description">
                Um sistema operativo inteligente para empresas que permite criar agentes de inteligência artificial sem precisar de programar, através de uma configuração simples e totalmente conversacional.
              </p>
            </div>

            <div className="space-y-6" data-testid="section-visao-right">
              {/* Image: Businessman touching holographic interface */}
              <div className="relative overflow-hidden rounded-2xl group">
                <img 
                  src={businessTeamImage} 
                  alt="Profissional interagindo com interface holográfica futurística"
                  className="w-full h-auto aspect-[4/3] object-cover transition-transform duration-500 group-hover:scale-105"
                  data-testid="img-business-tech"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
              </div>
              
              <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-all">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="text-blue-400 font-bold text-2xl">→</div>
                    <div>
                      <p className="font-semibold text-white">De sistemas fragmentados</p>
                      <p className="text-gray-400">para uma plataforma central unificada</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="text-blue-400 font-bold text-2xl">→</div>
                    <div>
                      <p className="font-semibold text-white">De processos manuais</p>
                      <p className="text-gray-400">para fluxos automáticos e inteligentes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: A Missão (centered) */}
      <section className="py-20 md:py-32" style={{ backgroundColor: 'hsl(210 65% 8%)' }}>
        <div className="container mx-auto px-6 md:px-8 max-w-5xl">
          <div className="text-center space-y-8" data-testid="section-missao">
            <Badge className="w-fit mx-auto bg-blue-500/20 text-blue-400 border-blue-500/30" data-testid="badge-missao">
              <Brain className="h-4 w-4 mr-2" />
              A Missão
            </Badge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white max-w-4xl mx-auto" data-testid="text-missao-title">
              Acreditamos que cada empresa deve ter o seu próprio sistema operativo inteligente.
            </h2>
            <div className="space-y-4 text-lg text-gray-300 max-w-3xl mx-auto" data-testid="text-missao-content">
              <p>
                O AssistOS transforma a forma como as empresas funcionam.
                É o primeiro sistema operativo empresarial totalmente conversacional —
                onde podes automatizar qualquer processo apenas com palavras.
              </p>
              <div className="pt-4 space-y-2 font-semibold text-white">
                <p>Sem técnicos.</p>
                <p>Sem integrações complexas.</p>
                <p>Só conversas que se transformam em ação.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Como Funciona (3 cards) */}
      <section className="py-20 md:py-32" style={{ backgroundColor: 'hsl(218 37% 13%)' }}>
        <div className="container mx-auto px-6 md:px-8 max-w-7xl">
          <div className="text-center space-y-4 mb-16" data-testid="section-como-funciona-header">
            <Badge className="w-fit mx-auto bg-blue-500/20 text-blue-400 border-blue-500/30" data-testid="badge-como-funciona">
              <Settings className="h-4 w-4 mr-2" />
              Como Funciona
            </Badge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white" data-testid="text-como-funciona-title">
              Escolhe, fala e automatiza.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16" data-testid="grid-como-funciona">
            <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-all" data-testid="card-passo-1">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
                  <Package className="h-6 w-6 text-blue-400" />
                </div>
                <CardTitle className="text-white">Escolhe um agente</CardTitle>
                <CardDescription className="text-base text-gray-400">
                  Finanças, Comercial, RH, Compras, Suporte, ou cria o teu.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-all" data-testid="card-passo-2">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
                  <MessageSquare className="h-6 w-6 text-blue-400" />
                </div>
                <CardTitle className="text-white">Diz o que queres automatizar</CardTitle>
                <CardDescription className="text-base text-gray-400">
                  "Quero processar faturas automaticamente."
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-all" data-testid="card-passo-3">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-blue-400" />
                </div>
                <CardTitle className="text-white">Deixa o agente trabalhar</CardTitle>
                <CardDescription className="text-base text-gray-400">
                  Em segundos, tudo configurado e a funcionar.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
          
          {/* Image: Professional interacting with holographic technology */}
          <div className="relative overflow-hidden rounded-2xl group max-w-5xl mx-auto">
            <img 
              src={dashboardImage} 
              alt="Profissional a usar tecnologia holográfica para gestão empresarial"
              className="w-full h-auto aspect-[16/9] object-cover transition-transform duration-500 group-hover:scale-105"
              data-testid="img-hologram-tech"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/30 to-transparent" />
            <div className="absolute bottom-8 left-8 right-8 z-10">
              <p className="text-lg font-semibold text-white mb-2">Tecnologia futurística ao teu alcance</p>
              <p className="text-gray-300">Interface intuitiva que parece ficção científica, mas é real</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: 50+ Agentes (grid) */}
      <section className="py-20 md:py-32" style={{ backgroundColor: 'hsl(210 65% 8%)' }}>
        <div className="container mx-auto px-6 md:px-8 max-w-7xl">
          <div className="text-center space-y-4 mb-16" data-testid="section-agentes-header">
            <Badge className="w-fit mx-auto bg-blue-500/20 text-blue-400 border-blue-500/30" data-testid="badge-agentes">
              <Sparkles className="h-4 w-4 mr-2" />
              50+ Agentes Prontos
            </Badge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white" data-testid="text-agentes-title">
              Mais de 50 agentes especializados para cada área da tua empresa.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12" data-testid="grid-agentes">
            <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-all" data-testid="card-agent-financeiro">
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-blue-400" />
                  </div>
                  <Badge className="bg-slate-700 text-gray-300 border-slate-600">Financeiro</Badge>
                </div>
                <CardTitle className="text-white">Financeiro</CardTitle>
                <CardDescription className="text-base text-gray-400">
                  Gera faturas, processa pagamentos e reconcilia contas.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-all" data-testid="card-agent-comercial">
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-blue-400" />
                  </div>
                  <Badge className="bg-slate-700 text-gray-300 border-slate-600">Comercial</Badge>
                </div>
                <CardTitle className="text-white">Comercial</CardTitle>
                <CardDescription className="text-base text-gray-400">
                  Gera leads, cria orçamentos e faz follow-up automático.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-all" data-testid="card-agent-contas-pagar">
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-blue-400" />
                  </div>
                  <Badge className="bg-slate-700 text-gray-300 border-slate-600">Contas a Pagar</Badge>
                </div>
                <CardTitle className="text-white">Contas a Pagar</CardTitle>
                <CardDescription className="text-base text-gray-400">
                  Extrai dados de faturas e regista fornecedores sozinho.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-all" data-testid="card-agent-logistica">
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Package className="h-6 w-6 text-blue-400" />
                  </div>
                  <Badge className="bg-slate-700 text-gray-300 border-slate-600">Logística</Badge>
                </div>
                <CardTitle className="text-white">Logística</CardTitle>
                <CardDescription className="text-base text-gray-400">
                  Controla stocks e automatiza encomendas.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-all" data-testid="card-agent-suporte">
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Users className="h-6 w-6 text-blue-400" />
                  </div>
                  <Badge className="bg-slate-700 text-gray-300 border-slate-600">Suporte</Badge>
                </div>
                <CardTitle className="text-white">Suporte</CardTitle>
                <CardDescription className="text-base text-gray-400">
                  Responde a clientes com base nos teus dados reais.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-slate-800/50 border-blue-500/50 hover:bg-slate-800/70 transition-all" data-testid="card-agent-mais">
              <CardHeader className="flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                  <div className="text-4xl font-bold text-blue-400">45+</div>
                  <CardDescription className="text-base text-gray-400">
                    Agentes adicionais disponíveis
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>
          
          {/* Image: AI Workspace */}
          <div className="grid md:grid-cols-2 gap-8 items-center mt-16">
            <div className="relative overflow-hidden rounded-2xl group">
              <img 
                src={aiWorkspaceImage} 
                alt="Workspace com IA e agentes inteligentes"
                className="w-full h-auto aspect-[4/3] object-cover transition-transform duration-500 group-hover:scale-105"
                data-testid="img-ai-workspace"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
            </div>
            
            <div className="space-y-4 text-center md:text-left">
              <h3 className="text-2xl md:text-3xl font-bold text-white">Agentes que trabalham para ti 24/7</h3>
              <p className="text-lg text-gray-300">
                Cada agente é especializado numa área específica e aprende com os processos da tua empresa.
                Trabalham em conjunto, partilham informação e executam tarefas automaticamente.
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-ver-agentes">
              Ver todos os agentes
            </Button>
          </div>
        </div>
      </section>

      {/* Section 5: Integrações */}
      <section className="py-20 md:py-32" style={{ backgroundColor: 'hsl(218 37% 13%)' }}>
        <div className="container mx-auto px-6 md:px-8 max-w-5xl">
          <div className="text-center space-y-8" data-testid="section-integracoes">
            <Badge className="w-fit mx-auto bg-blue-500/20 text-blue-400 border-blue-500/30" data-testid="badge-integracoes">
              <Plug className="h-4 w-4 mr-2" />
              Integrações
            </Badge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white" data-testid="text-integracoes-title">
              Liga-se ao que já usas.
            </h2>
            <p className="text-lg text-gray-300 max-w-3xl mx-auto" data-testid="text-integracoes-content">
              Conectores nativos para os principais ERPs e CRMs:
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-4" data-testid="integrations-list">
              {['SAP', 'Odoo', 'Primavera', 'PHC', 'Moloni', 'Google Workspace', 'HubSpot'].map((integration) => (
                <Badge key={integration} className="text-base px-4 py-2 bg-slate-800/50 text-gray-300 border-slate-600" data-testid={`badge-integration-${integration.toLowerCase().replace(' ', '-')}`}>
                  {integration}
                </Badge>
              ))}
              <Badge className="text-base px-4 py-2 bg-slate-800/50 text-gray-300 border-slate-600" data-testid="badge-integration-mais">
                e muito mais...
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6: Velocidade */}
      <section className="py-20 md:py-32" style={{ backgroundColor: 'hsl(210 65% 8%)' }}>
        <div className="container mx-auto px-6 md:px-8 max-w-7xl">
          <div className="text-center space-y-8 mb-16" data-testid="section-velocidade">
            <Badge className="w-fit mx-auto bg-blue-500/20 text-blue-400 border-blue-500/30" data-testid="badge-velocidade">
              <Clock className="h-4 w-4 mr-2" />
              Em minutos, não em meses
            </Badge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white" data-testid="text-velocidade-title">
              Configuração instantânea. Resultados imediatos.
            </h2>
            <p className="text-lg text-gray-300 max-w-3xl mx-auto" data-testid="text-velocidade-content">
              O AssistOS analisa a tua empresa, cria a estrutura ideal e implementa tudo
              em poucos minutos — sem código, sem técnicos e sem dor de cabeça.
            </p>
          </div>
          
          {/* Image: Hand touching virtual screen */}
          <div className="relative overflow-hidden rounded-2xl group max-w-5xl mx-auto mb-12">
            <img 
              src={officeTeamImage} 
              alt="Interação com ecrã virtual e interfaces digitais futurísticas"
              className="w-full h-auto aspect-[16/9] object-cover transition-transform duration-500 group-hover:scale-105"
              data-testid="img-virtual-screen"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/30 to-transparent" />
            <div className="absolute bottom-8 left-8 right-8 z-10">
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div>
                  <div className="text-4xl font-bold text-blue-400 mb-2">5 min</div>
                  <p className="text-gray-300">Configuração inicial</p>
                </div>
                <div>
                  <div className="text-4xl font-bold text-blue-400 mb-2">0 código</div>
                  <p className="text-gray-300">Totalmente conversacional</p>
                </div>
                <div>
                  <div className="text-4xl font-bold text-blue-400 mb-2">24/7</div>
                  <p className="text-gray-300">Agentes sempre ativos</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="text-center">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-experimentar">
              <Rocket className="h-5 w-5 mr-2" />
              Experimentar agora
            </Button>
          </div>
        </div>
      </section>

      {/* Section 7: O Futuro */}
      <section className="relative py-20 md:py-32 overflow-hidden" style={{ backgroundColor: 'hsl(218 37% 13%)' }}>
        {/* Futuristic Background */}
        <GeometricBackground intensity="medium" particleCount={15} />
        
        <div className="relative z-10 container mx-auto px-6 md:px-8 max-w-5xl">
          <div className="text-center space-y-8" data-testid="section-futuro">
            <Badge className="w-fit mx-auto bg-blue-500/20 text-blue-400 border-blue-500/30" data-testid="badge-futuro">
              <Brain className="h-4 w-4 mr-2" />
              O Futuro do Trabalho
            </Badge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white" data-testid="text-futuro-title">
              O teu negócio, com o poder da inteligência coletiva dos teus agentes.
            </h2>
            <p className="text-lg text-gray-300 max-w-3xl mx-auto" data-testid="text-futuro-content">
              Cada agente aprende com os outros e com a tua forma de trabalhar.
              Quanto mais usas o AssistOS, mais inteligente a tua empresa se torna.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-700" style={{ backgroundColor: 'hsl(210 65% 8%)' }}>
        <div className="container mx-auto px-6 md:px-8 max-w-7xl">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <img 
                  src="/logo_dark.png" 
                  alt="assistOS" 
                  className="h-8" 
                  data-testid="footer-logo" 
                />
              </div>
              <p className="text-gray-400">
                O sistema operativo inteligente para a tua empresa.
              </p>
            </div>
            
            <div className="space-y-4">
              <h3 className="font-semibold text-white">Produto</h3>
              <div className="space-y-2">
                <Link 
                  href="/login" 
                  className="block text-gray-400 hover:text-white transition-colors" 
                  data-testid="link-footer-login"
                >
                  Começar
                </Link>
                <Link 
                  href="/register" 
                  className="block text-gray-400 hover:text-white transition-colors" 
                  data-testid="link-footer-register"
                >
                  Criar conta
                </Link>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-white">Empresa</h3>
              <div className="space-y-2">
                <p className="text-gray-400">© 2025 AssistOS</p>
                <p className="text-gray-400 text-sm">
                  Transformando empresas com IA
                </p>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Register Dialog */}
      <Dialog open={showRegisterDialog} onOpenChange={setShowRegisterDialog}>
        <DialogContent className="bg-slate-900 border-slate-700" data-testid="dialog-register">
          <DialogHeader>
            <DialogTitle className="text-white">Criar Conta no AssistOS</DialogTitle>
            <DialogDescription className="text-gray-400">
              Estás a um passo de transformar a tua empresa com IA!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-400">
              O AssistOS está atualmente em <span className="font-semibold text-blue-400">fase alpha</span> e é <span className="font-semibold text-blue-400">completamente gratuito</span> para early adopters.
            </p>
            <div className="flex gap-3">
              <Link href="/register" className="flex-1">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-register-now">
                  Criar Conta Grátis
                </Button>
              </Link>
              <Link href="/login" className="flex-1">
                <Button variant="outline" className="w-full border-slate-600 text-gray-300 hover:bg-slate-800" data-testid="button-login-existing">
                  Já tenho conta
                </Button>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
