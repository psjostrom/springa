import { Loader2 } from "lucide-react";

export function WidgetLoadingCard({ label }: { label: string }) {
  return (
    <div className="bg-[#1d1828] rounded-xl border border-[#2e293c] p-6">
      <div className="flex items-center justify-center py-8 text-[#af9ece]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
