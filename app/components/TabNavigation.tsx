type Tab = "planner" | "calendar" | "progress";

interface TabNavigationProps {
	activeTab: Tab;
	onTabChange: (tab: Tab) => void;
}

const TABS: { key: Tab; label: string }[] = [
	{ key: "calendar", label: "Calendar" },
	{ key: "progress", label: "Progress" },
	{ key: "planner", label: "Planner" },
];

export function TabNavigation({
	activeTab,
	onTabChange,
}: TabNavigationProps) {
	return (
		<div className="flex gap-2 border-b border-slate-200 mb-6">
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
	);
}
