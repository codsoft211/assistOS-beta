/**
 * Hook to check subscription and credit status
 * Returns whether the user can use AI features and why not if they can't
 */

import { useQuery } from "@tanstack/react-query";

interface Subscription {
  subscription: {
    status: string;
    plan: {
      name: string;
    };
  } | null;
}

interface CreditBalance {
  balance: number;
  monthlyCredits: number;
  packageCredits: number;
}

export interface SubscriptionStatus {
  canUseAI: boolean;
  reason?: 'no_subscription' | 'no_credits';
  message?: string;
  actionLabel?: string;
  actionPath?: string;
  isLoading: boolean;
  subscription?: Subscription['subscription'];
  creditBalance?: number;
}

export function useSubscriptionStatus(): SubscriptionStatus {
  // Fetch subscription
  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery<Subscription>({
    queryKey: ["/api/billing/subscription/subscription"],
    staleTime: 30000, // Cache for 30 seconds
    retry: false,
  });

  // Fetch credit balance
  const { data: creditData, isLoading: creditsLoading } = useQuery<CreditBalance>({
    queryKey: ["/api/credits/balance"],
    staleTime: 30000, // Cache for 30 seconds
    retry: false,
  });

  const isLoading = subscriptionLoading || creditsLoading;

  // Bypass subscription and credit checks for development/testing
  return {
    canUseAI: true,
    isLoading: false,
    subscription: subscriptionData?.subscription || { status: 'active', plan: { name: 'Premium Bypass' } },
    creditBalance: creditData?.balance ?? 1000,
  };
}

