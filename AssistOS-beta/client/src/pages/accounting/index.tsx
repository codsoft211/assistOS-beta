import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Calculator,
  Plus,
  BookOpen,
  FileSpreadsheet,
  PieChart,
  Search,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  Clock,
  FileText,
  DollarSign,
  BarChart3,
  Layers,
  Calendar,
} from "lucide-react";

export default function AccountingIndexPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [createEntryOpen, setCreateEntryOpen] = useState(false);

  // Fetch accounting summary
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["/api/accounting/analytics/summary"],
  });

  // Fetch chart of accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ["/api/accounting/chart-of-accounts", searchQuery],
  });

  // Fetch journal entries
  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ["/api/accounting/journal-entries"],
  });

  // Fetch trial balance
  const { data: trialBalanceData, isLoading: trialBalanceLoading } = useQuery({
    queryKey: ["/api/accounting/reports/trial-balance"],
  });

  const summary = summaryData?.data || { accounts: { total: 0, active: 0 }, journalEntries: { total: 0, draft: 0, posted: 0 } };
  const accounts = accountsData?.accounts || [];
  const journalEntries = entriesData?.journalEntries || [];
  const trialBalance = trialBalanceData?.data || { accounts: [], summary: { totalDebit: 0, totalCredit: 0 } };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "posted":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"><CheckCircle className="w-3 h-3 mr-1" />Posted</Badge>;
      case "draft":
        return <Badge className="bg-slate-500/10 text-slate-500 border-slate-500/20"><Clock className="w-3 h-3 mr-1" />Draft</Badge>;
      case "pending_review":
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Pending Review</Badge>;
      case "reversed":
        return <Badge variant="secondary">Reversed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getAccountTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      asset: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      liability: "bg-red-500/10 text-red-500 border-red-500/20",
      equity: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      revenue: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      expense: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    };
    return <Badge className={colors[type] || ""}>{type}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-background to-muted/20 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 tracking-tight">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <Calculator className="h-7 w-7" />
            </div>
            Accounting
          </h1>
          <p className="text-muted-foreground mt-1">
            Chart of accounts, journal entries, and financial reporting
          </p>
        </div>
        <Dialog open={createEntryOpen} onOpenChange={setCreateEntryOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
              <Plus className="h-4 w-4 mr-2" />
              New Journal Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[625px]">
            <DialogHeader>
              <DialogTitle>Create Journal Entry</DialogTitle>
              <DialogDescription>
                Create a new journal entry. Debits must equal credits.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entryDate">Entry Date *</Label>
                  <Input id="entryDate" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference">Reference</Label>
                  <Input id="reference" placeholder="INV-001" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Input id="description" placeholder="Description of the journal entry" />
              </div>
              <div className="space-y-2">
                <Label>Entry Lines</Label>
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-4 gap-2 text-sm font-medium text-muted-foreground">
                    <div>Account</div>
                    <div>Description</div>
                    <div>Debit</div>
                    <div>Credit</div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((acc: any) => (
                          <SelectItem key={acc.id} value={acc.id}>{acc.code} - {acc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Line description" />
                    <Input type="number" placeholder="0.00" />
                    <Input type="number" placeholder="0.00" />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((acc: any) => (
                          <SelectItem key={acc.id} value={acc.id}>{acc.code} - {acc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Line description" />
                    <Input type="number" placeholder="0.00" />
                    <Input type="number" placeholder="0.00" />
                  </div>
                  <Button variant="outline" size="sm" className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Line
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateEntryOpen(false)}>Cancel</Button>
              <Button className="bg-gradient-to-r from-emerald-500 to-teal-600">Create Entry</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Accounts</CardTitle>
            <BookOpen className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold text-blue-600">{summary.accounts?.total || accounts.length}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-500/10 to-green-500/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Posted Entries</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold text-emerald-600">{summary.journalEntries?.posted || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-500/10 to-orange-500/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Draft Entries</CardTitle>
            <FileText className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold text-amber-600">{summary.journalEntries?.draft || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500/10 to-violet-500/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Trial Balance</CardTitle>
            <BarChart3 className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {trialBalanceLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-lg font-bold text-purple-600">
                {trialBalance.summary?.isBalanced ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> Balanced
                  </span>
                ) : (
                  <span className="text-red-600">Unbalanced</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <PieChart className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="accounts" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <BookOpen className="h-4 w-4 mr-2" />
            Chart of Accounts
          </TabsTrigger>
          <TabsTrigger value="journal-entries" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Journal Entries
          </TabsTrigger>
          <TabsTrigger value="reports" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <BarChart3 className="h-4 w-4 mr-2" />
            Reports
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                  Recent Journal Entries
                </CardTitle>
                <CardDescription>Latest accounting entries</CardDescription>
              </CardHeader>
              <CardContent>
                {entriesLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : journalEntries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileSpreadsheet className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No journal entries found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {journalEntries.slice(0, 5).map((entry: any) => (
                      <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">{entry.entryNumber}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">{entry.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{entry.entryDate}</span>
                          {getStatusBadge(entry.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-blue-500" />
                  Account Summary by Type
                </CardTitle>
                <CardDescription>Distribution of accounts</CardDescription>
              </CardHeader>
              <CardContent>
                {accountsLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {['asset', 'liability', 'equity', 'revenue', 'expense'].map((type) => {
                      const count = accounts.filter((a: any) => a.accountType === type || a.account_type === type).length;
                      return (
                        <div key={type} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-3">
                            {getAccountTypeBadge(type)}
                            <span className="capitalize">{type}</span>
                          </div>
                          <span className="font-semibold">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Chart of Accounts Tab */}
        <TabsContent value="accounts" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Chart of Accounts</CardTitle>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search accounts..."
                      className="pl-10 w-[300px]"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Account
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {accountsLoading ? (
                <div className="space-y-3">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No accounts found
                        </TableCell>
                      </TableRow>
                    ) : (
                      accounts.map((account: any) => (
                        <TableRow key={account.id} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-mono font-medium">{account.code}</TableCell>
                          <TableCell>{account.name}</TableCell>
                          <TableCell>{getAccountTypeBadge(account.accountType || account.account_type)}</TableCell>
                          <TableCell>
                            {account.isActive || account.is_active ? (
                              <Badge className="bg-emerald-500/10 text-emerald-500">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Journal Entries Tab */}
        <TabsContent value="journal-entries" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Journal Entries</CardTitle>
                <div className="flex gap-2">
                  <Select>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="posted">Posted</SelectItem>
                      <SelectItem value="reversed">Reversed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {entriesLoading ? (
                <div className="space-y-3">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entry #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journalEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No journal entries found
                        </TableCell>
                      </TableRow>
                    ) : (
                      journalEntries.map((entry: any) => (
                        <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-medium">{entry.entryNumber || entry.entry_number}</TableCell>
                          <TableCell>{entry.entryDate || entry.entry_date}</TableCell>
                          <TableCell className="max-w-[300px] truncate">{entry.description}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(entry.totalDebit || entry.total_debit || 0)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(entry.totalCredit || entry.total_credit || 0)}</TableCell>
                          <TableCell>{getStatusBadge(entry.status)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-blue-500/10">
                    <FileSpreadsheet className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Trial Balance</h3>
                    <p className="text-sm text-muted-foreground">Account balances summary</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-emerald-500/10">
                    <TrendingUp className="h-6 w-6 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Income Statement</h3>
                    <p className="text-sm text-muted-foreground">Revenue and expenses</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-purple-500/10">
                    <BarChart3 className="h-6 w-6 text-purple-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Balance Sheet</h3>
                    <p className="text-sm text-muted-foreground">Assets, liabilities, equity</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-amber-500/10">
                    <DollarSign className="h-6 w-6 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Cash Flow</h3>
                    <p className="text-sm text-muted-foreground">Cash movements</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-red-500/10">
                    <BookOpen className="h-6 w-6 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">General Ledger</h3>
                    <p className="text-sm text-muted-foreground">Detailed transactions</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-cyan-500/10">
                    <Calendar className="h-6 w-6 text-cyan-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Aging Report</h3>
                    <p className="text-sm text-muted-foreground">AR/AP aging analysis</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

