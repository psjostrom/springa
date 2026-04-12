"use client";
import type { UserSettings } from "@/lib/settings";

interface AccountTabProps {
  email: string;
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
}

export function AccountTab(props: AccountTabProps) {
  void props;
  return <div className="text-muted">Account settings coming soon</div>;
}
