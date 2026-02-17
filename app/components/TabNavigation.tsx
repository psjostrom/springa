import { CalendarDays, TrendingUp, ClipboardList, type LucideIcon } from "lucide-react";

type Tab = "planner" | "calendar" | "progress";

interface TabNavigationProps {
	activeTab: Tab;
	onTabChange: (tab: Tab) => void;
}

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
	{ key: "calendar", label: "Calendar", icon: CalendarDays },
	{ key: "progress", label: "Progress", icon: TrendingUp },
	{ key: "planner", label: "Planner", icon: ClipboardList },
];

export function TabNavigation({
	activeTab,
	onTabChange,
}: TabNavigationProps) {
	return (
		<>
			{/* Desktop: horizontal text tabs in header */}
			<div className="hidden md:flex gap-2 border-b border-slate-200 mb-6">
				{TABS.map(({ key, label }) => (
					<button
						key={key}
						onClick={() => onTabChange(key)}
						className={`px-6 py-3 font-medium transition-colors relative ${
							activeTab === key
								? "text-slate-900"
								: "text-slate-500 hover:text-slate-700"
						}`}
					>
						{label}
						{activeTab === key && (
							<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900"></div>
						)}
					</button>
				))}
			</div>

			{/* Mobile: fixed bottom tab bar with icons */}
			<nav className="flex md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
				{TABS.map(({ key, label, icon: Icon }) => (
					<button
						key={key}
						onClick={() => onTabChange(key)}
						className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
							activeTab === key
								? "text-slate-900"
								: "text-slate-400"
						}`}
					>
						<Icon size={22} strokeWidth={activeTab === key ? 2.5 : 2} />
						<span className="text-[10px] font-medium">{label}</span>
					</button>
				))}
			</nav>
		</>
	);
}
