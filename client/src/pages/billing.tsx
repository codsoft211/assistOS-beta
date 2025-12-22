import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  TrendingUp,
  Package,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ShoppingCart,
  Sparkles,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState, useTransition } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SubscriptionPlan {
  id: number;
  name: string;
  priceMonthlyEuros: string | null;
  priceModel: "fixed" | "quote";
  payingUsersIncluded: number | null;
  freeUsersIncluded: number | null;
  creditsIncluded: number | null;
  totalCreditsAllocated?: number; // Total credits including additional seat credits
  description: string | null;
  isEnterprise: boolean;
}

interface Subscription {
  subscription: {
    id: string;
    status: string;
    startDate: string;
    endDate: string | null;
    renewalDate: string | null;
    billingInterval: string;
    autoRenew: boolean;
    currentPeriodStart: string;
    currentPeriodEnd: string | null;
    nextPaymentAt: string | null;
    isTrial: boolean;
    trialEndsAt: string | null;
  };
  plan: SubscriptionPlan;
  seatUsage: {
    payingSeats: number; // Active paying users
    freeSeats: number; // Active free users
    totalSeats: number; // Total active users
    payingSeatsAllocated?: number; // Total paying seats purchased (including pending invites)
    freeSeatsAllocated?: number; // Total free seats available (plan + purchased)
    freeSeatsInUse?: number; // Alias for freeSeats (for backwards compat)
    payingLimit: number | null;
    freeLimit: number | null;
  };
}

interface CreditBalance {
  balance: number;
  monthlyCredits: number;
  packageCredits: number;
  reserved: number;
  lifetimeUsage: number;
}

interface CreditPackageDefinition {
  id: string;
  creditsAmount: number;
  priceEuros: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
}

interface CheckoutResponse {
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  purchaseId?: string;
}

export default function BillingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [isPending, startTransition] = useTransition();
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [packageCheckoutId, setPackageCheckoutId] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  
  const handleNavigateToPlans = () => {
    startTransition(() => {
      setLocation("/billing/plans");
    });
  };

  // Handle Stripe redirect (check for session_id in URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    
    if (sessionId) {
      // Remove session_id from URL
      setLocation("/billing", { replace: true });
      
      // Show success message and refresh data
      toast({
        title: "Payment successful!",
        description: "We’re refreshing your billing data. Credits will appear shortly.",
      });
      
      // Refresh subscription and credits data
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/balance"] });
    }
  }, [toast, queryClient, setLocation]);

  // Fetch current subscription
  const { data: subscription, isLoading: subscriptionLoading } = useQuery<Subscription>({
    queryKey: ["/api/billing/subscription/subscription"],
    staleTime: 0,
  });

  // Fetch credit balance
  const { data: creditBalance, isLoading: creditLoading } = useQuery<CreditBalance>({
    queryKey: ["/api/credits/balance"],
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch("/api/credits/balance");
      if (!res.ok) throw new Error("Failed to fetch credit balance");
      return res.json();
    },
  });

  // Fetch available one-time credit packages (only when dialog is open)
  const {
    data: packagesData,
    isLoading: packagesLoading,
  } = useQuery<{ packages: CreditPackageDefinition[] }>({
    queryKey: ["/api/billing/packages"],
    enabled: buyCreditsOpen,
    staleTime: 1000 * 60 * 5,
  });

  const formatCredits = (value: number) => {
    return new Intl.NumberFormat("en-US").format(value);
  };

  const formatCurrency = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "Quote";
    const parsed = typeof value === "number" ? value : parseFloat(value);
    if (Number.isNaN(parsed)) return "Quote";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
    }).format(parsed);
  };

  const availablePackages = packagesData?.packages ?? [];

  const checkoutMutation = useMutation({
    mutationFn: async (packageId: string) => {
      const res = await apiRequest("POST", `/api/billing/packages/${packageId}/checkout`);
      return (await res.json()) as CheckoutResponse;
    },
    onMutate: (packageId: string) => {
      setPackageCheckoutId(packageId);
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      toast({
        title: "Checkout unavailable",
        description: "We could not start the payment flow. Please try again.",
        variant: "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Purchase failed",
        description: error.message || "We could not add credits right now. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setPackageCheckoutId(null);
    },
  });

  const isLoading = subscriptionLoading || creditLoading;
  const hasSubscription = subscription?.subscription !== null;
  const currentPlan = subscription?.plan;
  const credits = creditBalance || { balance: 0, monthlyCredits: 0, packageCredits: 0, reserved: 0, lifetimeUsage: 0 };

  // Calculate credit percentages for progress bar
  // Use totalCreditsAllocated if available (includes additional seat credits), otherwise fall back to creditsIncluded
  const totalCreditsFromPlan = currentPlan?.totalCreditsAllocated || currentPlan?.creditsIncluded || 0;
  const monthlyCreditsDisplay = totalCreditsFromPlan > 0 
    ? Math.min(credits.monthlyCredits, totalCreditsFromPlan)
    : credits.monthlyCredits;
  const extraMonthlyCredits = Math.max(0, credits.monthlyCredits - totalCreditsFromPlan);
  const monthlyPercentage = totalCreditsFromPlan > 0 
    ? Math.min(100, (monthlyCreditsDisplay / totalCreditsFromPlan) * 100)
    : 0;

  // Check for expiration warnings
  const currentPeriodEnd = subscription?.subscription?.currentPeriodEnd 
    ? new Date(subscription.subscription.currentPeriodEnd)
    : null;
  const daysUntilRenewal = currentPeriodEnd
    ? Math.ceil((currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const showExpirationWarning = daysUntilRenewal !== null && daysUntilRenewal <= 7 && daysUntilRenewal > 0;

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/subscription/cancel");
      let body: any = null;
      try {
        body = await res.json();
      } catch (err) {
        // ignore JSON parse errors
      }

      if (!res.ok) {
        throw new Error(body?.error || "Failed to cancel subscription");
      }

      return body as { cancelAt?: string | null };
    },
    onSuccess: (data) => {
      toast({
        title: "Subscription will not renew",
        description: data.cancelAt
          ? `Your plan stays active until ${new Date(data.cancelAt).toLocaleString()}.`
          : "Your plan will end after the current billing period.",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription/subscription"] });
      setCancelDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Cancellation failed",
        description: error.message || "We could not cancel your subscription right now.",
        variant: "destructive",
      });
    },
  });

  // Get available plans for upgrade
  return (
    <div className="flex-1 space-y-6 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing & Subscription</h1>
          <p className="text-muted-foreground">
            Manage your subscription plan and credit usage
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasSubscription && (
            <>
              <Button onClick={handleNavigateToPlans} disabled={isPending}>
                <ArrowUpRight className="h-4 w-4 mr-2" />
                {isPending ? "Loading..." : "View Plans"}
              </Button>
              {subscription?.subscription?.autoRenew && (
                <Button
                  variant="outline"
                  className="border-destructive text-destructive hover:bg-destructive/10"
                  onClick={() => setCancelDialogOpen(true)}
                  disabled={cancelSubscriptionMutation.isPending}
                >
                  {cancelSubscriptionMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Cancel Subscription
                </Button>
              )}
            </>
          )}
          {!hasSubscription && (
            <Button onClick={handleNavigateToPlans} disabled={isPending}>
              {isPending ? "Loading..." : "Choose a Plan"}
            </Button>
          )}
        </div>
      </div>

      {/* Expiration Warning */}
      {showExpirationWarning && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Subscription Renewing Soon</AlertTitle>
          <AlertDescription>
            Your subscription will renew in {daysUntilRenewal} day{daysUntilRenewal !== 1 ? "s" : ""}.
            Monthly credits will be refreshed upon renewal.
          </AlertDescription>
        </Alert>
      )}

      {hasSubscription && subscription?.subscription?.autoRenew === false && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Auto-renew is turned off</AlertTitle>
          <AlertDescription>
            {currentPeriodEnd
              ? `Your plan will stay active until ${currentPeriodEnd.toLocaleString()}.`
              : "Your plan will stay active until the current billing period ends."}
          </AlertDescription>
        </Alert>
      )}

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Current Plan
              </CardTitle>
              <CardDescription>
                {isLoading ? "Loading..." : hasSubscription ? "Your active subscription" : "No active subscription"}
              </CardDescription>
            </div>
            {hasSubscription && (
              <Badge variant={subscription?.subscription.status === "active" ? "default" : "secondary"}>
                {subscription?.subscription.status.toUpperCase()}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <div className="h-8 bg-muted animate-pulse rounded" />
              <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
            </div>
          ) : hasSubscription && currentPlan ? (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-bold">{currentPlan.name}</h3>
                  <p className="text-muted-foreground mt-1">{currentPlan.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {formatCurrency(currentPlan.priceMonthlyEuros)}
                  </div>
                  <div className="text-sm text-muted-foreground">per month</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                <div>
                  <div className="text-sm text-muted-foreground">Paying Seats</div>
                  <div className="text-lg font-semibold">
                    {subscription.seatUsage.payingSeats}
                    {subscription.seatUsage.payingSeatsAllocated !== undefined && (
                      <span className="text-muted-foreground"> / {subscription.seatUsage.payingSeatsAllocated}</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Free Seats</div>
                  <div className="text-lg font-semibold">
                    {subscription.seatUsage.freeSeats}
                    {subscription.seatUsage.freeSeatsAllocated !== undefined && (
                      <span className="text-muted-foreground"> / {subscription.seatUsage.freeSeatsAllocated}</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Credits Included</div>
                  <div className="text-lg font-semibold">
                    {currentPlan.totalCreditsAllocated !== undefined
                      ? formatCredits(currentPlan.totalCreditsAllocated)
                      : currentPlan.creditsIncluded !== null
                      ? formatCredits(currentPlan.creditsIncluded)
                      : "Unlimited"}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Next Renewal</div>
                  <div className="text-lg font-semibold">
                    {currentPeriodEnd
                      ? formatDistanceToNow(currentPeriodEnd, { addSuffix: true })
                      : "N/A"}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No active subscription</p>
              <Button onClick={handleNavigateToPlans} disabled={isPending}>
                {isPending ? "Loading..." : "Choose a Plan"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credit Usage Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Credit Balance
          </CardTitle>
          <CardDescription>
            Monthly credits expire at the end of your billing period. Package credits never expire.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <div className="h-8 bg-muted animate-pulse rounded" />
              <div className="h-4 bg-muted animate-pulse rounded" />
            </div>
          ) : (
            <>
              {/* Total Credits */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Total Credits</span>
                  <span className="text-2xl font-bold">{formatCredits(credits.balance)}</span>
                </div>
              </div>

              {/* Monthly Credits Progress */}
              {totalCreditsFromPlan > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">Monthly Credits (Expiring)</span>
                    </div>
                    <span className="font-semibold">
                      {formatCredits(monthlyCreditsDisplay)} / {formatCredits(totalCreditsFromPlan)}
                    </span>
                  </div>
                  <Progress value={monthlyPercentage} className="h-3" />
                  <p className="text-xs text-muted-foreground">
                    {currentPeriodEnd
                      ? `Expires ${formatDistanceToNow(currentPeriodEnd, { addSuffix: true })}`
                      : "No expiration date"}
                  </p>
                  {extraMonthlyCredits > 0 && (
                    <p className="text-xs text-amber-600">
                      +{formatCredits(extraMonthlyCredits)} bonus monthly credits beyond plan allowance
                    </p>
                  )}
                </div>
              )}

              {/* Package Credits */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-green-500" />
                    <span className="font-medium">Package Credits (Non-Expiring)</span>
                  </div>
                  <span className="font-semibold">{formatCredits(credits.packageCredits)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  One-time purchases that never expire
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleNavigateToPlans}
                  disabled={isPending}
                  className="flex-1"
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Upgrade Plan
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setBuyCreditsOpen(true)}
                  className="flex-1"
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  {isPending ? "Loading..." : "Buy Credits"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <BuyCreditsDialog
        open={buyCreditsOpen}
        onOpenChange={setBuyCreditsOpen}
        packages={availablePackages}
        isLoading={packagesLoading && buyCreditsOpen}
        isStartingCheckout={checkoutMutation.isPending}
        processingId={packageCheckoutId}
        onCheckout={(id) => checkoutMutation.mutate(id)}
        formatCurrency={formatCurrency}
        formatCredits={formatCredits}
      />
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription auto-renew?</DialogTitle>
            <DialogDescription>
              You&apos;ll keep access to your current plan until the end of this billing period. After
              that, your plan will end and no further charges will be made.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={cancelSubscriptionMutation.isPending}
            >
              Keep Plan
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelSubscriptionMutation.mutate()}
              disabled={cancelSubscriptionMutation.isPending}
            >
              {cancelSubscriptionMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface BuyCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packages: CreditPackageDefinition[];
  isLoading: boolean;
  isStartingCheckout: boolean;
  processingId: string | null;
  onCheckout: (packageId: string) => void;
  formatCurrency: (value: string | number | null | undefined) => string;
  formatCredits: (value: number) => string;
}

function BuyCreditsDialog({
  open,
  onOpenChange,
  packages,
  isLoading,
  isStartingCheckout,
  processingId,
  onCheckout,
  formatCurrency,
  formatCredits,
}: BuyCreditsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Buy Non-Expiring Credits</DialogTitle>
          <DialogDescription>
            Choose a one-time package. Credits are applied instantly and never expire.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[...Array(4)].map((_, idx) => (
              <Card key={idx} className="p-4">
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-24 mb-4" />
                <Skeleton className="h-10 w-full" />
              </Card>
            ))}
          </div>
        ) : packages.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {packages.map((pkg) => {
              const isProcessing = isStartingCheckout && processingId === pkg.id;
              return (
                <Card key={pkg.id} className="border-2 border-muted hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-xl">{formatCredits(pkg.creditsAmount)} credits</CardTitle>
                    <CardDescription>Non-expiring · {pkg.paymentMethod === "manual" ? "Manual billing" : pkg.paymentMethod}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Perfect for top-ups without changing your subscription.
                    </p>
                    <div className="text-2xl font-semibold">{formatCurrency(pkg.priceEuros)}</div>
                    <Button
                      className="w-full"
                      onClick={() => onCheckout(pkg.id)}
                      disabled={isStartingCheckout}
                    >
                      {isProcessing ? "Processing..." : "Buy now"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Alert>
            <AlertTitle>No packages available</AlertTitle>
            <AlertDescription>
              We don’t have any one-time credit packages configured yet. Please contact support.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex items-start justify-between">
          <p className="text-xs text-muted-foreground">
            Purchases are billed in EUR. Credits apply instantly and never expire.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

