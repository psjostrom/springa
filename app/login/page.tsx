import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0d0a1a] flex items-center justify-center p-4">
      <div className="bg-[#1e1535] rounded-xl p-8 max-w-sm w-full shadow-lg shadow-[#e8368f]/10 border border-[#3d2b5a] text-center">
        <h1 className="text-2xl font-[family-name:var(--font-sora)] font-extrabold text-[#e8368f] tracking-tight mb-2">springa</h1>
        <p className="text-[#c4b5fd] text-sm mb-2">
          Sign in to access your training planner
        </p>
        <p className="text-4xl font-[family-name:var(--font-sora)] font-extrabold text-[#e8368f] mb-6">s</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full py-3 px-4 bg-[#e8368f] text-white rounded-lg font-medium hover:bg-[#c52e7a] transition shadow-lg shadow-[#e8368f]/20"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
