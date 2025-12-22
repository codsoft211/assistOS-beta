// Sync: 2025-11-17 - Platform services and modules implementation
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthGuard } from "@/components/AuthGuard";
import { AppLayout } from "@/components/AppLayout";
import { AdminLayout } from "@/components/AdminLayout";
import { PlatformAdminGuard } from "@/components/PlatformAdminGuard";
import { LanguageProvider } from "@/contexts/LanguageContext";
import "./i18n";
import { lazy, Suspense, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLoader, PageLoaderCompact } from "@/components/PageLoader";
import { getQueryFn } from "@/lib/queryClient";
import { useRealtimeModules } from "@/hooks/use-realtime-modules";
import { useTheme } from "@/hooks/use-theme";
import { useLanguageSync } from "@/hooks/use-language-sync";
import { useAINotifications } from "@/hooks/use-ai-notifications";

// ==================== Lazy Loaded Pages ====================

// Public pages
const HomePage = lazy(() => import("@/pages/HomePage"));
const LoginPage = lazy(() => import("@/pages/login"));
const RegisterPage = lazy(() => import("@/pages/register"));
const WaitlistPage = lazy(() => import("@/pages/waitlist"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Core pages
const ChatPage = lazy(() => import("@/pages/chat"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const StudioPage = lazy(() => import("@/pages/studio"));
const StudioModulesPage = lazy(() => import("@/pages/studio/modules"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));

// Tarefas & Comunicação
const TarefasPage = lazy(() => import("@/pages/tarefas"));
const ComunicacaoPage = lazy(() => import("@/pages/comunicacao"));
const ComunicacoesPage = lazy(() => import("@/pages/comunicacoes"));

// Workflows
const WorkflowsPage = lazy(() => import("@/pages/workflows"));
const WorkflowBuilderPage = lazy(() => import("@/pages/workflow-builder"));
const WorkflowExecutionsPage = lazy(() => import("@/pages/workflow-executions"));

// Financial pages
const FinanceiroDashboard = lazy(() => import("@/pages/financeiro"));
const FinanceiroFaturacao = lazy(() => import("@/pages/financeiro-faturacao"));
const FinanceiroRecebimentos = lazy(() => import("@/pages/financeiro-recebimentos"));
const FinanceiroReconciliacao = lazy(() => import("@/pages/financeiro-reconciliacao"));
const FinanceiroContasBancarias = lazy(() => import("@/pages/financeiro-contas-bancarias"));
const FinanceiroConfiguracoes = lazy(() => import("@/pages/financeiro-configuracoes"));
const FinanceiroTemplates = lazy(() => import("@/pages/financeiro-templates"));
const FinanceiroRateCards = lazy(() => import("@/pages/financeiro-rate-cards"));
const FinanceiroOrcamentos = lazy(() => import("@/pages/financeiro-orcamentos"));
const FinanceiroOrcamentoDetalhe = lazy(() => import("@/pages/financeiro-orcamento-detalhe"));
const QuoteChat = lazy(() => import("@/pages/financeiro/quote-chat"));
const InvoicesList = lazy(() => import("@/pages/financeiro/invoices"));
const InvoiceNew = lazy(() => import("@/pages/financeiro/invoice-new"));
const InvoiceEdit = lazy(() => import("@/pages/financeiro/invoice-edit"));
const InvoiceDetail = lazy(() => import("@/pages/financeiro/invoice-detail"));
const Payments = lazy(() => import("@/pages/financeiro/payments"));
const Reconciliation = lazy(() => import("@/pages/financeiro/reconciliation"));
const CreditNotesPage = lazy(() => import("@/pages/financeiro/credit-notes"));
const DunningPage = lazy(() => import("@/pages/financeiro/dunning"));
const VendorBillsPage = lazy(() => import("@/pages/financeiro/vendor-bills"));
const BillDetailPage = lazy(() => import("@/pages/financeiro/bill-detail"));
const ThreeWayMatchingPage = lazy(() => import("@/pages/financeiro/three-way-matching"));
const ApprovalsPage = lazy(() => import("@/pages/financeiro/approvals"));
const PaymentPlanningPage = lazy(() => import("@/pages/financeiro/payment-planning"));
const CashflowForecastPage = lazy(() => import("@/pages/financeiro/cashflow-forecast"));
const ARPage = lazy(() => import("@/pages/financeiro/ar"));
const APPage = lazy(() => import("@/pages/financeiro/ap"));
const TreasuryPage = lazy(() => import("@/pages/financeiro/treasury"));
const CatalogPage = lazy(() => import("@/pages/financeiro/catalog"));
const BillingPage = lazy(() => import("@/pages/billing"));
const BillingPlansPage = lazy(() => import("@/pages/billing/plans"));

// Compras (Procurement)
const ComprasPage = lazy(() => import("@/pages/compras"));
const ComprasDashboard = lazy(() => import("@/pages/compras/dashboard"));
const ComprasFornecedores = lazy(() => import("@/pages/compras/fornecedores"));
const ComprasFaturas = lazy(() => import("@/pages/compras/faturas"));
const ComprasOrders = lazy(() => import("@/pages/compras/orders"));
const ComprasRFQs = lazy(() => import("@/pages/compras/rfqs"));

// Gestão Documental
const GestaoDocumentalPage = lazy(() => import("@/pages/gestao-documental"));

// Admin pages
const AdminDashboardPage = lazy(() => import("@/pages/admin/index"));
const AdminWaitlistPage = lazy(() => import("@/pages/admin/waitlist"));
const AdminTenantsPage = lazy(() => import("@/pages/admin/tenants"));
const AdminModulesPage = lazy(() => import("@/pages/admin/modules"));
const AdminDocumentationPage = lazy(() => import("@/pages/admin/documentation"));
const AdminMonitoringPage = lazy(() => import("@/pages/admin/monitoring"));
const AdminPlatformSettingsPage = lazy(() => import("@/pages/admin/platform-settings"));

// Public pages
const SupplierInvoicePage = lazy(() => import("@/pages/public/supplier-invoice"));
const AcceptInvitePage = lazy(() => import("@/pages/accept-invite"));

// Gmail
const GmailInboxPage = lazy(() => import("@/pages/gmail/inbox"));
const GmailTemplatesPage = lazy(() => import("@/pages/gmail/templates"));
const GmailAutoRespondersPage = lazy(() => import("@/pages/gmail/auto-responders"));

// WhatsApp
const WhatsAppInboxPage = lazy(() => import("@/pages/whatsapp-inbox"));
const WhatsAppSettingsPage = lazy(() => import("@/pages/whatsapp-settings"));

// CRM
const CrmDashboard = lazy(() => import("@/pages/crm/index"));
const CrmClients = lazy(() => import("@/pages/crm/clients"));
const CrmOrders = lazy(() => import("@/pages/crm/orders"));
const CrmOpportunities = lazy(() => import("@/pages/crm/opportunities"));
const CrmRules = lazy(() => import("@/pages/crm/rules"));
const CrmActivities = lazy(() => import("@/pages/crm/activities"));
const CrmContracts = lazy(() => import("@/pages/crm/contracts"));
const CrmContractSubmissions = lazy(() => import("@/pages/crm/contract-submissions"));
const CrmRenewals = lazy(() => import("@/pages/crm/renewals"));

// Logística
const LogisticaPage = lazy(() => import("@/pages/logistica"));
const InventarioPage = lazy(() => import("@/pages/logistica/inventario"));
const EquipamentosPage = lazy(() => import("@/pages/logistica/equipamentos"));
const ArmazensPage = lazy(() => import("@/pages/logistica/armazens"));

// Inventário
const InventarioDashboard = lazy(() => import("@/pages/inventario/dashboard"));
const InventarioItems = lazy(() => import("@/pages/inventario/items"));
const InventarioRecipes = lazy(() => import("@/pages/inventario/recipes"));
const FinishedGoodsPage = lazy(() => import("@/pages/inventario/finished-goods"));
const RawMaterialsPage = lazy(() => import("@/pages/inventario/raw-materials"));
const SemiFinishedPage = lazy(() => import("@/pages/inventario/semi-finished"));
const PackagingPage = lazy(() => import("@/pages/inventario/packaging"));
const UnitsOfMeasurePage = lazy(() => import("@/pages/inventario/uoms"));
const CategoriesPage = lazy(() => import("@/pages/inventario/categories"));
const SellableItemsPage = lazy(() => import("@/pages/inventario/sellable"));

// Comercial & Projetos
const ServiceLinesPage = lazy(() => import("@/pages/comercial/service-lines"));
const ProjetosIndexPage = lazy(() => import("@/pages/projetos/index"));
const ProjectsModularPage = lazy(() => import("@/pages/projects"));
const ProjectsListPage = lazy(() => import("@/pages/projects/index"));
const ProjectsDashboard = lazy(() => import("@/pages/projects/dashboard"));
const ProjectDetailPage = lazy(() => import("@/pages/project-detail"));

// Lead Generation
const LeadGenerationDashboard = lazy(() => import("@/pages/lead-generation/index"));
const LeadGenerationLeads = lazy(() => import("@/pages/lead-generation/leads"));
const LeadGenerationLeadDetail = lazy(() => import("@/pages/lead-generation/lead-detail"));
const LeadGenerationCampaigns = lazy(() => import("@/pages/lead-generation/campaigns"));
const LeadGenerationCampaignDetail = lazy(() => import("@/pages/lead-generation/campaign-detail"));
const LeadGenerationSources = lazy(() => import("@/pages/lead-generation/sources"));
const LeadGenerationScoringRules = lazy(() => import("@/pages/lead-generation/scoring-rules"));

// Other modules
const HRIndexPage = lazy(() => import("@/pages/hr/index"));
const ProductionIndexPage = lazy(() => import("@/pages/production/index"));
const AccountingIndexPage = lazy(() => import("@/pages/accounting/index"));
const ActivityFeedPage = lazy(() => import("@/pages/activity-feed"));
const CreditsAnalytics = lazy(() => import("@/pages/credits-analytics"));

function HomeRedirect() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  if (isLoading) {
    return <PageLoader />;
  }

  if (user) {
    return <Redirect to="/chat" />;
  }

  return <Suspense fallback={<PageLoader />}><HomePage /></Suspense>;
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login">
        <Suspense fallback={<PageLoader />}>
          <LoginPage />
        </Suspense>
      </Route>
      <Route path="/register">
        <Suspense fallback={<PageLoader />}>
          <RegisterPage />
        </Suspense>
      </Route>
      <Route path="/waitlist">
        <Suspense fallback={<PageLoader />}>
          <WaitlistPage />
        </Suspense>
      </Route>
      <Route path="/supplier-invoice/:token">
        <Suspense fallback={<PageLoaderCompact />}>
          <SupplierInvoicePage />
        </Suspense>
      </Route>
      <Route path="/accept-invite/:token">
        <Suspense fallback={<PageLoaderCompact />}>
          <AcceptInvitePage />
        </Suspense>
      </Route>

      {/* Home route - shows HomePage or redirects to /chat if authenticated */}
      <Route path="/" component={HomeRedirect} />

      {/* Protected routes */}
      <Route path="/chat">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ChatPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/settings">
        <AuthGuard>
          <Suspense fallback={<PageLoaderCompact />}>
            <SettingsPage />
          </Suspense>
        </AuthGuard>
      </Route>

      {/* Studio routes - StudioPage handles all sub-routes internally */}
      <Route path="/studio/modules/:moduleId/config">
        <AuthGuard>
          <Suspense fallback={<PageLoader />}>
            <StudioPage />
          </Suspense>
        </AuthGuard>
      </Route>

      <Route path="/studio/modules">
        <AuthGuard>
          <Suspense fallback={<PageLoader />}>
            <StudioModulesPage />
          </Suspense>
        </AuthGuard>
      </Route>

      <Route path="/studio">
        <AuthGuard>
          <Suspense fallback={<PageLoader />}>
            <StudioPage />
          </Suspense>
        </AuthGuard>
      </Route>

      <Route path="/dashboard">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <DashboardPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/workflows">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <WorkflowsPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/workflows/builder/:id">
        <AuthGuard>
          <Suspense fallback={<PageLoaderCompact />}>
            <WorkflowBuilderPage />
          </Suspense>
        </AuthGuard>
      </Route>

      <Route path="/workflows/:id/executions">
        <AuthGuard>
          <Suspense fallback={<PageLoaderCompact />}>
            <WorkflowExecutionsPage />
          </Suspense>
        </AuthGuard>
      </Route>

      <Route path="/tarefas">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <TarefasPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/comunicacao">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ComunicacaoPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/comunicacoes">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ComunicacoesPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/faturacao">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <FinanceiroFaturacao />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/recebimentos">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <FinanceiroRecebimentos />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/reconciliacao">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <FinanceiroReconciliacao />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/contas-bancarias">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <FinanceiroContasBancarias />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/configuracoes">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <FinanceiroConfiguracoes />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/templates">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <FinanceiroTemplates />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/rate-cards">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <FinanceiroRateCards />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/orcamentos/:id">
        {(params) => (
          <AuthGuard>
            <AppLayout>
              <Suspense fallback={<PageLoaderCompact />}>
                <FinanceiroOrcamentoDetalhe quoteId={params.id} />
              </Suspense>
            </AppLayout>
          </AuthGuard>
        )}
      </Route>

      <Route path="/financeiro/orcamentos">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <FinanceiroOrcamentos />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/quote-chat">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <QuoteChat />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/invoices/new">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <InvoiceNew />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/invoices/:id/edit">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <InvoiceEdit />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/invoices/:id">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <InvoiceDetail />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/invoices">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <InvoicesList />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/payments">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <Payments />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/reconciliation">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <Reconciliation />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/credit-notes">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CreditNotesPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/dunning">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <DunningPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/vendor-bills">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <VendorBillsPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/three-way-matching">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ThreeWayMatchingPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/approvals">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ApprovalsPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/payment-planning">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <PaymentPlanningPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/cashflow-forecast">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CashflowForecastPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/ar">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ARPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/ar/invoices">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <InvoicesList />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/ar/credit-notes">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CreditNotesPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/ar/dunning">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <DunningPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/ar/collections">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <DunningPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/ap">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <APPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/ap/bills">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <VendorBillsPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/ap/bills/:id">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <BillDetailPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/ap/matching">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ThreeWayMatchingPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/ap/approvals">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ApprovalsPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/treasury">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <TreasuryPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/treasury/accounts">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <FinanceiroContasBancarias />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/treasury/forecast">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CashflowForecastPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/treasury/reconciliation">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <Reconciliation />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro/catalog">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CatalogPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/financeiro">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <FinanceiroDashboard />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/compras/dashboard">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ComprasDashboard />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/compras/fornecedores">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ComprasFornecedores />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/compras/faturas">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ComprasFaturas />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/compras/orders">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ComprasOrders />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/compras/rfqs">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ComprasRFQs />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/compras">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ComprasPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* CRM routes */}
      <Route path="/crm">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CrmDashboard />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/crm/clients/:id">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CrmClients />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/crm/clients">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CrmClients />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/crm/orders/:id">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CrmOrders />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/crm/orders">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CrmOrders />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/crm/opportunities/:id">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CrmOpportunities />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/crm/opportunities">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CrmOpportunities />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/crm/rules">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CrmRules />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/crm/activities">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CrmActivities />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/crm/contracts">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CrmContracts />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/crm/contract-submissions">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CrmContractSubmissions />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/crm/renewals">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CrmRenewals />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* Activity Feed route */}
      <Route path="/activity-feed">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ActivityFeedPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* Usage Analytics route */}
      <Route path="/usage">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CreditsAnalytics />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* Billing routes - Lazy loaded */}
      <Route path="/billing/plans">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-screen">
                <div className="text-center space-y-4">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                  <div className="space-y-2">
                    <p className="text-lg font-medium">Loading Plans</p>
                    <p className="text-sm text-muted-foreground">Preparing your subscription options...</p>
                  </div>
                </div>
              </div>
            }>
              <BillingPlansPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>
      <Route path="/billing">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-screen">
                <div className="text-center space-y-4">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                  <div className="space-y-2">
                    <p className="text-lg font-medium">Loading Billing</p>
                    <p className="text-sm text-muted-foreground">Fetching your subscription details...</p>
                  </div>
                </div>
              </div>
            }>
              <BillingPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* Logística route */}
      <Route path="/logistica">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <LogisticaPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/logistica/inventario">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <InventarioPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/logistica/equipamentos">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <EquipamentosPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/logistica/armazens">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ArmazensPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* Inventory Module routes */}
      <Route path="/inventario">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <InventarioDashboard />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/inventario/items">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <InventarioItems />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/inventario/recipes">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <InventarioRecipes />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/inventario/sellable">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <SellableItemsPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/inventario/finished-goods">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <FinishedGoodsPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/inventario/raw-materials">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <RawMaterialsPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/inventario/semi-finished">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <SemiFinishedPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/inventario/packaging">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <PackagingPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/inventario/uoms">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <UnitsOfMeasurePage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/inventario/categories">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <CategoriesPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* Comercial Module routes - Service Lines for Quotes */}
      <Route path="/comercial/service-lines">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ServiceLinesPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* Projects Module routes - Dashboard, List and Detail views */}
      <Route path="/projects/dashboard">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ProjectsDashboard />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/projects/list">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ProjectsListPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/projects/:projectId/:tab">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ProjectDetailPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/projects/:projectId">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ProjectDetailPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/projects">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ProjectsDashboard />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>
      
      {/* Projects Modular Configuration (Studio) */}
      <Route path="/studio/modules/projects/config">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ProjectsModularPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* Lead Generation Module Routes */}
      <Route path="/lead-generation">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <LeadGenerationDashboard />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/lead-generation/leads/:id">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <LeadGenerationLeadDetail />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/lead-generation/leads">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <LeadGenerationLeads />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/lead-generation/campaigns/:id">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <LeadGenerationCampaignDetail />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/lead-generation/campaigns">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <LeadGenerationCampaigns />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/lead-generation/sources">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <LeadGenerationSources />
            </Suspense>
          </AppLayout>
        </AuthGuard>
        
      </Route>

      <Route path="/lead-generation/scoring-rules">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <LeadGenerationScoringRules />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* HR Module routes */}
      <Route path="/hr">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <HRIndexPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* Production Module routes */}
      <Route path="/production">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <ProductionIndexPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* Accounting Module routes */}
      <Route path="/accounting">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <AccountingIndexPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/gestao-documental">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <GestaoDocumentalPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* Gmail routes */}
      <Route path="/gmail/inbox">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <GmailInboxPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/gmail/templates">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <GmailTemplatesPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/gmail/auto-responders">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <GmailAutoRespondersPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* WhatsApp routes */}
      <Route path="/whatsapp/inbox">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <WhatsAppInboxPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/whatsapp/settings">
        <AuthGuard>
          <AppLayout>
            <Suspense fallback={<PageLoaderCompact />}>
              <WhatsAppSettingsPage />
            </Suspense>
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* Admin routes - Protected by PlatformAdminGuard */}
      <Route path="/admin">
        <AuthGuard>
          <PlatformAdminGuard>
            <AdminLayout>
              <Suspense fallback={<PageLoaderCompact />}>
                <AdminDashboardPage />
              </Suspense>
            </AdminLayout>
          </PlatformAdminGuard>
        </AuthGuard>
      </Route>

      <Route path="/admin/waitlist">
        <AuthGuard>
          <PlatformAdminGuard>
            <AdminLayout>
              <Suspense fallback={<PageLoaderCompact />}>
                <AdminWaitlistPage />
              </Suspense>
            </AdminLayout>
          </PlatformAdminGuard>
        </AuthGuard>
      </Route>

      <Route path="/admin/tenants">
        <AuthGuard>
          <PlatformAdminGuard>
            <AdminLayout>
              <Suspense fallback={<PageLoaderCompact />}>
                <AdminTenantsPage />
              </Suspense>
            </AdminLayout>
          </PlatformAdminGuard>
        </AuthGuard>
      </Route>

      <Route path="/admin/modules">
        <AuthGuard>
          <PlatformAdminGuard>
            <AdminLayout>
              <Suspense fallback={<PageLoaderCompact />}>
                <AdminModulesPage />
              </Suspense>
            </AdminLayout>
          </PlatformAdminGuard>
        </AuthGuard>
      </Route>

      <Route path="/admin/documentation">
        <AuthGuard>
          <PlatformAdminGuard>
            <AdminLayout>
              <Suspense fallback={<PageLoaderCompact />}>
                <AdminDocumentationPage />
              </Suspense>
            </AdminLayout>
          </PlatformAdminGuard>
        </AuthGuard>
      </Route>

      <Route path="/admin/monitoring">
        <AuthGuard>
          <PlatformAdminGuard>
            <AdminLayout>
              <Suspense fallback={<PageLoaderCompact />}>
                <AdminMonitoringPage />
              </Suspense>
            </AdminLayout>
          </PlatformAdminGuard>
        </AuthGuard>
      </Route>

      <Route path="/admin/platform-settings">
        <AuthGuard>
          <PlatformAdminGuard>
            <AdminLayout>
              <Suspense fallback={<PageLoaderCompact />}>
                <AdminPlatformSettingsPage />
              </Suspense>
            </AdminLayout>
          </PlatformAdminGuard>
        </AuthGuard>
      </Route>

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

// Component that sets up realtime listeners INSIDE QueryClientProvider
function AppWithRealtime() {
  // Listen to realtime module updates via SSE
  useRealtimeModules();
  
  // Apply user theme preferences
  useTheme();
  
  // Sync user language preferences with i18n
  useLanguageSync();
  
  // Listen for AI response notifications (shows toast when AI finishes responding)
  useAINotifications();
  
  return (
    <>
      <Toaster />
      <SonnerToaster position="top-right" richColors />
      <Router />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <AppWithRealtime />
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
