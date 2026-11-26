const API_BASE_URL = "https://api.football-data.org/v4";
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_STANDINGS_LOOKUPS = 8;

type ApiMatch = {
  id: number;
  status: string;
  utcDate: string;
  competition?: { id: number; name: string };
  homeTeam?: { id: number; name: string };
  awayTeam?: { id: number; name: string };
};

type StandingRow = {
  team?: { id: number };
  playedGames?: number;
  points?: number;
  goalDifference?: number;
  form?: string | null;
};

type StandingResponse = {
  standings?: Array<{ table?: StandingRow[] }>;
};

type FixtureResponse = {
  fixtures: Array<{
    fixtureId: string;
    competition: string;
    matchDate: string;
    kickoff: string;
    homeTeam: string;
    awayTeam: string;
    suggestedSelection: string | null;
    rationale: string;
  }>;
  unavailableCompetitions: string[];
  sourceNote: string;
};

type CacheItem<T> = { expiresAt: number; value: T };
const standingsCache = new Map<number, CacheItem<Map<number, StandingRow>>>();
const fixturesCache = new Map<string, CacheItem<FixtureResponse>>();

export class FixtureProviderError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

function localFixtureDateTime(utcDate: string): { matchDate: string; kickoff: string } {
  const date = new Date(utcDate);
  if (!Number.isFinite(date.getTime())) throw new FixtureProviderError("The fixture provider returned an invalid kickoff time.", 502);
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

function formPoints(form?: string | null): number | null {
  if (!form) return null;
  const results = form.replaceAll(",", "").replaceAll(" ", "").toUpperCase().slice(-5);
  if (!results) return null;
  return [...results].reduce((points, result) => points + (result === "W" ? 3 : result === "D" ? 1 : 0), 0) / results.length;
}

function teamStrength(row: StandingRow): number | null {
  const played = Number(row.playedGames);
  if (!Number.isFinite(played) || played <= 0) return null;
  const pointsPerGame = Number(row.points ?? 0) / played;
  const goalDifferencePerGame = Number(row.goalDifference ?? 0) / played;
  const recentForm = formPoints(row.form);
  const recentFormPerGame = recentForm ?? pointsPerGame;
  return pointsPerGame * 0.65 + goalDifferencePerGame * 0.1 + recentFormPerGame * 0.25;
}

export function suggestFixtureSelection(
  home: StandingRow | undefined,
  away: StandingRow | undefined,
): string | null {
  if (!home || !away) return null;
  const homeStrength = teamStrength(home);
  const awayStrength = teamStrength(away);
  if (homeStrength == null || awayStrength == null) return null;
  const advantage = homeStrength - awayStrength + 0.22;
  if (advantage >= 0.65) return "Home win";
  if (advantage <= -0.65) return "Away win";
  if (advantage >= 0.18) return "Home or draw (1X)";
  if (advantage <= -0.18) return "Draw or away (X2)";
  return "Draw";
}

async function providerJson<T>(token: string, path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "X-Auth-Token": token,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new FixtureProviderError("The football fixture service could not be reached. Please try again shortly.", 502);
  }
  if (response.status === 429) {
    throw new FixtureProviderError("The free fixture-service request limit was reached. Please wait a minute and try again.", 429);
  }
  if (response.status === 401 || response.status === 403) {
    throw new FixtureProviderError("The fixture-service token was rejected. Check the Football-Data.org token in the Vercel project settings.", 503);
  }
  if (!response.ok) {
    throw new FixtureProviderError("The football fixture service could not return data. Please try again later.", 502);
  }
  return await response.json() as T;
}

function dateInNairobi(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function standingsFor(token: string, competitionId: number): Promise<Map<number, StandingRow>> {
  const cached = standingsCache.get(competitionId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const payload = await providerJson<StandingResponse>(token, `/competitions/${competitionId}/standings`);
  const rows = payload.standings?.flatMap((standing) => standing.table ?? []) ?? [];
  const rowsByTeam = new Map<number, StandingRow>();
  for (const row of rows) {
    const teamId = Number(row.team?.id);
    const strength = teamStrength(row);
    if (Number.isFinite(teamId) && strength != null) rowsByTeam.set(teamId, row);
  }
  standingsCache.set(competitionId, { expiresAt: Date.now() + CACHE_TTL_MS, value: rowsByTeam });
  return rowsByTeam;
}

export async function configureUpcomingFixtures(token: string, lookaheadDays: number): Promise<FixtureResponse> {
  const now = new Date();
  const dateFrom = dateInNairobi(now);
  const dateTo = dateInNairobi(new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000));
  const cacheKey = `${dateFrom}:${dateTo}`;
  const cached = fixturesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const search = new URLSearchParams({ dateFrom, dateTo });
  const payload = await providerJson<{ matches?: ApiMatch[] }>(token, `/matches?${search}`);
  const matches = (payload.matches ?? [])
    .filter((match) => ["SCHEDULED", "TIMED"].includes(match.status))
    .filter((match) => match.competition?.id && match.homeTeam?.id && match.awayTeam?.id && match.utcDate)
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));

  const competitions = [...new Map(matches.map((match) => [match.competition!.id, match.competition!.name])).entries()];
  const standingsByCompetition = new Map<number, Map<number, StandingRow>>();
  const unavailableCompetitions: string[] = [];
  for (const [index, [competitionId, competitionName]] of competitions.entries()) {
    if (index >= MAX_STANDINGS_LOOKUPS) {
      unavailableCompetitions.push(competitionName);
      continue;
    }
    try {
      standingsByCompetition.set(competitionId, await standingsFor(token, competitionId));
    } catch (error) {
      if (error instanceof FixtureProviderError && error.statusCode === 429) {
        unavailableCompetitions.push(competitionName, ...competitions.slice(index + 1).map(([, name]) => name));
        break;
      }
      unavailableCompetitions.push(competitionName);
    }
  }

  const fixtures = matches.map((match) => {
    const competitionId = match.competition!.id;
    const standings = standingsByCompetition.get(competitionId);
    const suggestion = standings
      ? suggestFixtureSelection(
          standings.get(match.homeTeam!.id),
          standings.get(match.awayTeam!.id),
        )
      : null;
    const local = localFixtureDateTime(match.utcDate);
    return {
      fixtureId: String(match.id),
      competition: match.competition!.name,
      ...local,
      homeTeam: match.homeTeam!.name,
      awayTeam: match.awayTeam!.name,
      suggestedSelection: suggestion,
      rationale: suggestion
        ? "Initial suggestion based on current league performance and recent form. Review it before publishing."
        : "No current table data is available for this competition. Choose a prediction manually.",
    };
  });
  const result = {
    fixtures,
    unavailableCompetitions: [...new Set(unavailableCompetitions)],
    sourceNote: "Fixtures come from Football-Data.org. Suggestions use current standings and recent form; review each selection and enter the odds before publishing.",
  };
  fixturesCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
  return result;
}
