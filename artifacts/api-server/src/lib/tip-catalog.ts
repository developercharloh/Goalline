import { and, ne, notInArray } from "drizzle-orm";
import { db, tipPackages } from "@workspace/db";

export const weeklyTipPackages = [
  {
    id: "free-vip",
    title: "Free VIP",
    description: "Free weekly VIP multibet.",
    price: 0,
  },
  {
    id: "weekly-multibet",
    title: "Weekly Multibet",
    description: "Weekly multibet package.",
    price: 50,
  },
  {
    id: "weekly-premium-vip",
    title: "Weekly Premium VIP",
    description: "Weekly premium VIP package.",
    price: 70,
  },
] as const;

export const weeklyTipPackageIds: string[] = weeklyTipPackages.map((pkg) => pkg.id);

export async function ensureTipCatalogSeed(): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const pkg of weeklyTipPackages) {
      await tx.insert(tipPackages).values({
        id: pkg.id,
        title: pkg.title,
        description: pkg.description,
        priceCents: pkg.price * 100,
        status: "published",
        isSample: false,
      }).onConflictDoNothing();
    }

    await tx.update(tipPackages)
      .set({ status: "archived", updatedAt: now })
      .where(and(
        notInArray(tipPackages.id, [...weeklyTipPackageIds]),
        ne(tipPackages.status, "archived"),
      ));
  });
}
