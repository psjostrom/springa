export function WidgetCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      {children}
    </div>
  );
}
