export interface AdminRequestContext {
  probetAccountId?: string;
  probetAccountRole?: "user" | "admin";
}

export function hasAdminAccess(context: AdminRequestContext): boolean {
  return Boolean(context.probetAccountId && context.probetAccountRole === "admin");
}

export function requireAdmin(
  req: AdminRequestContext,
  res: { status(code: number): { json(body: { error: string }): void } },
  next: () => void,
): void {
  if (!req.probetAccountId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  if (!hasAdminAccess(req)) {
    res.status(403).json({ error: "Administrator access is required." });
    return;
  }
  next();
}
