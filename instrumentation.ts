// Runs once per server instance (Next.js instrumentation hook).
// Background jobs only run in the Node.js runtime and only when JOBS_ENABLED=true.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!["1", "true", "yes", "on"].includes((process.env.JOBS_ENABLED ?? "").toLowerCase())) return;
  const { startScheduler } = await import("./lib/jobs/scheduler");
  startScheduler();
}
