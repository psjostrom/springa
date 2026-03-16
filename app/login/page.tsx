import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#13101c] flex items-center justify-center p-4">
      <div className="bg-[#1d1828] rounded-xl p-8 max-w-sm w-full shadow-lg shadow-[#f23b94]/10 border border-[#2e293c] text-center">
        <svg className="w-14 h-14 mx-auto mb-3" viewBox="0 0 432 474" xmlns="http://www.w3.org/2000/svg">
          <path d="M 357.8,42.9 L 196.9,264.7 A 75,75 0 1,1 106.3,151.8 Z" fill="#f23b94"/>
          <path d="M 72.2,461.1 L 233.1,239.3 A 75,75 0 1,1 323.7,352.2 Z" fill="#f23b94"/>
        </svg>
        <h1 className="text-2xl font-[family-name:var(--font-sora)] font-extrabold text-[#f23b94] tracking-tight mb-2">springa</h1>
        <p className="text-[#af9ece] text-sm mb-6">
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
            className="w-full py-3 px-4 bg-[#f23b94] text-white rounded-lg font-medium hover:bg-[#d42f7e] transition shadow-lg shadow-[#f23b94]/20"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
