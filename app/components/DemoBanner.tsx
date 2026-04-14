"use client";

import Link from "next/link";

export function DemoBanner() {
  return (
    <div className="bg-brand/10 border-b border-brand/20 px-4 py-1.5 text-center text-sm text-brand flex items-center justify-center gap-2">
      <span>Demo mode</span>
      <Link
        href="/login"
        className="underline underline-offset-2 hover:text-brand-hover transition"
      >
        Sign in
      </Link>
    </div>
  );
}
