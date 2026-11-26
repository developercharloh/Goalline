import { and, ne, notInArray } from "drizzle-orm";
import { db, tipPackages } from "@workspace/db";

export const vipTipPackages = [
  {
    id: "daily-vip",
    title: "Daily VIP",
    description: "VIP predictions for one day.",
    price: 40,
    durationDays: 1,
    bestValue: false,
  },
  {
    id: "weekly-premium-vip",
    title: "Weekly VIP",
    description: "Seven days of VIP predictions. Best value.",
    price: 100,
    durationDays: 7,
    bestValue: true,
  },
  {
    id: "monthly-vip",
    title: "Monthly VIP",
    description: "VIP predictions for 30 days.",
    price: 300,
    durationDays: 30,
    bestValue: false,
  },
] as const;

export const vipTipPackageIds: string[] = vipTipPackages.map((pkg) => pkg.id);

export function vipPackageMetadata(packageId: string) {
  return vipTipPackages.find((pkg) => pkg.id === packageId) ?? null;
}

export async function ensureTipCatalogSeed(): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const pkg of vipTipPackages) {
      await tx.insert(tipPackages).values({
        id: pkg.id,
        title: pkg.title,
        description: pkg.description,
        priceCents: pkg.price * 100,
        status: "published",
        isSample: false,
      }).onConflictDoUpdate({
        target: tipPackages.id,
        set: {
          title: pkg.title,
          description: pkg.description,
          priceCents: pkg.price * 100,
          status: "published",
          isSample: false,
          updatedAt: now,
        },
      });
    }

    await tx.update(tipPackages)
      .set({ status: "archived", updatedAt: now })
      .where(and(
        notInArray(tipPackages.id, [...vipTipPackageIds]),
        ne(tipPackages.status, "archived"),
      ));
  });
}
