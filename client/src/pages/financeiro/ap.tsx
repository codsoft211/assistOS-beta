import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, CheckSquare, ClipboardCheck } from "lucide-react";
import VendorBillsList from "./vendor-bills";
import ThreeWayMatchingList from "./three-way-matching";
import ApprovalsList from "./approvals";

type APOption = "vendor-bills" | "three-way-matching" | "approvals";

export default function APPage() {
  const { t } = useTranslation('financeiro');
  const [selectedOption, setSelectedOption] = useState<APOption>("vendor-bills");

  const apOptions = [
    { id: "vendor-bills" as APOption, label: t('ap.menu.vendorBills'), icon: Receipt },
    { id: "three-way-matching" as APOption, label: t('ap.menu.threeWayMatching'), icon: CheckSquare },
    { id: "approvals" as APOption, label: t('ap.menu.approvals'), icon: ClipboardCheck },
  ];

  const renderContent = () => {
    switch (selectedOption) {
      case "vendor-bills":
        return <VendorBillsList />;
      case "three-way-matching":
        return <ThreeWayMatchingList />;
      case "approvals":
        return <ApprovalsList />;
      default:
        return null;
    }
  };

  const selectedLabel = apOptions.find(opt => opt.id === selectedOption)?.label || t('ap.menu.vendorBills');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-ap-title">{t('ap.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('ap.description')}</p>
          </div>
          <Select value={selectedOption} onValueChange={(value) => setSelectedOption(value as APOption)}>
            <SelectTrigger className="w-64" data-testid="select-ap-menu">
              <SelectValue placeholder={selectedLabel} />
            </SelectTrigger>
            <SelectContent>
              {apOptions.map((option) => (
                <SelectItem key={option.id} value={option.id} data-testid={`select-ap-${option.id}`}>
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
