// packages/functions/src/auth/isDevAdmin.ts
export function isDevAdminEnabled(): boolean {
  // Keep it dead simple; you can harden later.
  return (process.env.DEV_ADMIN_MODE ?? "").toLowerCase() === "true";
}
