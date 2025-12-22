import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CreditCard, Plus, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

// Fetch Stripe publishable key from backend
let stripePromise: Promise<Stripe | null> | null = null;
const getStripePromise = async () => {
  if (!stripePromise) {
    stripePromise = (async () => {
      try {
        const res = await fetch('/api/config/public');
        if (!res.ok) {
          console.error('Failed to fetch Stripe config');
          return null;
        }
        const config = await res.json();
        if (!config.stripePublishableKey) {
          console.error('Stripe publishable key not configured');
          return null;
        }
        return await loadStripe(config.stripePublishableKey);
      } catch (error) {
        console.error('Error loading Stripe:', error);
        return null;
      }
    })();
  }
  return stripePromise;
};

interface PaymentMethod {
  id: string;
  type: string;
  card: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  isDefault: boolean;
}

interface PaymentMethodsResponse {
  paymentMethods: PaymentMethod[];
  defaultPaymentMethod: {
    id: string;
    card: {
      brand: string;
      last4: string;
      expMonth: number;
      expYear: number;
    } | null;
  } | null;
}

interface PaymentMethodSelectorProps {
  onSelect: (paymentMethodId: string | null) => void;
  selectedPaymentMethodId?: string | null;
  amount?: number;
  currency?: string;
}

const cardBrandIcon = (brand: string) => {
  const brands: Record<string, string> = {
    visa: '💳',
    mastercard: '💳',
    amex: '💳',
    discover: '💳',
  };
  return brands[brand.toLowerCase()] || '💳';
};

const cardBrandName = (brand: string) => {
  return brand.charAt(0).toUpperCase() + brand.slice(1);
};

function AddNewCardForm({ onSuccess }: { onSuccess: (paymentMethodId: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Create setup intent
      const setupRes = await fetch('/api/billing/payment-methods/setup-intent', {
        method: 'POST',
        credentials: 'include',
      });

      if (!setupRes.ok) {
        throw new Error('Failed to create setup intent');
      }

      const { clientSecret } = await setupRes.json();

      // Confirm setup intent
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (setupIntent?.payment_method) {
        // Attach to customer and set as default
        const attachRes = await fetch(`/api/billing/payment-methods/${setupIntent.payment_method}/set-default`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!attachRes.ok) {
          throw new Error('Failed to save payment method');
        }

        toast({
          title: 'Payment method added',
          description: 'Your card has been saved and set as default.',
        });

        onSuccess(setupIntent.payment_method as string);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add payment method',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border rounded-lg">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#9e2146',
              },
            },
          }}
        />
      </div>
      <Button type="submit" disabled={isSubmitting || !stripe}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Check className="mr-2 h-4 w-4" />
            Save Card
          </>
        )}
      </Button>
    </form>
  );
}

export function PaymentMethodSelector({
  onSelect,
  selectedPaymentMethodId,
  amount,
  currency = 'EUR',
}: PaymentMethodSelectorProps) {
  const { toast } = useToast();
  const [showAddCard, setShowAddCard] = useState(false);
  const [stripe, setStripe] = useState<Stripe | null>(null);

  // Load Stripe on mount
  useEffect(() => {
    getStripePromise().then(setStripe);
  }, []);

  const { data, isLoading, refetch } = useQuery<PaymentMethodsResponse>({
    queryKey: ['/api/billing/payment-methods'],
    queryFn: async () => {
      const res = await fetch('/api/billing/payment-methods', {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch payment methods');
      }
      return res.json();
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const res = await fetch(`/api/billing/payment-methods/${paymentMethodId}/set-default`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to set default payment method');
      }
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({
        title: 'Default payment method updated',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const paymentMethods = data?.paymentMethods || [];
  const defaultPaymentMethod = data?.defaultPaymentMethod;

  // Only show the default payment method (or first one if no default)
  const displayPaymentMethod = defaultPaymentMethod 
    ? paymentMethods.find(pm => pm.id === defaultPaymentMethod.id) || paymentMethods[0]
    : paymentMethods[0];

  // Auto-select default payment method on load
  useEffect(() => {
    if (defaultPaymentMethod && !selectedPaymentMethodId) {
      onSelect(defaultPaymentMethod.id);
    } else if (!defaultPaymentMethod && displayPaymentMethod && !selectedPaymentMethodId) {
      onSelect(displayPaymentMethod.id);
    }
  }, [defaultPaymentMethod?.id, displayPaymentMethod?.id, selectedPaymentMethodId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Saved Payment Methods - Only show default */}
      {displayPaymentMethod && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Payment Method</p>
          <Card
            className={`cursor-pointer transition-colors ${
              selectedPaymentMethodId === displayPaymentMethod.id
                ? 'border-primary bg-primary/5'
                : 'hover:bg-muted/50'
            }`}
            onClick={() => onSelect(displayPaymentMethod.id)}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{displayPaymentMethod.card ? cardBrandIcon(displayPaymentMethod.card.brand) : '💳'}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {displayPaymentMethod.card
                        ? `${cardBrandName(displayPaymentMethod.card.brand)} •••• ${displayPaymentMethod.card.last4}`
                        : 'Card'}
                    </span>
                    {displayPaymentMethod.isDefault && (
                      <Badge variant="secondary" className="text-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                  {displayPaymentMethod.card && (
                    <p className="text-sm text-muted-foreground">
                      Expires {displayPaymentMethod.card.expMonth}/{displayPaymentMethod.card.expYear}
                    </p>
                  )}
                </div>
              </div>
              {selectedPaymentMethodId === displayPaymentMethod.id && (
                <Check className="h-5 w-5 text-primary" />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add New Card */}
      {stripe ? (
        showAddCard ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Add New Card</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddCard(false)}
              >
                Cancel
              </Button>
            </div>
            <Elements stripe={stripe}>
              <AddNewCardForm
                onSuccess={(paymentMethodId) => {
                  setShowAddCard(false);
                  onSelect(paymentMethodId);
                  refetch();
                }}
              />
            </Elements>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowAddCard(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add New Card
          </Button>
        )
      ) : (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading payment form...</span>
        </div>
      )}

      {/* Amount Display */}
      {amount && selectedPaymentMethodId && (
        <div className="rounded-lg bg-muted p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total to charge</span>
            <span className="text-lg font-semibold">
              €{amount.toFixed(2)} {currency}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

