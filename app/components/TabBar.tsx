"use client";

interface Tab<T extends string> {
  id: T;
  label: string;
}

interface TabBarProps<T extends string> {
  tabs: readonly Tab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
}

export function TabBar<T extends string>({ tabs, activeTab, onTabChange }: TabBarProps<T>) {
  return (
    <div className="flex border-b border-border" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => { onTabChange(tab.id); }}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? "text-brand border-b-2 border-brand"
              : "text-muted hover:text-text"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
