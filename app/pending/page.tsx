"use client";

import { signOut } from "next-auth/react";

export default function PendingPage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <svg className="w-20 h-20 mx-auto" viewBox="0 0 432 474" xmlns="http://www.w3.org/2000/svg">
          <path d="M 357.8,42.9 L 196.9,264.7 A 75,75 0 1,1 106.3,151.8 Z" fill="var(--color-brand)"/>
          <path d="M 72.2,461.1 L 233.1,239.3 A 75,75 0 1,1 323.7,352.2 Z" fill="var(--color-brand)"/>
        </svg>

        <h1 className="text-2xl font-[family-name:var(--font-sora)] font-extrabold text-brand tracking-tight">
          springa
        </h1>

        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-text">
            Account Pending Approval
          </h2>

          <p className="text-muted">
            Your account is awaiting approval. You'll be able to access Springa once an admin approves your account.
          </p>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full px-6 py-3 bg-brand-btn hover:bg-brand-hover text-white font-medium rounded-lg transition"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
