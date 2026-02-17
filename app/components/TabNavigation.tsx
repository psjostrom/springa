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
			<div className="hidden md:flex gap-2 border-b border-[#3d2b5a] mb-6">
				{TABS.map(({ key, label }) => (
					<button
						key={key}
						onClick={() => onTabChange(key)}
						className={`px-6 py-3 font-medium transition-colors relative ${
							activeTab === key
								? "text-[#ff69b4]"
								: "text-[#c4b5fd] hover:text-white"
						}`}
					>
						{label}
						{activeTab === key && (
							<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ff2d95] shadow-[0_0_8px_#ff2d95]"></div>
						)}
					</button>
				))}
			</div>

			{/* Mobile: fixed bottom tab bar with icons */}
			<nav className="flex md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#1e1535] border-t border-[#3d2b5a]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
				{TABS.map(({ key, label, icon: Icon }) => (
					<button
						key={key}
						onClick={() => onTabChange(key)}
						className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
							activeTab === key
								? "text-[#ff69b4]"
								: "text-[#c4b5fd]"
						}`}
					>
						<Icon size={22} strokeWidth={activeTab === key ? 2.5 : 2} />
						<span className="text-sm font-medium">{label}</span>
					</button>
				))}
			</nav>
		</>
	);
}
