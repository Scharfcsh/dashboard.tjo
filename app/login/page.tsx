import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/LoginForm";
import { Logo } from "@/components/layout/Logo";
import { getSession } from "@/lib/auth/session";
import { authSettings, safeNextPath } from "@/lib/auth/token";

export const metadata = { title: "Sign in · TopJobOffer" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNextPath((await searchParams).next);
  if (await getSession()) redirect(next);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <section className="card px-6 py-7" aria-labelledby="login-title">
          <h1 id="login-title" className="text-lg font-semibold text-gray-900">
            Sign in
          </h1>
          <p className="mt-1 mb-5 text-xs text-slate-500">Revenue OS is for the TopJobOffer team only.</p>
          <LoginForm next={next} configured={authSettings() !== null} />
        </section>
      </div>
    </main>
  );
}
