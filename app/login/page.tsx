import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0d0a1a] flex items-center justify-center p-4">
      <div className="bg-[#1e1535] rounded-xl p-8 max-w-sm w-full shadow-lg shadow-[#ff2d95]/10 border border-[#3d2b5a] text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Springa</h1>
        <p className="text-[#a78bca] text-sm mb-8">
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
            className="w-full py-3 px-4 bg-[#ff2d95] text-white rounded-lg font-medium hover:bg-[#e0207a] transition shadow-lg shadow-[#ff2d95]/20"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
