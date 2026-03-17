import { Loader2 } from "lucide-react";

export function WidgetLoadingCard({ label }: { label: string }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-6">
      <div className="flex items-center justify-center py-8 text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
