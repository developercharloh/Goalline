export const PAID_TIP_ACCESS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function tipAccessExpiresAt(purchasedAt: Date): Date {
  return new Date(purchasedAt.getTime() + PAID_TIP_ACCESS_DURATION_MS);
}

export function hasActiveTipAccess(
  purchase: { createdAt: Date } | null | undefined,
  priceCents: number,
  now = new Date(),
): boolean {
  if (!purchase) return false;
  if (priceCents <= 0) return true;
  return tipAccessExpiresAt(purchase.createdAt).getTime() > now.getTime();
}
