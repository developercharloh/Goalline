import { useMemo, useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  getGetDashboardQueryKey,
  getGetAdminTipPackagesQueryKey,
  getGetAdminUsersQueryKey,
  getGetTipsQueryKey,
  useGetAdminTipPackages,
  useGetAdminUsers,
  useGetAuthMe,
  useUpdateAdminTipEntryResult,
  useUpdateAdminTipPackage,
  useUpdateAdminUser,
  type AdminTipPackage,
  type AdminTipPackageInput,
  type AdminUser,
  type MatchResult,
} from "@workspace/api-client-react";
import { Check, CircleCheck, CircleX, Clock3, Search, Shield, Users, Gem, Plus, Trash2, Headset } from "lucide-react";
import { AppShell, ErrorCard, PageHeader, Sk } from "@/components/app-shell";
import AdminSupportInbox from "@/pages/admin-support";
import { Form } from "@/components/ui/form";
import { errMsg } from "@/lib/probet";
import { AdminFixtureConfigurator } from "@/pages/admin-fixture-configurator";
import {
  CUSTOM_MATCH_SELECTION,
  isPresetMatchSelection,
  matchSelectionGroups,
} from "@/lib/match-selections";
import { USER_APP_URL } from "@/lib/portal-host";

type AdminTab = "tips" | "users" | "support";

const decimalInput = z.string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter a number with up to two decimal places.")
  .refine((value) => Number(value) >= 1 && Number(value) <= 1_000_000_000, "Enter a total odds value of at least 1.");

const matchEditorSchema = z.object({
  id: z.string().uuid().optional(),
  matchDate: z.string().min(1, "Enter the match date."),
  kickoff: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Enter the kickoff time."),
  homeTeam: z.string().trim().min(1, "Enter the home team.").max(120),
  awayTeam: z.string().trim().min(1, "Enter the away team.").max(120),
  selectionChoice: z.string().min(1, "Choose a prediction selection."),
  customSelection: z.string().max(120, "Selection must be 120 characters or fewer."),
  odds: z.string()
    .trim()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter odds with up to two decimal places.")
    .refine((value) => Number(value) >= 1.01 && Number(value) <= 100_000, "Odds must be at least 1.01."),
}).superRefine((match, context) => {
  if (match.selectionChoice === CUSTOM_MATCH_SELECTION && !match.customSelection.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customSelection"],
      message: "Enter the custom selection.",
    });
  }
});

const packageEditorSchema = z.object({
  totalOdds: decimalInput,
  stakeLevel: z.enum(["medium", "high"]),
  matches: z.array(matchEditorSchema).min(1, "Add at least one complete match."),
});

type PackageEditorValues = z.infer<typeof packageEditorSchema>;

function packagePrice(price: number) {
  return `${Math.round(price)} Diamonds`;
}

function toEditorMatch(match: AdminTipPackage["matches"][number]) {
  const isPreset = isPresetMatchSelection(match.selection);
  return {
    id: match.id,
    matchDate: match.matchDate,
    kickoff: match.kickoff,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    selectionChoice: isPreset ? match.selection : CUSTOM_MATCH_SELECTION,
    customSelection: isPreset ? "" : match.selection,
    odds: String(match.odds),
  };
}

function MatchResultControls({
  id,
  result,
  homeTeam,
  awayTeam,
}: {
  id: string;
  result: MatchResult;
  homeTeam: string;
  awayTeam: string;
}) {
  const updateResult = useUpdateAdminTipEntryResult();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");

  function saveResult(nextResult: MatchResult) {
    setMessage("");
    updateResult.mutate({ id, data: { result: nextResult } }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetAdminTipPackagesQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetTipsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      },
      onError: (error: unknown) => setMessage(errMsg(error)),
    });
  }

  const ResultIcon = result === "won" ? CircleCheck : result === "lost" ? CircleX : Clock3;
  const resultLabel = result === "won" ? "Won" : result === "lost" ? "Lost" : "Pending";

  return (
    <div className="mt-3 grid gap-2 border-t border-border pt-3" data-testid={`match-result-controls-${id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Match result</span>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
            result === "won" ? "border-win/40 bg-win/10 text-win"
              : result === "lost" ? "border-loss/40 bg-loss/10 text-loss"
                : "border-border bg-background/40 text-muted-foreground"
          }`}
          role="status"
          data-testid={`text-match-result-${id}`}
        >
          <ResultIcon className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
          {resultLabel}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={updateResult.isPending}
          aria-pressed={result === "won"}
          aria-label={`Mark ${homeTeam} vs ${awayTeam} as won`}
          onClick={() => saveResult("won")}
          className={`rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60 ${
            result === "won" ? "border-win bg-win/15 text-win" : "border-border text-muted-foreground hover:bg-secondary"
          }`}
          data-testid={`button-mark-won-${id}`}
        >
          <CircleCheck className="mr-1 inline h-4 w-4" aria-hidden="true" />Won
        </button>
        <button
          type="button"
          disabled={updateResult.isPending}
          aria-pressed={result === "lost"}
          aria-label={`Mark ${homeTeam} vs ${awayTeam} as lost`}
          onClick={() => saveResult("lost")}
          className={`rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60 ${
            result === "lost" ? "border-loss bg-loss/15 text-loss" : "border-border text-muted-foreground hover:bg-secondary"
          }`}
          data-testid={`button-mark-lost-${id}`}
        >
          <CircleX className="mr-1 inline h-4 w-4" aria-hidden="true" />Lost
        </button>
        {result !== "pending" && (
          <button
            type="button"
            disabled={updateResult.isPending}
            onClick={() => saveResult("pending")}
            className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-secondary disabled:opacity-60"
            data-testid={`button-reset-result-${id}`}
          >
            Reset to pending
          </button>
        )}
      </div>
      {message && <p className="text-xs text-loss" role="alert">{message}</p>}
    </div>
  );
}

function PackageEditor({ pkg }: { pkg: AdminTipPackage }) {
  const update = useUpdateAdminTipPackage();
  const queryClient = useQueryClient();
  const [formMessage, setFormMessage] = useState("");
  const form = useForm<PackageEditorValues>({
    // The resolver peer types and the app's Zod copy differ; both support parseAsync at runtime.
    resolver: zodResolver(packageEditorSchema as never),
    defaultValues: {
      totalOdds: String(pkg.totalOdds),
      stakeLevel: pkg.stakeLevel,
      matches: pkg.matches.map(toEditorMatch),
    },
  });
  const matches = useFieldArray({ control: form.control, name: "matches" });

  function submit(values: PackageEditorValues) {
    setFormMessage("");
    const input: AdminTipPackageInput = {
      totalOdds: Number(values.totalOdds),
      stakeLevel: values.stakeLevel,
      matches: values.matches.map((match) => ({
        ...(match.id ? { id: match.id } : {}),
        matchDate: match.matchDate,
        kickoff: match.kickoff,
        homeTeam: match.homeTeam.trim(),
        awayTeam: match.awayTeam.trim(),
        selection: match.selectionChoice === CUSTOM_MATCH_SELECTION
          ? match.customSelection.trim()
          : match.selectionChoice,
        odds: Number(match.odds),
      })),
    };
    update.mutate({ id: pkg.id, data: input }, {
      onSuccess: (saved) => {
        queryClient.invalidateQueries({ queryKey: getGetAdminTipPackagesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTipsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        form.reset({
          totalOdds: String(saved.totalOdds),
          stakeLevel: saved.stakeLevel,
          matches: saved.matches.map(toEditorMatch),
        });
        setFormMessage("Package matches saved.");
      },
      onError: (error: unknown) => setFormMessage(errMsg(error)),
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="grid gap-5" data-testid={`form-package-matches-${pkg.id}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-extrabold">{pkg.title}</h2>
            <p className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-sm font-semibold text-gold"><Gem className="h-4 w-4" aria-hidden="true" />{packagePrice(pkg.priceDiamonds)} <span className="text-muted-foreground">· KES {new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(pkg.price)} · {pkg.durationDays} days</span>{pkg.bestValue ? " · Best value" : ""}</p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{pkg.matches.length} matches</span>
        </div>

        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold">Match details</h3>
            <button
              type="button"
              onClick={() => matches.append({ matchDate: "", kickoff: "", homeTeam: "", awayTeam: "", selectionChoice: "", customSelection: "", odds: "" })}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-secondary"
              data-testid={`button-add-match-${pkg.id}`}
            >
              <Plus className="h-4 w-4" />Add match
            </button>
          </div>
          {matches.fields.length === 0 && <p className="rounded-xl bg-background/40 p-3 text-sm text-muted-foreground">Add the first match to this package.</p>}
          {matches.fields.map((field, index) => {
            const errors = form.formState.errors.matches?.[index];
            const savedMatchId = form.watch(`matches.${index}.id`);
            const savedMatch = pkg.matches.find((match) => match.id === savedMatchId);
            return (
              <fieldset key={field.id} className="grid gap-3 rounded-2xl border border-border bg-background/30 p-4" data-testid={`match-editor-${pkg.id}-${index}`}>
                <legend className="px-1 text-sm font-semibold">Match {index + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold">Match date
                    <input type="date" {...form.register(`matches.${index}.matchDate`)} className="rounded-xl border border-border bg-background/70 px-3 py-2.5 text-sm" data-testid={`input-match-date-${pkg.id}-${index}`} />
                    {errors?.matchDate?.message && <span className="text-loss">{errors.matchDate.message}</span>}
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">Kickoff
                    <input type="time" {...form.register(`matches.${index}.kickoff`)} className="rounded-xl border border-border bg-background/70 px-3 py-2.5 text-sm" data-testid={`input-match-kickoff-${pkg.id}-${index}`} />
                    {errors?.kickoff?.message && <span className="text-loss">{errors.kickoff.message}</span>}
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">Home team
                    <input maxLength={120} {...form.register(`matches.${index}.homeTeam`)} className="rounded-xl border border-border bg-background/70 px-3 py-2.5 text-sm" data-testid={`input-home-team-${pkg.id}-${index}`} />
                    {errors?.homeTeam?.message && <span className="text-loss">{errors.homeTeam.message}</span>}
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">Away team
                    <input maxLength={120} {...form.register(`matches.${index}.awayTeam`)} className="rounded-xl border border-border bg-background/70 px-3 py-2.5 text-sm" data-testid={`input-away-team-${pkg.id}-${index}`} />
                    {errors?.awayTeam?.message && <span className="text-loss">{errors.awayTeam.message}</span>}
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">Prediction selection
                    <select {...form.register(`matches.${index}.selectionChoice`)} className="rounded-xl border border-border bg-background/70 px-3 py-2.5 text-sm" data-testid={`select-match-selection-${pkg.id}-${index}`}>
                      <option value="">Choose a selection</option>
                      {matchSelectionGroups.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.options.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </optgroup>
                      ))}
                      <option value={CUSTOM_MATCH_SELECTION}>Other / custom selection</option>
                    </select>
                    {errors?.selectionChoice?.message && <span className="text-loss">{errors.selectionChoice.message}</span>}
                  </label>
                  {form.watch(`matches.${index}.selectionChoice`) === CUSTOM_MATCH_SELECTION && (
                    <label className="grid gap-1 text-xs font-semibold">Custom selection
                      <input maxLength={120} {...form.register(`matches.${index}.customSelection`)} placeholder="Enter the pick for this match" className="rounded-xl border border-border bg-background/70 px-3 py-2.5 text-sm" data-testid={`input-custom-selection-${pkg.id}-${index}`} />
                      {errors?.customSelection?.message && <span className="text-loss">{errors.customSelection.message}</span>}
                    </label>
                  )}
                  <label className="grid gap-1 text-xs font-semibold">Odds
                    <input type="number" min="1.01" max="100000" step="0.01" {...form.register(`matches.${index}.odds`)} className="rounded-xl border border-border bg-background/70 px-3 py-2.5 text-sm" data-testid={`input-match-odds-${pkg.id}-${index}`} />
                    {errors?.odds?.message && <span className="text-loss">{errors.odds.message}</span>}
                  </label>
                  <div className="flex items-end justify-end">
                    <button type="button" onClick={() => matches.remove(index)} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-loss hover:bg-loss/10" data-testid={`button-remove-match-${pkg.id}-${index}`}>
                      <Trash2 className="h-4 w-4" />Remove match
                    </button>
                  </div>
                </div>
                {savedMatch ? (
                  <MatchResultControls
                    id={savedMatch.id}
                    result={savedMatch.result}
                    homeTeam={savedMatch.homeTeam}
                    awayTeam={savedMatch.awayTeam}
                  />
                ) : (
                  <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">Save this match before recording its result.</p>
                )}
              </fieldset>
            );
          })}
          {typeof form.formState.errors.matches?.message === "string" && <p className="text-sm text-loss" role="alert">{form.formState.errors.matches.message}</p>}
        </section>

        <label className="grid gap-1.5 text-sm font-semibold">Total odds
          <input type="number" min="1" max="1000000000" step="0.01" {...form.register("totalOdds")} className="rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid={`input-total-odds-${pkg.id}`} />
          {form.formState.errors.totalOdds?.message && <span className="text-xs text-loss">{form.formState.errors.totalOdds.message}</span>}
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">Stake level
          <select {...form.register("stakeLevel")} className="rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid={`select-stake-level-${pkg.id}`}>
            <option value="medium">Stake medium</option>
            <option value="high">Stake high</option>
          </select>
        </label>
        <p className="rounded-xl border border-gold/25 bg-gold/5 p-3 text-xs text-muted-foreground" data-testid={`text-stake-disclaimer-${pkg.id}`}>
          Disclaimer shown to users: Stake {form.watch("stakeLevel")}.
        </p>
        {formMessage && <p className={`text-sm ${formMessage === "Package matches saved." ? "text-win" : "text-loss"}`} role="status" data-testid={`package-save-status-${pkg.id}`}>{formMessage}</p>}
        <button disabled={update.isPending} className="btn-blue rounded-xl py-3 font-bold disabled:opacity-60" data-testid={`button-save-package-${pkg.id}`}>
          {update.isPending ? "Saving…" : "Save match details"}
        </button>
      </form>
    </Form>
  );
}

function PackageManager() {
  const packages = useGetAdminTipPackages();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editor = packages.data?.find((pkg) => pkg.id === editingId) ?? null;
  if (packages.isLoading) return <div className="grid gap-4 md:grid-cols-2"><Sk className="h-64" /><Sk className="h-64" /></div>;
  if (packages.error) return <ErrorCard message={errMsg(packages.error)} onRetry={() => packages.refetch()} />;

  return (
    <>
      <AdminFixtureConfigurator packages={packages.data ?? []} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
      <section className="glass rounded-3xl p-5 md:p-6">
        <div className="mb-4">
          <h2 className="font-display text-xl font-extrabold">VIP packages</h2>
          <p className="mt-1 text-xs text-muted-foreground">These are the only packages available to users.</p>
        </div>
        <div className="grid gap-3">
          {(packages.data ?? []).map((pkg) => (
            <article key={pkg.id} className={`rounded-2xl border p-4 ${editingId === pkg.id ? "border-primary/60 bg-primary/5" : "border-border bg-background/30"}`} data-testid={`admin-package-${pkg.id}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-bold">{pkg.title}</h3>
                    <p className="mt-1 inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><Gem className="h-3.5 w-3.5 text-gold" aria-hidden="true" />{packagePrice(pkg.priceDiamonds)} · KES {new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(pkg.price)} · {pkg.durationDays} days · {pkg.matchCount} matches added</p>
                   {pkg.bestValue && <span className="mt-1 inline-block rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-extrabold text-gold">Best value</span>}
                </div>
                <button type="button" onClick={() => setEditingId(pkg.id)} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-secondary" data-testid={`button-edit-package-${pkg.id}`}>
                  {editingId === pkg.id ? "Editing" : "Edit matches"}
                </button>
              </div>
            </article>
          ))}
          {(packages.data ?? []).length === 0 && <p className="rounded-xl bg-background/40 p-4 text-sm text-muted-foreground">The VIP package list is unavailable.</p>}
        </div>
      </section>
      <section className="glass rounded-3xl p-5 md:p-6">
        {editor ? (
          <PackageEditor key={editor.id} pkg={editor} />
        ) : (
          <div className="grid min-h-72 place-items-center text-center">
            <div><Gem className="mx-auto h-10 w-10 text-primary" /><h2 className="mt-3 font-display text-xl font-extrabold">Choose a package</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">Add fixtures, enter the total odds, and select a stake level.</p></div>
          </div>
        )}
      </section>
      </div>
    </>
  );
}

function UserManager() {
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const users = useGetAdminUsers({ q: query }, { query: { retry: false } });
  const update = useUpdateAdminUser();
  const queryClient = useQueryClient();

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchText.trim());
    setEditing(null);
    setSaveMessage("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    update.mutate({
      id: editing.id,
      data: {
        username: String(values.username ?? "").trim(),
        fullName: String(values.fullName ?? "").trim(),
        phone: String(values.phone ?? "").trim(),
        country: String(values.country ?? "").trim(),
      },
    }, {
      onSuccess: () => {
        setSaveMessage("Profile updated.");
        queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey({ q: query }) });
        setEditing(null);
      },
      onError: (error) => setSaveMessage(errMsg(error)),
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
      <section className="glass rounded-3xl p-5 md:p-6">
        <div className="mb-4"><h2 className="font-display text-xl font-extrabold">User profiles</h2><p className="mt-1 text-xs text-muted-foreground">Search and update names, usernames, phone numbers and countries. Email and account role are read-only here.</p></div>
        <form onSubmit={search} className="mb-4 flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} maxLength={80} placeholder="Search name, username, email or phone" className="w-full rounded-xl border border-border bg-background/70 py-3 pl-10 pr-3 text-sm outline-none focus:border-primary" data-testid="input-admin-user-search" />
          </label>
          <button className="btn-blue rounded-xl px-4 font-bold" data-testid="button-admin-user-search">Search</button>
        </form>
        {users.isLoading ? <Sk className="h-32" /> : users.error ? <ErrorCard message={errMsg(users.error)} onRetry={() => users.refetch()} /> : (
          <div className="space-y-2" data-testid="list-admin-users">
            {(users.data ?? []).length === 0 ? <p className="rounded-xl bg-background/40 p-4 text-sm text-muted-foreground">No matching accounts.</p>
              : users.data?.map((user) => (
                <button key={user.id} type="button" onClick={() => { setEditing(user); setSaveMessage(""); }} className={`w-full rounded-2xl border p-3 text-left transition-colors ${editing?.id === user.id ? "border-primary bg-primary/5" : "border-border bg-background/30 hover:bg-secondary/60"}`} data-testid={`button-select-user-${user.id}`}>
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0"><b className="block truncate">{user.fullName}</b><span className="block truncate text-xs text-muted-foreground">@{user.username} · {user.email}</span><span className="block truncate text-xs text-muted-foreground mt-1">{user.phone} · {user.country}</span></span>
                    <span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-[10px] font-bold uppercase">{user.role}</span>
                  </span>
                </button>
              ))}
          </div>
        )}
      </section>
      <section className="glass rounded-3xl p-5 md:p-6">
        {editing ? (
          <form key={editing.id} onSubmit={submit} className="grid gap-4" data-testid="form-admin-user">
            <div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><div><h2 className="font-display text-xl font-extrabold">Edit profile</h2><p className="text-xs text-muted-foreground">{editing.email}</p></div></div>
            <label className="grid gap-1.5 text-sm font-semibold">Username<input name="username" defaultValue={editing.username} required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" className="rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid="input-admin-username" /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Full name<input name="fullName" defaultValue={editing.fullName} required minLength={2} maxLength={100} className="rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid="input-admin-full-name" /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Phone number<input name="phone" type="tel" defaultValue={editing.phone} required minLength={7} maxLength={24} className="rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid="input-admin-phone" /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Country<input name="country" defaultValue={editing.country} required minLength={2} maxLength={80} className="rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid="input-admin-country" /></label>
            {saveMessage && <p className={`text-sm ${saveMessage === "Profile updated." ? "text-win" : "text-loss"}`} role="status">{saveMessage}</p>}
            <button disabled={update.isPending} className="btn-blue rounded-xl py-3 font-bold disabled:opacity-60" data-testid="button-save-admin-user">{update.isPending ? "Saving…" : "Save profile"}</button>
          </form>
        ) : (
          <div className="grid min-h-64 place-items-center text-center">
            <div><Users className="mx-auto h-10 w-10 text-primary" /><h2 className="font-display text-xl font-extrabold mt-3">Select a profile</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">Choose a user to review or update their profile details.</p></div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function AdminPage() {
  const auth = useGetAuthMe();
  const [tab, setTab] = useState<AdminTab>("tips");
  const heading = useMemo(() => tab === "tips" ? "Tips" : tab === "users" ? "Profiles" : "Support", [tab]);

  if (auth.isLoading) return <AppShell adminPortal><Sk className="h-20" /></AppShell>;
  if (auth.error) return <AppShell adminPortal><ErrorCard message={errMsg(auth.error)} onRetry={() => auth.refetch()} /></AppShell>;
  if (!auth.data?.account) return <Redirect to="/sign-in?returnTo=%2Fadmin" />;
  if (auth.data.account.role !== "admin") {
    return <AppShell title="Admin access" adminPortal><div className="glass max-w-xl rounded-3xl p-8 text-center"><Shield className="mx-auto h-10 w-10 text-gold" /><h1 className="font-display text-2xl font-extrabold mt-3">Admin access required</h1><p className="mt-2 text-sm text-muted-foreground">Your account cannot manage users or tip packages.</p><a href={`${USER_APP_URL}/profile`} className="btn-blue inline-block mt-5 rounded-xl px-5 py-2.5 font-bold">Open user profile</a></div></AppShell>;
  }

  return (
    <AppShell title="Admin portal" adminPortal>
      <PageHeader title="Admin Portal" subtitle="Manage VIP fixtures, user profiles, and support conversations." />
      <div className="mb-5 flex gap-2 rounded-2xl border border-border bg-background/40 p-1.5" role="tablist" aria-label="Admin sections">
        <button type="button" role="tab" aria-selected={tab === "tips"} onClick={() => setTab("tips")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === "tips" ? "btn-blue" : "text-muted-foreground hover:bg-secondary"}`} data-testid="tab-admin-tips"><Gem className="h-4 w-4" />Tip packages</button>
        <button type="button" role="tab" aria-selected={tab === "users"} onClick={() => setTab("users")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === "users" ? "btn-blue" : "text-muted-foreground hover:bg-secondary"}`} data-testid="tab-admin-users"><Users className="h-4 w-4" />User profiles</button>
        <button type="button" role="tab" aria-selected={tab === "support"} onClick={() => setTab("support")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === "support" ? "btn-blue" : "text-muted-foreground hover:bg-secondary"}`} data-testid="tab-admin-support"><Headset className="h-4 w-4" />Support</button>
      </div>
      <h2 className="sr-only">{heading}</h2>
      {tab === "tips" ? <PackageManager /> : tab === "users" ? <UserManager /> : <AdminSupportInbox />}
      <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground"><Check className="h-4 w-4 shrink-0 text-win" />Wallet balances and payment records cannot be changed from this portal. Existing access remains available until its expiry.</p>
    </AppShell>
  );
}
