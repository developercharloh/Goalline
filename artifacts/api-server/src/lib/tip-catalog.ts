import { db, tipEntries, tipPackages } from "@workspace/db";

// This is inserted once as an explicitly illustrative starter package. All
// subsequent public and admin reads come from the database.
export const tipCatalog = [
  {
    id: "champions-league",
    title: "Champions League Top Picks",
    description: "Expert picks for today's matches",
    price: 10,
    isSample: true,
    matchCount: 3,
    tips: [
      { match: "Man City vs Liverpool", prediction: "Over 2.5 Goals", league: "Premier League" },
      { match: "Real Madrid vs Barcelona", prediction: "Both Teams to Score", league: "La Liga" },
      { match: "PSG vs Marseille", prediction: "1X", league: "Ligue 1" },
    ],
  },
];

export async function ensureTipCatalogSeed(): Promise<void> {
  const starter = tipCatalog[0];
  await db.transaction(async (tx) => {
    const [created] = await tx.insert(tipPackages).values({
      id: starter.id,
      title: starter.title,
      description: starter.description,
      priceCents: Math.round(starter.price * 100),
      status: "published",
      isSample: true,
    }).onConflictDoNothing().returning({ id: tipPackages.id });
    if (!created) return;
    await tx.insert(tipEntries).values(starter.tips.map((tip, position) => ({
      id: `${starter.id}-${position + 1}`,
      packageId: starter.id,
      position,
      ...tip,
    })));
  });
}
