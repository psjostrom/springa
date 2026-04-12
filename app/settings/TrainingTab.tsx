"use client";
import type { UserSettings } from "@/lib/settings";

interface TrainingTabProps {
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
}

export function TrainingTab(props: TrainingTabProps) {
  void props;
  return <div className="text-muted">Training settings coming soon</div>;
}
