import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, CreditCard, Bell } from "lucide-react";
import InvoicesList from "./invoices";
import CreditNotesList from "./credit-notes";
import DunningList from "./dunning";

type AROption = "invoices" | "credit-notes" | "dunning";

export default function ARPage() {
  const { t } = useTranslation('financeiro');
  const [selectedOption, setSelectedOption] = useState<AROption>("invoices");

  const arOptions = [
    { id: "invoices" as AROption, label: t('ar.menu.invoices'), icon: FileText },
    { id: "credit-notes" as AROption, label: t('ar.menu.creditNotes'), icon: CreditCard },
    { id: "dunning" as AROption, label: t('ar.menu.dunning'), icon: Bell },
  ];

  const renderContent = () => {
    switch (selectedOption) {
      case "invoices":
        return <InvoicesList />;
      case "credit-notes":
        return <CreditNotesList />;
      case "dunning":
        return <DunningList />;
      default:
        return null;
    }
  };

  const selectedLabel = arOptions.find(opt => opt.id === selectedOption)?.label || t('ar.menu.invoices');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-ar-title">{t('ar.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('ar.description')}</p>
          </div>
          <Select value={selectedOption} onValueChange={(value) => setSelectedOption(value as AROption)}>
            <SelectTrigger className="w-64" data-testid="select-ar-menu">
              <SelectValue placeholder={selectedLabel} />
            </SelectTrigger>
            <SelectContent>
              {arOptions.map((option) => (
                <SelectItem key={option.id} value={option.id} data-testid={`select-ar-${option.id}`}>
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
