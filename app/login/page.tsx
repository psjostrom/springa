import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl p-8 max-w-sm w-full shadow-lg shadow-brand/10 border border-border text-center">
        <svg className="w-14 h-14 mx-auto mb-3" viewBox="0 0 432 474" xmlns="http://www.w3.org/2000/svg">
          <path d="M 357.8,42.9 L 196.9,264.7 A 75,75 0 1,1 106.3,151.8 Z" fill="var(--color-brand)"/>
          <path d="M 72.2,461.1 L 233.1,239.3 A 75,75 0 1,1 323.7,352.2 Z" fill="var(--color-brand)"/>
        </svg>
        <h1 className="text-2xl font-[family-name:var(--font-sora)] font-extrabold text-brand tracking-tight mb-2">springa</h1>
        <p className="text-muted text-sm mb-6">
          Sign in to access your training planner
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full py-3 px-4 bg-brand text-white rounded-lg font-medium hover:bg-brand-hover transition shadow-lg shadow-brand/20"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
