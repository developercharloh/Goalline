export const DEFAULT_PAID_TIP_ACCESS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const PAID_TIP_ACCESS_DURATION_MS = DEFAULT_PAID_TIP_ACCESS_DURATION_MS;

const packageDurationsInDays: Record<string, number> = {
  "daily-vip": 1,
  "weekly-premium-vip": 7,
  "monthly-vip": 30,
  "weekly-multibet": 7,
};

export function tipPackageDurationDays(packageId: string): number {
  return packageDurationsInDays[packageId] ?? 7;
}

export function tipAccessExpiresAt(purchasedAt: Date, packageId?: string): Date {
  const durationMs = packageId
    ? tipPackageDurationDays(packageId) * 24 * 60 * 60 * 1000
    : DEFAULT_PAID_TIP_ACCESS_DURATION_MS;
  return new Date(purchasedAt.getTime() + durationMs);
}

export function hasActiveTipAccess(
  purchase: { createdAt: Date; packageId?: string } | null | undefined,
  priceCents: number,
  now = new Date(),
  packageId?: string,
): boolean {
  if (!purchase) return false;
  if (priceCents <= 0) return true;
  return tipAccessExpiresAt(purchase.createdAt, packageId ?? purchase.packageId).getTime() > now.getTime();
}
