import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminTipPackagesQueryKey,
  getGetDashboardQueryKey,
  getGetTipsQueryKey,
  useConfigureAdminFixtures,
  useUpdateAdminTipPackage,
  type AdminTipPackage,
  type AdminTipPackageInput,
  type FixtureSuggestion,
} from "@workspace/api-client-react";
import { Check, LoaderCircle, RefreshCw } from "lucide-react";
import { errMsg } from "@/lib/probet";
import { matchSelectionGroups } from "@/lib/match-selections";

type FixtureDraft = FixtureSuggestion & {
  packageId: string;
  selection: string;
  odds: string;
  included: boolean;
};

function fixtureKey(fixture: Pick<FixtureSuggestion, "matchDate" | "kickoff" | "homeTeam" | "awayTeam">) {
  return `${fixture.matchDate}|${fixture.kickoff}|${fixture.homeTeam.trim().toLowerCase()}|${fixture.awayTeam.trim().toLowerCase()}`;
}

function isSelectionSupported(selection: string | null): selection is string {
  return !!selection && matchSelectionGroups.some((group) => group.options.some((option) => option.value === selection));
}

export function AdminFixtureConfigurator({ packages }: { packages: AdminTipPackage[] }) {
  const configure = useConfigureAdminFixtures();
  const updatePackage = useUpdateAdminTipPackage();
  const queryClient = useQueryClient();
  const [lookaheadDays, setLookaheadDays] = useState(7);
  const [fixtures, setFixtures] = useState<FixtureDraft[]>([]);
  const [totalOddsByPackage, setTotalOddsByPackage] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const defaultPackageId = useMemo(
    () => packages.find((pkg) => pkg.id === "weekly-premium-vip")?.id ?? packages[0]?.id ?? "",
    [packages],
  );
  const existingFixtureKeys = useMemo(
    () => new Set(packages.flatMap((pkg) => pkg.matches.map(fixtureKey))),
    [packages],
  );
  const selectedCount = fixtures.filter((fixture) => fixture.included && !existingFixtureKeys.has(fixtureKey(fixture))).length;
  const selectedByPackage = fixtures.reduce((groups, fixture) => {
    if (fixture.included && !existingFixtureKeys.has(fixtureKey(fixture))) {
      groups.set(fixture.packageId, [...(groups.get(fixture.packageId) ?? []), fixture]);
    }
    return groups;
  }, new Map<string, FixtureDraft[]>());

  function loadFixtures() {
    setMessage("");
    setSavedCount(0);
    configure.mutate({ data: { lookaheadDays } }, {
      onSuccess: (result) => {
        setTotalOddsByPackage({});
        setFixtures(result.fixtures.map((fixture) => ({
          ...fixture,
          packageId: defaultPackageId,
          selection: isSelectionSupported(fixture.suggestedSelection) ? fixture.suggestedSelection : "",
          odds: "",
          included: true,
        })));
        setMessage(result.fixtures.length
          ? `${result.fixtures.length} upcoming fixtures loaded. Review each suggestion and enter odds before saving.`
          : "No upcoming fixtures were found in this date range.");
      },
      onError: (error) => setMessage(errMsg(error)),
    });
  }

  function updateFixture(fixtureId: string, changes: Partial<FixtureDraft>) {
    setFixtures((current) => current.map((fixture) => fixture.fixtureId === fixtureId
      ? { ...fixture, ...changes }
      : fixture));
  }

  async function saveFixtures() {
    setMessage("");
    const selected = fixtures.filter((fixture) =>
      fixture.included && !existingFixtureKeys.has(fixtureKey(fixture)),
    );
    if (!selected.length) {
      setMessage("Choose at least one new fixture to add.");
      return;
    }
    const invalid = selected.find((fixture) =>
      !fixture.packageId || !fixture.selection || !Number.isFinite(Number(fixture.odds)) ||
      Number(fixture.odds) < 1.01 || Number(fixture.odds) > 100_000,
    );
    if (invalid) {
      setMessage("Enter a prediction and valid odds for every selected fixture.");
      return;
    }

    const grouped = new Map<string, FixtureDraft[]>();
    for (const fixture of selected) {
      grouped.set(fixture.packageId, [...(grouped.get(fixture.packageId) ?? []), fixture]);
    }
    const missingTotal = [...grouped.keys()].find((packageId) => {
      const totalOdds = Number(totalOddsByPackage[packageId]);
      return !Number.isFinite(totalOdds) || totalOdds < 1 || totalOdds > 1_000_000_000;
    });
    if (missingTotal) {
      setMessage("Enter the overall odds for each package before saving.");
      return;
    }

    let completed = 0;
    try {
      for (const [packageId, additions] of grouped) {
        const pkg = packages.find((item) => item.id === packageId);
        if (!pkg) throw new Error("A selected VIP package could not be found. Reload and try again.");
        const matches = [
          ...pkg.matches.map((match) => ({
            id: match.id,
            matchDate: match.matchDate,
            kickoff: match.kickoff,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            selection: match.selection,
            odds: match.odds,
          })),
          ...additions.map((fixture) => ({
            matchDate: fixture.matchDate,
            kickoff: fixture.kickoff,
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            selection: fixture.selection,
            odds: Number(fixture.odds),
          })),
        ];
        const input: AdminTipPackageInput = {
          totalOdds: Number(totalOddsByPackage[packageId]),
          stakeLevel: pkg.stakeLevel,
          matches,
        };
        await updatePackage.mutateAsync({ id: packageId, data: input });
        completed += additions.length;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetAdminTipPackagesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetTipsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
      ]);
      setSavedCount(completed);
      setMessage(`${completed} fixture${completed === 1 ? "" : "s"} saved. Check the total odds and package before publishing.`);
    } catch (error) {
      setMessage(completed
        ? `${completed} fixture${completed === 1 ? "" : "s"} saved, but another package could not be updated. Reload and verify the saved fixtures. ${errMsg(error)}`
        : errMsg(error));
    }
  }

  return (
    <section className="glass mb-5 rounded-3xl p-5 md:p-6" data-testid="admin-fixture-configurator">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-extrabold">Configure upcoming fixtures</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Load fixtures and initial prediction suggestions, then review the selection, enter match odds and overall package odds, and assign each game.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="grid gap-1 text-xs font-semibold">
            Look ahead
            <select
              value={lookaheadDays}
              onChange={(event) => setLookaheadDays(Number(event.target.value))}
              className="rounded-lg border border-border bg-background/70 px-3 py-2.5 text-sm"
              data-testid="select-fixture-lookahead"
            >
              {[3, 7, 14].map((days) => <option key={days} value={days}>{days} days</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={loadFixtures}
            disabled={configure.isPending || !packages.length}
            className="btn-blue flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold disabled:opacity-60"
            data-testid="button-configure-fixtures"
          >
            {configure.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {configure.isPending ? "Loading fixtures…" : "Configure"}
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Suggestions are estimates from current league position and recent form, not guarantees. Review every prediction and price before publishing.
      </p>
      {message && (
        <p
          className={`mt-4 rounded-xl border p-3 text-sm ${
            message.includes("saved") || message.includes("loaded") || message.includes("found")
              ? "border-win/30 bg-win/10 text-win"
              : "border-loss/30 bg-loss/10 text-loss"
          }`}
          role="status"
          data-testid="fixture-config-status"
        >
          {message}
        </p>
      )}
      {configure.data?.unavailableCompetitions.length ? (
        <p className="mt-3 rounded-xl border border-gold/30 bg-gold/5 p-3 text-xs text-muted-foreground" data-testid="fixture-unavailable-competitions">
          Current table data was unavailable for: {configure.data.unavailableCompetitions.join(", ")}. Those fixtures still have their date and teams, but need a prediction selected manually.
        </p>
      ) : null}
      {fixtures.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">{selectedCount} new fixture{selectedCount === 1 ? "" : "s"} selected</p>
            <button
              type="button"
              onClick={() => void saveFixtures()}
              disabled={updatePackage.isPending || selectedCount === 0}
              className="btn-gold rounded-lg px-4 py-2.5 text-sm font-extrabold disabled:opacity-60"
              data-testid="button-save-configured-fixtures"
            >
              {updatePackage.isPending ? "Saving fixtures…" : "Add selected to packages"}
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            {fixtures.map((fixture) => {
              const alreadyAdded = existingFixtureKeys.has(fixtureKey(fixture));
              return (
                <fieldset
                  key={fixture.fixtureId}
                  className={`grid gap-3 rounded-2xl border p-4 ${alreadyAdded ? "border-win/30 bg-win/5" : "border-border bg-background/30"}`}
                  data-testid={`configured-fixture-${fixture.fixtureId}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={alreadyAdded ? false : fixture.included}
                      disabled={alreadyAdded}
                      onChange={(event) => updateFixture(fixture.fixtureId, { included: event.target.checked })}
                      className="mt-1 h-4 w-4 accent-primary"
                      aria-label={`Add ${fixture.homeTeam} versus ${fixture.awayTeam}`}
                      data-testid={`checkbox-configured-fixture-${fixture.fixtureId}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-muted-foreground">{fixture.competition} · {fixture.matchDate} · {fixture.kickoff} EAT</p>
                      <p className="mt-1 font-bold">{fixture.homeTeam} <span className="text-muted-foreground">vs</span> {fixture.awayTeam}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{fixture.rationale}</p>
                    </div>
                    {alreadyAdded && <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-win"><Check className="h-4 w-4" />Added</span>}
                  </div>
                  {!alreadyAdded && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="grid gap-1 text-xs font-semibold">
                        VIP package
                        <select
                          value={fixture.packageId}
                          onChange={(event) => updateFixture(fixture.fixtureId, { packageId: event.target.value })}
                          className="rounded-lg border border-border bg-background/70 px-3 py-2.5 text-sm"
                          data-testid={`select-configured-package-${fixture.fixtureId}`}
                        >
                          {packages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.title} · {pkg.durationDays} days</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs font-semibold">
                        Prediction selection
                        <select
                          value={fixture.selection}
                          onChange={(event) => updateFixture(fixture.fixtureId, { selection: event.target.value })}
                          className="rounded-lg border border-border bg-background/70 px-3 py-2.5 text-sm"
                          data-testid={`select-configured-selection-${fixture.fixtureId}`}
                        >
                          <option value="">Choose a selection</option>
                          {matchSelectionGroups.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                              {group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs font-semibold">
                        Odds (check before saving)
                        <input
                          type="number"
                          min="1.01"
                          max="100000"
                          step="0.01"
                          value={fixture.odds}
                          onChange={(event) => updateFixture(fixture.fixtureId, { odds: event.target.value })}
                          placeholder="Enter verified odds"
                          className="rounded-lg border border-border bg-background/70 px-3 py-2.5 text-sm"
                          data-testid={`input-configured-odds-${fixture.fixtureId}`}
                        />
                      </label>
                    </div>
                  )}
                </fieldset>
              );
            })}
          </div>
          {selectedByPackage.size > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[...selectedByPackage.keys()].map((packageId) => {
                const pkg = packages.find((item) => item.id === packageId);
                if (!pkg) return null;
                return (
                  <label key={packageId} className="grid gap-1.5 text-xs font-semibold">
                    {pkg.title} overall odds
                    <input
                      type="number"
                      min="1"
                      max="1000000000"
                      step="0.01"
                      value={totalOddsByPackage[packageId] ?? ""}
                      onChange={(event) => setTotalOddsByPackage((current) => ({ ...current, [packageId]: event.target.value }))}
                      placeholder="Enter checked total odds"
                      className="rounded-lg border border-border bg-background/70 px-3 py-2.5 text-sm"
                      data-testid={`input-configured-total-odds-${packageId}`}
                    />
                  </label>
                );
              })}
            </div>
          )}
          {savedCount > 0 && <p className="mt-3 text-xs text-muted-foreground">Saved games now appear in the package editor below. Check total odds and stake level before publishing.</p>}
        </>
      )}
    </section>
  );
}
