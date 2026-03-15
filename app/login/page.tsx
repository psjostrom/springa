import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#13101c] flex items-center justify-center p-4">
      <div className="bg-[#1d1828] rounded-xl p-8 max-w-sm w-full shadow-lg shadow-[#f23b94]/10 border border-[#2e293c] text-center">
        <h1 className="text-2xl font-[family-name:var(--font-sora)] font-extrabold text-[#f23b94] tracking-tight mb-2">springa</h1>
        <p className="text-[#af9ece] text-sm mb-2">
          Sign in to access your training planner
        </p>
        <p className="text-4xl font-[family-name:var(--font-sora)] font-extrabold text-[#f23b94] mb-6">s</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full py-3 px-4 bg-[#f23b94] text-white rounded-lg font-medium hover:bg-[#d42f7e] transition shadow-lg shadow-[#f23b94]/20"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
