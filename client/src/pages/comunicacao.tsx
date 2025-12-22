import { CommunicationSettings } from "@/components/settings/sections/CommunicationSettings";

export default function ComunicacaoPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <CommunicationSettings />
      </div>
    </div>
  );
}
