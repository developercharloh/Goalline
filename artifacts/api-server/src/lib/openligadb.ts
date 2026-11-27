const API_BASE_URL = "https://api.openligadb.de";
const CACHE_TTL_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const SUPPORTED_COMPETITIONS = [
  { shortcut: "bl1", label: "German Bundesliga" },
  { shortcut: "bl2", label: "German 2. Bundesliga" },
  { shortcut: "bl3", label: "German 3. Liga" },
  { shortcut: "dfb", label: "DFB Pokal" },
  { shortcut: "ucl", label: "UEFA Champions League" },
  { shortcut: "pl", label: "Premier League" },
  { shortcut: "ERE", label: "Eredivisie" },
  { shortcut: "öbl", label: "Austrian Bundesliga" },
  { shortcut: "ffb1", label: "German Women's Bundesliga" },
  { shortcut: "WCL", label: "UEFA Women's Champions League" },
] as const;

type OpenLigaMatch = {
  matchID?: number;
  matchDateTimeUTC?: string;
  matchIsFinished?: boolean;
  leagueName?: string;
  team1?: { teamName?: string };
  team2?: { teamName?: string };
};

export type OpenLigaFixture = {
  fixtureId: string;
  competition: string;
  matchDate: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  suggestedSelection: null;
  rationale: string;
};

export type OpenLigaFixtureResult = {
  fixtures: OpenLigaFixture[];
  unavailableCompetitions: string[];
  sourceNote: string;
};

type CacheItem = { expiresAt: number; value: OpenLigaFixtureResult };
const fixtureCache = new Map<string, CacheItem>();

function localFixtureDateTime(utcDate: string): { matchDate: string; kickoff: string } | null {
  const date = new Date(utcDate);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    matchDate: `${values.year}-${values.month}-${values.day}`,
    kickoff: `${values.hour}:${values.minute}`,
  };
}

export function normalizeOpenLigaMatches(
  shortcut: string,
  matches: OpenLigaMatch[],
  lookaheadDays: number,
  now: Date = new Date(),
): OpenLigaFixture[] {
  const start = now.getTime();
  const end = start + lookaheadDays * DAY_MS;
  return matches.flatMap((match) => {
    const kickoffMs = Date.parse(match.matchDateTimeUTC ?? "");
    const homeTeam = match.team1?.teamName?.trim();
    const awayTeam = match.team2?.teamName?.trim();
    const local = match.matchDateTimeUTC ? localFixtureDateTime(match.matchDateTimeUTC) : null;
    if (
      !Number.isFinite(match.matchID) ||
      !Number.isFinite(kickoffMs) ||
      kickoffMs < start ||
      kickoffMs > end ||
      match.matchIsFinished === true ||
      !homeTeam ||
      !awayTeam ||
      !local
    ) return [];
    return [{
      fixtureId: `openligadb:${shortcut}:${match.matchID}`,
      competition: match.leagueName?.trim() || shortcut,
      ...local,
      homeTeam,
      awayTeam,
      suggestedSelection: null,
      rationale: "Fixture dates and teams from OpenLigaDB. Choose a prediction and verify odds manually.",
    }];
  });
}

async function fixturesForCompetition(
  shortcut: string,
  label: string,
  lookaheadDays: number,
  now: Date,
): Promise<{ fixtures: OpenLigaFixture[]; unavailable: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/getmatchdata/${encodeURIComponent(shortcut)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { fixtures: [], unavailable: label };
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return { fixtures: [], unavailable: label };
    return {
      fixtures: normalizeOpenLigaMatches(shortcut, payload as OpenLigaMatch[], lookaheadDays, now),
      unavailable: null,
    };
  } catch {
    return { fixtures: [], unavailable: label };
  }
}

export async function configureOpenLigaDbFixtures(lookaheadDays: number): Promise<OpenLigaFixtureResult> {
  const now = new Date();
  const cacheKey = `${now.toISOString().slice(0, 10)}:${lookaheadDays}`;
  const cached = fixtureCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const results = await Promise.all(SUPPORTED_COMPETITIONS.map(({ shortcut, label }) =>
    fixturesForCompetition(shortcut, label, lookaheadDays, now),
  ));
  const fixtures = results
    .flatMap((result) => result.fixtures)
    .sort((a, b) => `${a.matchDate} ${a.kickoff}`.localeCompare(`${b.matchDate} ${b.kickoff}`));
  const unavailableCompetitions = results
    .flatMap((result) => result.unavailable ? [result.unavailable] : []);
  const sourceNote = [
    "OpenLigaDB provides keyless fixtures for selected European competitions; it does not provide predictions or odds.",
    unavailableCompetitions.length
      ? `Could not load these OpenLigaDB competitions: ${unavailableCompetitions.join(", ")}.`
      : "",
  ].filter(Boolean).join(" ");
  const result = { fixtures, unavailableCompetitions, sourceNote };
  fixtureCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
  return result;
}
