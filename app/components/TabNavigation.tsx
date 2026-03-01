import { useState } from "react";
import { Monitor, Activity, Bot, Layers, type LucideIcon } from "lucide-react";

type Tab = "planner" | "calendar" | "intel" | "coach";

interface TabNavigationProps {
	activeTab: Tab;
	onTabChange: (tab: Tab) => void;
}

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
	{ key: "calendar", label: "Calendar", icon: Monitor },
	{ key: "intel", label: "Intel", icon: Activity },
	{ key: "coach", label: "Coach", icon: Bot },
	{ key: "planner", label: "Planner", icon: Layers },
];

export function TabNavigation({
	activeTab,
	onTabChange,
}: TabNavigationProps) {
	// Local optimistic state — highlights instantly on click,
	// syncs back from parent when activeTab prop catches up.
	const [localTab, setLocalTab] = useState(activeTab);
	const [prevActiveTab, setPrevActiveTab] = useState(activeTab);
	if (prevActiveTab !== activeTab) {
		setPrevActiveTab(activeTab);
		setLocalTab(activeTab);
	}

	const handleClick = (key: Tab) => {
		setLocalTab(key);
		onTabChange(key);
	};

	return (
		<>
			{/* Desktop: horizontal text tabs in header */}
			<div className="hidden md:flex gap-2 border-b border-[#3d2b5a] mb-6">
				{TABS.map(({ key, label }) => (
					<button
						key={key}
						onClick={() => { handleClick(key); }}
						className={`px-6 py-3 font-medium transition-all relative ${
							localTab === key
								? "text-[#ff69b4]"
								: "text-[#c4b5fd] hover:text-[#00ffff]"
						}`}
					>
						{label}
						{localTab === key && (
							<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ff2d95] shadow-[0_0_8px_#ff2d95]"></div>
						)}
					</button>
				))}
			</div>

			{/* Mobile: fixed bottom tab bar with icons */}
			<nav className="flex md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#1e1535] border-t border-[#3d2b5a] justify-around py-2" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
				{TABS.map(({ key, label, icon: Icon }) => (
					<button
						key={key}
						onClick={() => { handleClick(key); }}
						className={`flex flex-col items-center gap-0.5 px-1 transition-all active:scale-90 ${
							localTab === key
								? "text-[#ff69b4]"
								: "text-[#c4b5fd] hover:text-[#00ffff]"
						}`}
					>
						<Icon size={22} strokeWidth={localTab === key ? 2.5 : 2} style={localTab === key ? { filter: "drop-shadow(0 0 6px #ff69b4) drop-shadow(0 0 12px #ff2d95)" } : undefined} />
						<span className="text-sm font-medium">{label}</span>
					</button>
				))}
			</nav>
		</>
	);
}
