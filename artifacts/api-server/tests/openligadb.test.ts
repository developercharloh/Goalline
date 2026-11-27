import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOpenLigaMatches } from "../src/lib/openligadb.ts";

test("OpenLigaDB fixtures are filtered by the selected window and converted to Nairobi time", () => {
  const now = new Date("2026-11-27T12:00:00.000Z");
  const fixtures = normalizeOpenLigaMatches("bl1", [
    {
      matchID: 123,
      matchDateTimeUTC: "2026-11-27T19:30:00.000Z",
      matchIsFinished: false,
      leagueName: "1. Bundesliga",
      team1: { teamName: "Home FC" },
      team2: { teamName: "Away FC" },
    },
    {
      matchID: 124,
      matchDateTimeUTC: "2026-11-27T18:00:00.000Z",
      matchIsFinished: true,
      team1: { teamName: "Finished Home" },
      team2: { teamName: "Finished Away" },
    },
    {
      matchID: 125,
      matchDateTimeUTC: "2026-12-02T18:00:00.000Z",
      matchIsFinished: false,
      team1: { teamName: "Too Far Home" },
      team2: { teamName: "Too Far Away" },
    },
  ], 3, now);

  assert.equal(fixtures.length, 1);
  assert.deepEqual(fixtures[0], {
    fixtureId: "openligadb:bl1:123",
    competition: "1. Bundesliga",
    matchDate: "2026-11-27",
    kickoff: "22:30",
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    suggestedSelection: null,
    rationale: "Fixture dates and teams from OpenLigaDB. Choose a prediction and verify odds manually.",
  });
});

test("OpenLigaDB malformed fixtures are skipped safely", () => {
  const fixtures = normalizeOpenLigaMatches("bl1", [{
    matchID: 1,
    matchDateTimeUTC: "not-a-date",
    team1: { teamName: "Home FC" },
    team2: { teamName: "Away FC" },
  }], 3, new Date("2026-11-27T12:00:00.000Z"));

  assert.deepEqual(fixtures, []);
});
