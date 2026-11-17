export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startIdleSweeper } = await import("@/lib/sandbox/idle-sweeper");
  startIdleSweeper();
  const { startLogRetention } = await import("@/lib/logs/retention");
  startLogRetention();
}
