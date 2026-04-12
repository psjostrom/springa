"use client";
import type { UserSettings } from "@/lib/settings";

interface PlanTabProps {
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
}

export function PlanTab(props: PlanTabProps) {
  void props;
  return <div className="text-muted">Plan settings coming soon</div>;
}
