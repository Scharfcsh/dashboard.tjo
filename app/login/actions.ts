"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, deleteSession } from "@/lib/auth/session";
import { authSettings, safeNextPath } from "@/lib/auth/token";
import { safeEqual } from "@/lib/http/auth";
import { allowRequest, clientIp } from "@/lib/http/rate-limit";

// Single-user sign-in. The credentials are DASHBOARD_EMAIL and
// DASHBOARD_PASSWORD from the environment; there is no user table.

export interface LoginState {
  error: string | null;
}

const ATTEMPTS_PER_MINUTE = 5;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(320),
  password: z.string().max(1024),
  next: z.string().max(2048).optional(),
});

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const settings = authSettings();
  if (!settings) return { error: "Sign-in is not configured on this server." };

  if (!allowRequest(`login:${clientIp(await headers())}`, ATTEMPTS_PER_MINUTE)) {
    return { error: "Too many attempts. Wait a minute and try again." };
  }

  const parsed = loginSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    next: form.get("next") ?? undefined,
  });
  // One message for every failure, so the form does not reveal which part was wrong.
  const invalid = { error: "Incorrect email or password." };
  if (!parsed.success) return invalid;

  const emailOk = safeEqual(parsed.data.email, settings.email);
  const passwordOk = safeEqual(parsed.data.password, settings.password);
  if (!emailOk || !passwordOk) return invalid;

  await createSession();
  redirect(safeNextPath(parsed.data.next));
}

export async function logoutAction(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
