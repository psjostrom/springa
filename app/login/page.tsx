import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-8 max-w-sm w-full shadow-lg text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Springa</h1>
        <p className="text-slate-600 text-sm mb-8">
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
            className="w-full py-3 px-4 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
