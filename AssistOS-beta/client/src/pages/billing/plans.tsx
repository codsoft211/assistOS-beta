import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Check,
  X,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CreditCard,
  Users,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface SubscriptionPlan {
  id: number;
  name: string;
  priceMonthlyEuros: string | null;
  priceModel: "fixed" | "quote";
  payingUsersIncluded: number | null;
  freeUsersIncluded: number | null;
  creditsIncluded: number | null;
  description: string | null;
  isEnterprise: boolean;
}

interface Subscription {
  subscription: {
    id: string;
    status: string;
    scheduledPlanId: number | null;
    scheduledPlanChangeAt: string | null;
  };
  plan: SubscriptionPlan;
  scheduledPlan: SubscriptionPlan | null;
  seatUsage: {
    payingSeats: number;
    freeSeats: number;
    totalSeats: number;
    payingLimit: number | null;
    freeLimit: number | null;
  };
}

interface UpgradePreview {
  currentPlan: {
    id: number;
    name: string;
    priceMonthly: number;
    payingSeatsAllocated: number;
    freeSeatsAllocated: number;
    activeUsers: number;
    blocksPaid: number;
  };
  targetPlan: {
    id: number;
    name: string;
    priceMonthly: number;
  };
  proration: {
    currentBlocksPaid: number;
    blocksNeeded: number;
    totalTargetCost: number;
    creditFromCurrentPlan: number;
    amountToPay: number;
    newPayingSeatsAllocated: number;
    newFreeSeatsAllocated: number;
    totalPayingSeats: number;
    totalFreeSeats: number;
  };
  message: string;
}

export default function BillingPlansPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"upgrade" | "downgrade" | null>(null);
  const [seatValidationError, setSeatValidationError] = useState<string | null>(null);
  const [upgradePreview, setUpgradePreview] = useState<UpgradePreview | null>(null);

  // Fetch current subscription
  const { data: subscription, isLoading: subscriptionLoading } = useQuery<Subscription>({
    queryKey: ["/api/billing/subscription/subscription"],
    staleTime: 0,
  });

  // Fetch available plans
  const { data: plansData, isLoading: plansLoading } = useQuery<{ plans: SubscriptionPlan[] }>({
    queryKey: ["/api/billing/subscription/plans"],
    staleTime: 0,
  });

  // Upgrade mutation
  const upgradeMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await apiRequest("POST", "/api/billing/subscription/upgrade", { planId });
      return res.json();
    },
    onSuccess: (data) => {
      // If this was a free upgrade (upgraded: true), show success and refresh
      if (data.upgraded) {
        toast({
          title: "Upgrade completed!",
          description: data.message || "Your account has been upgraded successfully. Credits and seat changes are now active.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription/subscription"] });
        queryClient.invalidateQueries({ queryKey: ["/api/credits/balance"] });
        setDialogOpen(false);
        setSelectedPlanId(null);
        setSeatValidationError(null);
        setUpgradePreview(null);
        return;
      }

      // If Stripe checkout URL is returned, redirect to Stripe
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      // Otherwise, show success message (for non-Stripe payments or fallback)
      toast({
        title: "Subscription updated",
        description: data.message || "Your subscription has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/balance"] });
      setDialogOpen(false);
      setSelectedPlanId(null);
      setSeatValidationError(null);
      setUpgradePreview(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update subscription. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Downgrade mutation
  const downgradeMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await apiRequest("POST", "/api/billing/subscription/downgrade", { planId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Subscription downgraded",
        description: data.message || "Your subscription has been downgraded successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/balance"] });
      setDialogOpen(false);
      setSelectedPlanId(null);
      setSeatValidationError(null);
    },
    onError: (error: Error) => {
      const errorMessage = error.message || "Failed to downgrade subscription.";
      
      // Check if it's a seat validation error
      if (errorMessage.includes("Too many") || errorMessage.includes("seat")) {
        setSeatValidationError(errorMessage);
      } else {
        toast({
          title: "Downgrade failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  const formatCurrency = (value: string | null) => {
    if (!value) return "Quote";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
    }).format(parseFloat(value));
  };

  const formatCredits = (value: number | null) => {
    if (value === null) return "Unlimited";
    return new Intl.NumberFormat("en-US").format(value);
  };

  const isLoading = subscriptionLoading || plansLoading;
  const currentPlan = subscription?.plan;
  const scheduledPlan = subscription?.scheduledPlan;
  const scheduledPlanChangeAt = subscription?.subscription?.scheduledPlanChangeAt ?? null;
  const plans = plansData?.plans || [];

  const handlePlanSelect = async (plan: SubscriptionPlan) => {
    // Enterprise plans require custom pricing - show contact sales message
    if (plan.isEnterprise || plan.priceModel === "quote") {
      toast({
        title: "Contact Sales",
        description: "Enterprise plans require custom pricing. Please contact our sales team for a quote.",
        variant: "default",
      });
      // TODO: Add link to contact form or sales email
      return;
    }

    if (!currentPlan) {
      // No current subscription - treat as upgrade
      setDialogType("upgrade");
      setSelectedPlanId(plan.id);
      setUpgradePreview(null);
      setDialogOpen(true);
      return;
    }

    if (plan.id === currentPlan.id) {
      toast({
        title: "Already on this plan",
        description: "You are already subscribed to this plan.",
      });
      return;
    }

    // Check if this plan is already scheduled
    if (scheduledPlan && plan.id === scheduledPlan.id) {
      toast({
        title: "Plan already scheduled",
        description: `Downgrade to ${scheduledPlan.name} is already scheduled for ${scheduledPlanChangeAt ? new Date(scheduledPlanChangeAt).toLocaleDateString() : 'the end of your billing period'}.`,
      });
      return;
    }

    // Check if another downgrade is already scheduled
    if (subscription?.subscription?.scheduledPlanId && plan.id < currentPlan.id) {
      toast({
        title: "Downgrade already scheduled",
        description: `You already have a downgrade scheduled. Please wait for it to take effect or contact support to change it.`,
        variant: "destructive",
      });
      return;
    }

    if (plan.id > currentPlan.id) {
      // Upgrading - fetch preview
      setDialogType("upgrade");
      setSelectedPlanId(plan.id);
      setSeatValidationError(null);
      
      // Fetch upgrade preview
      try {
        const res = await fetch(`/api/billing/subscription/upgrade-preview?planId=${plan.id}`);
        if (res.ok) {
          const preview = await res.json();
          setUpgradePreview(preview);
        } else {
          setUpgradePreview(null);
        }
      } catch (error) {
        console.error("Failed to fetch upgrade preview:", error);
        setUpgradePreview(null);
      }
      
      setDialogOpen(true);
    } else {
      // Downgrading
      setDialogType("downgrade");
      setSelectedPlanId(plan.id);
      setSeatValidationError(null);
      setUpgradePreview(null);
      setDialogOpen(true);
    }
  };

  const confirmAction = () => {
    if (!selectedPlanId) return;

    if (dialogType === "upgrade") {
      upgradeMutation.mutate(selectedPlanId);
    } else if (dialogType === "downgrade") {
      downgradeMutation.mutate(selectedPlanId);
    }
  };

  const getSelectedPlan = () => {
    return plans.find((p) => p.id === selectedPlanId);
  };

  return (
    <div className="flex-1 space-y-6 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Subscription Plans</h1>
          <p className="text-muted-foreground">
            Choose the plan that best fits your team's needs
          </p>
          {scheduledPlan && scheduledPlanChangeAt && (
            <div className="mt-2">
              <Alert className="bg-orange-50 border-orange-200">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800">
                  Downgrade to <strong>{scheduledPlan.name}</strong> scheduled for{" "}
                  {new Date(scheduledPlanChangeAt).toLocaleDateString()}
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>
        <Button variant="outline" onClick={() => setLocation("/billing")}>
          Back to Billing
        </Button>
      </div>

      {/* Plans Grid */}
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-24 mb-2" />
                <div className="h-4 bg-muted rounded w-32" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="h-8 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const isCurrentPlan = currentPlan?.id === plan.id;
            const isScheduledPlan = subscription?.scheduledPlan?.id === plan.id;
            const isUpgrade = currentPlan && plan.id > currentPlan.id;
            const isDowngrade = currentPlan && plan.id < currentPlan.id;
            const hasScheduledDowngrade = Boolean(subscription?.subscription?.scheduledPlanId);

            return (
              <Card
                key={plan.id}
                className={`relative ${
                  isCurrentPlan ? "ring-2 ring-primary" : ""
                } ${isScheduledPlan ? "ring-2 ring-orange-500" : ""}
                ${isUpgrade ? "border-green-500" : ""} ${isDowngrade ? "border-orange-500" : ""}`}
              >
                {isCurrentPlan && (
                  <div className="absolute top-4 right-4">
                    <Badge variant="default">Current Plan</Badge>
                  </div>
                )}
                {isScheduledPlan && (
                  <div className="absolute top-4 right-4">
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                      Scheduled
                    </Badge>
                  </div>
                )}

                <CardHeader>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description || "Subscription plan"}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Price */}
                  <div>
                    <div className="text-3xl font-bold">
                      {formatCurrency(plan.priceMonthlyEuros)}
                    </div>
                    <div className="text-sm text-muted-foreground">per month</div>
                  </div>

                  {/* Features */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        <strong>{plan.payingUsersIncluded ?? "Unlimited"}</strong> paying user
                        {plan.payingUsersIncluded !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        <strong>{plan.freeUsersIncluded ?? "Unlimited"}</strong> free user
                        {plan.freeUsersIncluded !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        <strong>{formatCredits(plan.creditsIncluded)}</strong> credits/month
                      </span>
                    </div>
                  </div>

                  {/* Action Button */}
                  <Button
                    className="w-full"
                    variant={isCurrentPlan ? "outline" : isScheduledPlan ? "outline" : isUpgrade ? "default" : "secondary"}
                    onClick={() => handlePlanSelect(plan)}
                    disabled={
                      isCurrentPlan || 
                      isScheduledPlan || 
                      (isDowngrade && hasScheduledDowngrade) || 
                      upgradeMutation.isPending || 
                      downgradeMutation.isPending
                    }
                  >
                    {isCurrentPlan ? (
                      "Current Plan"
                    ) : isScheduledPlan ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Scheduled
                      </>
                    ) : plan.isEnterprise || plan.priceModel === "quote" ? (
                      <>
                        <ArrowUpRight className="h-4 w-4 mr-2" />
                        Contact Sales
                      </>
                    ) : isUpgrade ? (
                      <>
                        <ArrowUpRight className="h-4 w-4 mr-2" />
                        Upgrade
                      </>
                    ) : isDowngrade ? (
                      <>
                        <ArrowDownRight className="h-4 w-4 mr-2" />
                        Downgrade
                      </>
                    ) : (
                      "Select Plan"
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dialogType === "upgrade" ? "Confirm Plan Upgrade" : "Confirm Plan Downgrade"}
            </DialogTitle>
            <DialogDescription>
              {getSelectedPlan() && (
                <>
                  You are about to {dialogType === "upgrade" ? "upgrade" : "downgrade"} to the{" "}
                  <strong>{getSelectedPlan()?.name}</strong> plan.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Upgrade Preview Details */}
          {dialogType === "upgrade" && upgradePreview && (
            <div className="space-y-4 py-4">
              {/* Free Upgrade Message */}
              {upgradePreview.proration.amountToPay === 0 ? (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">Free Upgrade Available</AlertTitle>
                  <AlertDescription className="mt-2 text-green-700">
                    <p className="font-semibold mb-2">
                      You have already paid {formatCurrency(upgradePreview.proration.creditFromCurrentPlan.toString())} for your current plan.
                    </p>
                    <p>
                      Your account can be upgraded directly to <strong>{upgradePreview.targetPlan.name}</strong> at no additional cost.
                      The upgrade will be processed instantly without any payment.
                    </p>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <CreditCard className="h-4 w-4" />
                  <AlertTitle>Upgrade Summary</AlertTitle>
                  <AlertDescription className="mt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Target Plan Cost:</div>
                      <div className="font-medium">{formatCurrency(upgradePreview.proration.totalTargetCost.toString())}</div>
                      
                      <div className="text-muted-foreground">Credit (Already Paid):</div>
                      <div className="font-medium text-green-600">
                        -{formatCurrency(upgradePreview.proration.creditFromCurrentPlan.toString())}
                      </div>
                      
                      <div className="text-muted-foreground font-semibold">Amount to Pay Now:</div>
                      <div className="font-bold text-lg">
                        {formatCurrency(upgradePreview.proration.amountToPay.toString())}
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Plan Details */}
              <Alert>
                <CreditCard className="h-4 w-4" />
                <AlertTitle>Plan Details</AlertTitle>
                <AlertDescription className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Current Plan:</div>
                    <div className="font-medium">{upgradePreview.currentPlan.name}</div>
                    
                    <div className="text-muted-foreground">Current Seats:</div>
                    <div className="font-medium">
                      {upgradePreview.currentPlan.payingSeatsAllocated} paid + {upgradePreview.currentPlan.freeSeatsAllocated} free
                    </div>
                    
                    <div className="text-muted-foreground">Active Users:</div>
                    <div className="font-medium">
                      {upgradePreview.currentPlan.activeUsers} / {upgradePreview.currentPlan.payingSeatsAllocated + upgradePreview.currentPlan.freeSeatsAllocated}
                    </div>
                    
                    <div className="text-muted-foreground">Target Plan:</div>
                    <div className="font-medium">{upgradePreview.targetPlan.name}</div>
                    
                    <div className="text-muted-foreground">New Total Seats:</div>
                    <div className="font-medium">
                      {upgradePreview.proration.totalPayingSeats} paid + {upgradePreview.proration.totalFreeSeats} free
                    </div>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Seat Transitions */}
              <Alert>
                <Users className="h-4 w-4" />
                <AlertTitle>Seat Transitions</AlertTitle>
                <AlertDescription className="mt-2 space-y-2">
                  <div className="text-sm space-y-1">
                    <p className="font-medium">The following changes will happen automatically:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>
                        <strong>Occupied seats:</strong> Your {upgradePreview.currentPlan.activeUsers} active user(s) will be automatically reassigned to the new plan structure
                      </li>
                      <li>
                        <strong>Seat type changes:</strong> Some paid seats will transition to free seats based on the {upgradePreview.targetPlan.name} plan structure
                      </li>
                      <li>
                        <strong>Pending invites:</strong> Any pending paid invites will be automatically converted to free invites if free seat capacity is available
                      </li>
                      <li>
                        <strong>No user action required:</strong> All seat transitions happen automatically without affecting your users
                      </li>
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
              
              {/* What Happens Next */}
              <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertTitle>What Happens Next</AlertTitle>
                <AlertDescription className="space-y-1">
                  {upgradePreview.proration.amountToPay === 0 ? (
                    <>
                      <p>✓ Upgrade processed instantly - no payment required</p>
                      <p>✓ Credits allocated immediately</p>
                      <p>✓ Billing cycle (renewal date) remains unchanged</p>
                      <p>✓ Seat transitions applied automatically</p>
                    </>
                  ) : (
                    <>
                      <p>✓ Credits allocated immediately after payment</p>
                      <p>✓ Billing cycle (renewal date) remains unchanged</p>
                      <p>✓ Seat transitions applied automatically</p>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Downgrade Info */}
          {dialogType === "downgrade" && getSelectedPlan() && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Downgrade Information</AlertTitle>
              <AlertDescription>
                Your current monthly credits will be removed and replaced with the new plan's credits.
                The downgrade will take effect at the end of your current billing period.
              </AlertDescription>
            </Alert>
          )}

          {seatValidationError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Cannot Downgrade</AlertTitle>
              <AlertDescription>{seatValidationError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setSelectedPlanId(null);
                setSeatValidationError(null);
                setUpgradePreview(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmAction}
              disabled={
                upgradeMutation.isPending ||
                downgradeMutation.isPending ||
                !!seatValidationError
              }
            >
              {upgradeMutation.isPending || downgradeMutation.isPending
                ? "Processing..."
                : dialogType === "upgrade"
                ? (upgradePreview?.proration.amountToPay === 0
                    ? "Confirm Upgrade"
                    : "Proceed to Payment")
                : "Confirm Downgrade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

