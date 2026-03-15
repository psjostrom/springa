export function WidgetCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#1d1828] rounded-xl border border-[#2e293c] overflow-hidden">
      {children}
    </div>
  );
}
