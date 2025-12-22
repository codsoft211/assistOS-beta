import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark, TrendingUp, GitCompare } from "lucide-react";
import CashflowForecast from "./cashflow-forecast";
import ReconciliationList from "./reconciliation";

type TreasuryOption = "bank-accounts" | "cashflow-forecast" | "reconciliation";

function BankAccountsList() {
  const { t } = useTranslation('financeiro');
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5" />
          {t('treasury.bankAccounts.title')}
        </CardTitle>
        <CardDescription>
          {t('treasury.bankAccounts.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg" data-testid="empty-bank-accounts">
          <Landmark className="mx-auto h-12 w-12 mb-3 opacity-50" />
          <p className="text-sm">{t('treasury.bankAccounts.empty')}</p>
          <p className="text-xs mt-1">{t('treasury.bankAccounts.emptySubtext')}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TreasuryPage() {
  const { t } = useTranslation('financeiro');
  const [selectedOption, setSelectedOption] = useState<TreasuryOption>("bank-accounts");

  const treasuryOptions = [
    { id: "bank-accounts" as TreasuryOption, label: t('treasury.menu.bankAccounts'), icon: Landmark },
    { id: "cashflow-forecast" as TreasuryOption, label: t('treasury.menu.cashflowForecast'), icon: TrendingUp },
    { id: "reconciliation" as TreasuryOption, label: t('treasury.menu.reconciliation'), icon: GitCompare },
  ];

  const renderContent = () => {
    switch (selectedOption) {
      case "bank-accounts":
        return <BankAccountsList />;
      case "cashflow-forecast":
        return <CashflowForecast />;
      case "reconciliation":
        return <ReconciliationList />;
      default:
        return null;
    }
  };

  const selectedLabel = treasuryOptions.find(opt => opt.id === selectedOption)?.label || t('treasury.menu.bankAccounts');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-treasury-title">{t('treasury.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('treasury.description')}</p>
          </div>
          <Select value={selectedOption} onValueChange={(value) => setSelectedOption(value as TreasuryOption)}>
            <SelectTrigger className="w-64" data-testid="select-treasury-menu">
              <SelectValue placeholder={selectedLabel} />
            </SelectTrigger>
            <SelectContent>
              {treasuryOptions.map((option) => (
                <SelectItem key={option.id} value={option.id} data-testid={`select-treasury-${option.id}`}>
                  <div className="flex items-center gap-2">
                    <option.icon className="h-4 w-4" />
                    {option.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
