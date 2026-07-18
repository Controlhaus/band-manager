/**
 * Next.js instrumentation hook — starts the deadline-reminder scheduler once
 * on server boot (Node runtime only). No-op unless ENABLE_SCHEDULER=true.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
