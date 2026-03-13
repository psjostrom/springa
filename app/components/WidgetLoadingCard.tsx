import { Loader2 } from "lucide-react";

export function WidgetLoadingCard({ label }: { label: string }) {
  return (
    <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6">
      <div className="flex items-center justify-center py-8 text-[#b8a5d4]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
