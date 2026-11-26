import assert from "node:assert/strict";
import test from "node:test";
import { suggestFixtureSelection } from "../src/lib/football-data.ts";

test("fixture suggestions favor the stronger side and account for home advantage", () => {
  const strongHome = {
    team: { id: 1 },
    playedGames: 5,
    points: 12,
    goalDifference: 8,
    form: "W,W,W,D,W",
  };
  const weakerAway = {
    team: { id: 2 },
    playedGames: 5,
    points: 3,
    goalDifference: -6,
    form: "L,L,D,L,L",
  };
  assert.equal(suggestFixtureSelection(strongHome, weakerAway), "Home win");
  assert.equal(suggestFixtureSelection(weakerAway, strongHome), "Away win");
});

test("fixture suggestions return no pick without usable standings", () => {
  assert.equal(suggestFixtureSelection(undefined, undefined), null);
  assert.equal(suggestFixtureSelection(
    { team: { id: 1 }, playedGames: 0, points: 0, goalDifference: 0 },
    { team: { id: 2 }, playedGames: 3, points: 4, goalDifference: 0 },
  ), null);
});
