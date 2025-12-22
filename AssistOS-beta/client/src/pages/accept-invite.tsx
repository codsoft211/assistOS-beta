import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

interface InvitationDetails {
  email: string;
  tenantName: string;
  role: string;
  requiresPayment: boolean;
  status: 'pending' | 'expired' | 'accepted';
  expiresAt: string;
  userExists: boolean; // Whether a user with this email already exists
}

interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string | null;
    lastLogin?: string | null;
    createdAt?: string;
  };
  tenants: any[];
  activeTenant: any;
}

export default function AcceptInvitePage() {
  const [, params] = useRoute("/accept-invite/:token");
  const token = params?.token;
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: authData } = useQuery<AuthResponse>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  // Extract user from auth response
  const user = authData?.user;

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [autoAcceptAttempted, setAutoAcceptAttempted] = useState(false);

  // Fetch invitation details
  useEffect(() => {
    if (!token) {
      setError("Invalid invitation link");
      setLoading(false);
      return;
    }

    const fetchInvitation = async () => {
      try {
        const response = await fetch(`/api/invitations/details/${token}`);
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to fetch invitation details");
        }

        const data = await response.json();
        setInvitation(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchInvitation();
  }, [token]);

  // Auto-accept if user is logged in and matches invitation email
  useEffect(() => {
    if (!loading && !autoAcceptAttempted && invitation && user && user.email === invitation.email && invitation.status === 'pending') {
      setAutoAcceptAttempted(true);
      handleAccept();
    }
  }, [loading, invitation, user, autoAcceptAttempted]);

  const handleAccept = async () => {
    if (!token) return;

    setAccepting(true);
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Failed to accept invitation");
      }

      const data = await response.json();
      setSuccess(true);

      // Check if user was already a member
      if (data.alreadyMember) {
        toast({
          title: "Already a member",
          description: "You're already part of this organization. Switching to it now...",
        });
      } else {
        toast({
          title: "Invitation accepted!",
          description: "You've been added to the team. Redirecting...",
        });
      }

      // Switch to the invited tenant and redirect to dashboard
      if (data.tenantId) {
        try {
          await fetch("/api/auth/switch-tenant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: data.tenantId }),
          });
        } catch (switchError) {
          console.error("Failed to switch tenant:", switchError);
          // Continue anyway - user can switch manually
        }
      }

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 2000);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
      setError(err.message);
    } finally {
      setAccepting(false);
    }
  };

  const handleLogin = () => {
    setLocation(`/login?redirect=/accept-invite/${token}`);
  };

  const handleRegister = () => {
    // Navigate to registration page with invitation token
    setLocation(`/register?email=${encodeURIComponent(invitation?.email || '')}&invitationToken=${token}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading invitation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <XCircle className="h-6 w-6 text-destructive" />
              <CardTitle>Invalid Invitation</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {error || "This invitation link is invalid or has expired."}
            </p>
            <Button onClick={() => setLocation("/login")} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
              <CardTitle>Invitation Accepted!</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              You've successfully joined the team. Redirecting to dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invitation.status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <XCircle className="h-6 w-6 text-destructive" />
              <CardTitle>Invitation Expired</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              This invitation expired on {new Date(invitation.expiresAt).toLocaleDateString()}.
              Please contact the team administrator for a new invitation.
            </p>
            <Button onClick={() => setLocation("/login")} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invitation.status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation Already Accepted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              This invitation has already been accepted.
            </p>
            <Button onClick={() => setLocation("/dashboard")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User not logged in or email doesn't match
  if (!user || user.email !== invitation.email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Mail className="h-6 w-6 text-primary" />
              <CardTitle>Team Invitation</CardTitle>
            </div>
            <CardDescription>
              You've been invited to join <strong>{invitation.tenantName}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium">{invitation.email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Role:</span>
                <span className="font-medium capitalize">{invitation.role}</span>
              </div>
              {invitation.requiresPayment && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Seat Type:</span>
                  <span className="font-medium text-blue-600">Paid Seat</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Expires:</span>
                <span className="font-medium">{new Date(invitation.expiresAt).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="pt-4 space-y-3">
              {!user ? (
                <>
                  {invitation.userExists ? (
                    // User exists - show only login
                    <>
                      <p className="text-sm text-muted-foreground text-center">
                        Please log in with your account to accept this invitation
                      </p>
                      <Button onClick={handleLogin} className="w-full">
                        Log In to Accept Invitation
                      </Button>
                    </>
                  ) : (
                    // User doesn't exist - show only create account
                    <>
                      <p className="text-sm text-muted-foreground text-center">
                        Create an account to join the team
                      </p>
                      <Button onClick={handleRegister} className="w-full">
                        Create Account
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-destructive text-center">
                    This invitation is for {invitation.email}, but you're logged in as {user.email}.
                    Please log out and log in with the correct account.
                  </p>
                  <Button onClick={() => window.location.href = "/logout"} variant="outline" className="w-full">
                    Log Out
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User is logged in with matching email - show accept button
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Mail className="h-6 w-6 text-primary" />
            <CardTitle>Team Invitation</CardTitle>
          </div>
          <CardDescription>
            You've been invited to join <strong>{invitation.tenantName}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email:</span>
              <span className="font-medium">{invitation.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Role:</span>
              <span className="font-medium capitalize">{invitation.role}</span>
            </div>
            {invitation.requiresPayment && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Seat Type:</span>
                <span className="font-medium text-blue-600">Paid Seat</span>
              </div>
            )}
          </div>

          <Button 
            onClick={handleAccept} 
            disabled={accepting} 
            className="w-full"
          >
            {accepting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Accepting...
              </>
            ) : (
              "Accept Invitation"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

