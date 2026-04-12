"use client";
import type { UserSettings } from "@/lib/settings";

interface ZonesTabProps {
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
}

export function ZonesTab(props: ZonesTabProps) {
  void props;
  return <div className="text-muted">Zones settings coming soon</div>;
}
