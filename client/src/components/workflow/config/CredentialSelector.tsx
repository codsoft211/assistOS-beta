import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Key, Loader2, AlertCircle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface CredentialSelectorProps {
    type: string;
    value?: string;
    onChange: (value: string) => void;
    label?: string;
}

/**
 * CredentialSelector component
 * Allows users to select or create a credential for a specific type
 */
export function CredentialSelector({ type, value, onChange, label }: CredentialSelectorProps) {
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newConfig, setNewConfig] = useState<Record<string, string>>({});

    // Fetch existing credentials for this type
    const { data: credentials, isLoading } = useQuery({
        queryKey: ['/api/assistbuild/credentials', type],
        queryFn: async () => {
            const res = await apiRequest('GET', `/api/assistbuild/credentials?type=${type}`);
            return res.json();
        },
        enabled: !!type
    });

    // Mutation to create a new credential
    const createMutation = useMutation({
        mutationFn: async (data: any) => {
            const res = await apiRequest('POST', '/api/assistbuild/credentials', data);
            return res.json();
        },
        onSuccess: (newCred) => {
            queryClient.invalidateQueries({ queryKey: ['/api/assistbuild/credentials', type] });
            onChange(newCred.id);
            setIsDialogOpen(false);
            setNewName('');
            setNewConfig({});
            toast.success('Credential created and selected');
        },
        onError: (err: Error) => {
            toast.error(`Failed to create credential: ${err.message}`);
        }
    });

    const handleCreate = () => {
        if (!newName) return toast.error('Friendly name is required');
        if (Object.keys(newConfig).length === 0) return toast.error('Credential data cannot be empty');

        createMutation.mutate({
            name: newName,
            type,
            data: newConfig
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-[10px] text-primary/60 font-medium py-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading credentials...
            </div>
        );
    }

    return (
        <div className="space-y-2 border-l-2 border-primary/20 pl-3 py-1 bg-primary/[0.02] rounded-r-md mt-2">
            <Label className="text-[10px] font-bold uppercase text-primary tracking-wider flex items-center gap-1.5 mb-1">
                <Key className="w-3 h-3" /> {label || `${type.toUpperCase()} Authentication`}
            </Label>

            <div className="flex gap-2">
                <div className="flex-1">
                    <Select value={value || "none"} onValueChange={(val) => onChange(val === "none" ? "" : val)}>
                        <SelectTrigger className="w-full text-xs h-8 bg-white border-primary/30 hover:border-primary transition-colors">
                            <SelectValue placeholder={`Select ${type} credential...`} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none" className="text-xs italic text-muted-foreground">None selected</SelectItem>
                            {credentials?.map((cred: any) => (
                                <SelectItem key={cred.id} value={cred.id} className="text-xs">
                                    {cred.name}
                                </SelectItem>
                            ))}
                            {credentials?.length === 0 && (
                                <div className="px-2 py-4 text-center text-xs text-muted-foreground italic">
                                    No {type} credentials found
                                </div>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 border-primary/30 hover:bg-primary/5">
                            <Plus className="w-3.5 h-3.5" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[400px]">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Key className="w-5 h-5 text-primary" />
                                Add {type.toUpperCase()} Credential
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-xs font-semibold">Friendly Name</Label>
                                <Input
                                    id="name"
                                    className="h-9 text-xs"
                                    placeholder="e.g., My Personal API Key"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                            </div>

                            <div className="space-y-3 pt-2">
                                <p className="text-[10px] font-bold uppercase text-muted-foreground border-b border-dashed pb-1">Sensitive Data (Always Encrypted)</p>

                                {/* Type-specific inputs */}
                                {type === 'smtp' ? (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label className="text-right text-xs">Host</Label>
                                            <Input
                                                className="col-span-3 h-8 text-xs"
                                                placeholder="smtp.gmail.com"
                                                onChange={e => setNewConfig({ ...newConfig, host: e.target.value })}
                                            />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label className="text-right text-xs">Port</Label>
                                            <Input
                                                className="col-span-3 h-8 text-xs"
                                                placeholder="587"
                                                onChange={e => setNewConfig({ ...newConfig, port: e.target.value })}
                                            />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label className="text-right text-xs">User</Label>
                                            <Input
                                                className="col-span-3 h-8 text-xs"
                                                placeholder="user@example.com"
                                                onChange={e => setNewConfig({ ...newConfig, user: e.target.value })}
                                            />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label className="text-right text-xs">Pass</Label>
                                            <Input
                                                type="password"
                                                className="col-span-3 h-8 text-xs"
                                                placeholder="••••••••"
                                                onChange={e => setNewConfig({ ...newConfig, pass: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label className="text-right text-xs">API Key</Label>
                                            <Input
                                                type="password"
                                                className="col-span-3 h-8 text-xs"
                                                placeholder="sk-..."
                                                onChange={e => setNewConfig({ ...newConfig, apiKey: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 pt-2">
                            <Button
                                onClick={handleCreate}
                                disabled={createMutation.isPending}
                                size="sm"
                                className="w-full"
                            >
                                {createMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <Plus className="w-4 h-4 mr-2" />
                                )}
                                Save Credential
                            </Button>
                            <p className="text-[9px] text-center text-muted-foreground italic">
                                Data is encrypted using AES-256-GCM before storage.
                            </p>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {!value && credentials?.length > 0 && (
                <p className="text-[10px] text-destructive flex items-center gap-1 font-semibold animate-pulse mt-1">
                    <AlertCircle className="w-2.5 h-2.5" /> This node requires a credential to run
                </p>
            )}
        </div>
    );
}
