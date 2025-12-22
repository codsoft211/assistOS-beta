/**
 * Banner component shown when AI features are blocked
 * due to no subscription or insufficient credits
 */

import { AlertCircle, CreditCard, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface AIBlockedBannerProps {
  reason: 'no_subscription' | 'no_credits';
  message: string;
  actionLabel: string;
  actionPath: string;
  creditBalance?: number;
}

export function AIBlockedBanner({
  reason,
  message,
  actionLabel,
  actionPath,
  creditBalance,
}: AIBlockedBannerProps) {
  const [, setLocation] = useLocation();

  const isNoSubscription = reason === 'no_subscription';
  const Icon = isNoSubscription ? Sparkles : CreditCard;
  
  return (
    <Alert 
      variant="destructive" 
      className="mb-3 border-2 p-3"
    >
      <div className="flex flex-col gap-2.5 min-w-0">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm mb-0.5 leading-tight">
              {isNoSubscription ? 'Subscription Required' : 'Credits Depleted'}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed break-words">
              {message}
              {!isNoSubscription && creditBalance !== undefined && (
                <span className="block mt-0.5">
                  Current balance: {creditBalance} credits
                </span>
              )}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setLocation(actionPath)}
          size="sm"
          variant="default"
          className="w-full text-xs h-8"
        >
          {actionLabel}
        </Button>
      </div>
    </Alert>
  );
}

