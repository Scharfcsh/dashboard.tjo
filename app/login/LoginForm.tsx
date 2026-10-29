"use client";

import { useActionState } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { loginAction, type LoginState } from "@/app/login/actions";

const INITIAL: LoginState = { error: null };

const input =
  "focus-ring block h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-gray-900 placeholder:text-slate-400 disabled:opacity-60";

export function LoginForm({ next, configured }: { next: string; configured: boolean }) {
  const [state, action, pending] = useActionState(loginAction, INITIAL);

  if (!configured) {
    return (
      <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        Sign-in is not configured. Set DASHBOARD_EMAIL, DASHBOARD_PASSWORD and SESSION_SECRET in the server environment,
        then restart it.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-xs font-medium text-slate-700">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required disabled={pending} className={input} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-xs font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          className={input}
        />
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="focus-ring inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <LockKeyhole className="size-4" aria-hidden />}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
