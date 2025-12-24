import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
    name?: string;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`Uncaught error in ${this.props.name || 'Component'}:`, error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-destructive/20 rounded-lg bg-destructive/5 text-center space-y-3">
                    <AlertTriangle className="w-8 h-8 text-destructive" />
                    <div className="space-y-1">
                        <h3 className="font-semibold text-sm">Error in {this.props.name || 'Component'}</h3>
                        <p className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {this.state.error?.message || 'Unknown error'}
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => this.setState({ hasError: false })}
                        className="h-7 text-[10px]"
                    >
                        <RefreshCcw className="w-3 h-3 mr-1" />
                        Try Again
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}
