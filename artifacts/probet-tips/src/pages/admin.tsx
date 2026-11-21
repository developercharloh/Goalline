import { useMemo, useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminTipPackagesQueryKey,
  getGetAdminUsersQueryKey,
  getGetTipsQueryKey,
  useCreateAdminTipPackage,
  useGetAdminTipPackages,
  useGetAdminUsers,
  useGetAuthMe,
  useUpdateAdminTipPackage,
  useUpdateAdminUser,
  type AdminTipPackage,
  type AdminTipPackageInput,
  type AdminUser,
} from "@workspace/api-client-react";
import { Archive, Check, FilePlus2, Search, Shield, Users, Gem } from "lucide-react";
import { AppShell, ErrorCard, PageHeader, Sk } from "@/components/app-shell";
import { errMsg, money } from "@/lib/probet";

type AdminTab = "tips" | "users";

function PackageManager() {
  const packages = useGetAdminTipPackages();
  const create = useCreateAdminTipPackage();
  const update = useUpdateAdminTipPackage();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminTipPackage | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const pending = create.isPending || update.isPending;

  const editor = editing ?? (creating ? {
    id: "",
    title: "",
    description: "",
    price: 10,
    status: "draft" as const,
    isSample: false,
    matchCount: 0,
    tips: [],
    createdAt: "",
    updatedAt: "",
  } : null);

  function selectEdit(pkg: AdminTipPackage) {
    setCreating(false);
    setEditing(pkg);
    setFormError("");
  }

  function resetEditor() {
    setEditing(null);
    setCreating(false);
    setFormError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const tips = String(values.tips ?? "").split("\n").map((line) => {
      const [match, prediction, league] = line.split("|").map((part) => part.trim());
      return { match: match ?? "", prediction: prediction ?? "", league: league ?? "" };
    }).filter((tip) => tip.match || tip.prediction || tip.league);
    const input: AdminTipPackageInput = {
      title: String(values.title ?? "").trim(),
      description: String(values.description ?? "").trim(),
      price: Number(values.price),
      status: String(values.status ?? "draft") as AdminTipPackageInput["status"],
      isSample: values.isSample === "on",
      tips,
    };
    if (!Number.isFinite(input.price) || input.price < 0.01 || !tips.length || tips.some((tip) => !tip.match || !tip.prediction || !tip.league)) {
      setFormError("Enter a valid price and at least one complete pick: Match | Prediction | League.");
      return;
    }

    const options = {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminTipPackagesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTipsQueryKey() });
        resetEditor();
      },
      onError: (error: unknown) => setFormError(errMsg(error)),
    };
    if (editing) update.mutate({ id: editing.id, data: input }, options);
    else create.mutate({ data: input }, options);
  }

  function archive(pkg: AdminTipPackage) {
    update.mutate({
      id: pkg.id,
      data: { ...pkg, status: "archived" },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminTipPackagesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTipsQueryKey() });
        if (editing?.id === pkg.id) resetEditor();
      },
    });
  }

  if (packages.isLoading) return <div className="grid gap-4 md:grid-cols-2"><Sk className="h-64" /><Sk className="h-64" /></div>;
  if (packages.error) return <ErrorCard message={errMsg(packages.error)} onRetry={() => packages.refetch()} />;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
      <section className="glass rounded-3xl p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div><h2 className="font-display text-xl font-extrabold">Tip packages</h2><p className="text-xs text-muted-foreground mt-1">Published picks are visible to users; archived packages stay in purchase history.</p></div>
          <button type="button" onClick={() => { setEditing(null); setCreating(true); setFormError(""); }} className="btn-blue flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold" data-testid="button-new-package">
            <FilePlus2 className="h-4 w-4" />New package
          </button>
        </div>
        <div className="grid gap-3">
          {(packages.data ?? []).length === 0 ? <p className="rounded-xl bg-background/40 p-4 text-sm text-muted-foreground">No packages yet. Create one to add your first tips.</p>
            : packages.data?.map((pkg) => (
              <article key={pkg.id} className={`rounded-2xl border p-4 ${editing?.id === pkg.id ? "border-primary/60 bg-primary/5" : "border-border bg-background/30"}`} data-testid={`admin-package-${pkg.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold truncate">{pkg.title}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${pkg.status === "published" ? "bg-win/15 text-win" : pkg.status === "archived" ? "bg-muted text-muted-foreground" : "bg-gold/15 text-gold"}`}>{pkg.status}</span>
                      {pkg.isSample && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Sample</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{pkg.matchCount} picks · {money(pkg.price)} · Updated {new Date(pkg.updatedAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => selectEdit(pkg)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-secondary" data-testid={`button-edit-package-${pkg.id}`}>Edit</button>
                    {pkg.status !== "archived" && <button type="button" onClick={() => archive(pkg)} disabled={update.isPending} aria-label={`Archive ${pkg.title}`} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-loss disabled:opacity-50" data-testid={`button-archive-package-${pkg.id}`}><Archive className="h-4 w-4" /></button>}
                  </div>
                </div>
              </article>
            ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-5 md:p-6">
        {editor ? (
          <form key={editor.id || "new"} onSubmit={submit} className="grid gap-4" data-testid="form-tip-package">
            <div className="flex items-center justify-between gap-2">
              <div><h2 className="font-display text-xl font-extrabold">{editing ? "Edit package" : "New package"}</h2><p className="text-xs text-muted-foreground mt-1">{editing ? `Package ${editing.id}` : "Add content then choose whether to publish it."}</p></div>
              <button type="button" onClick={resetEditor} className="text-sm text-primary underline" data-testid="button-cancel-package-edit">Cancel</button>
            </div>
            <label className="grid gap-1.5 text-sm font-semibold">Package title
              <input name="title" defaultValue={editor.title} required minLength={3} maxLength={120} className="rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid="input-package-title" />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">Description
              <input name="description" defaultValue={editor.description} required minLength={3} maxLength={300} className="rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid="input-package-description" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold">Price (KES)
                <input name="price" type="number" min="0.01" max="100000" step="0.01" defaultValue={editor.price} required className="rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid="input-package-price" />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">Status
                <select name="status" defaultValue={editor.status} className="rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid="select-package-status">
                  <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-semibold">Match picks
              <textarea
                name="tips"
                rows={8}
                required
                defaultValue={editor.tips.map((tip) => `${tip.match} | ${tip.prediction} | ${tip.league}`).join("\n")}
                placeholder={"Man City vs Liverpool | Over 2.5 Goals | Premier League\nReal Madrid vs Barcelona | Both Teams to Score | La Liga"}
                className="rounded-xl border border-border bg-background/70 px-3 py-3 font-mono text-sm outline-none focus:border-primary"
                data-testid="textarea-package-picks"
              />
              <span className="text-xs font-normal text-muted-foreground">One pick per line, separated by | in this order: Match, Prediction, League.</span>
            </label>
            <label className="flex items-start gap-2 rounded-xl border border-border bg-background/30 p-3 text-sm">
              <input type="checkbox" name="isSample" defaultChecked={editor.isSample} className="mt-1 accent-primary" data-testid="checkbox-package-sample" />
              <span><b>Sample / illustrative package</b><span className="block text-xs text-muted-foreground mt-0.5">Sample packages can only be bought with the guest preview wallet.</span></span>
            </label>
            {formError && <p className="rounded-xl border border-loss/40 bg-loss/10 p-3 text-sm text-loss" role="alert" data-testid="package-form-error">{formError}</p>}
            <button disabled={pending} className="btn-blue rounded-xl py-3 font-bold disabled:opacity-60" data-testid="button-save-package">
              {pending ? "Saving…" : editing ? "Save changes" : "Create package"}
            </button>
          </form>
        ) : (
          <div className="grid min-h-72 place-items-center text-center">
            <div><Gem className="mx-auto h-10 w-10 text-primary" /><h2 className="font-display text-xl font-extrabold mt-3">Manage premium tips</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">Create packages, add picks, publish them, or archive old packages without removing buyers’ access.</p></div>
          </div>
        )}
      </section>
    </div>
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
  const heading = useMemo(() => tab === "tips" ? "Tips" : "Profiles", [tab]);

  if (auth.isLoading) return <AppShell><Sk className="h-20" /></AppShell>;
  if (auth.error) return <AppShell><ErrorCard message={errMsg(auth.error)} onRetry={() => auth.refetch()} /></AppShell>;
  if (!auth.data?.account) return <Redirect to="/sign-in?returnTo=%2Fadmin" />;
  if (auth.data.account.role !== "admin") {
    return <AppShell title="Admin access"><div className="glass max-w-xl rounded-3xl p-8 text-center"><Shield className="mx-auto h-10 w-10 text-gold" /><h1 className="font-display text-2xl font-extrabold mt-3">Admin access required</h1><p className="mt-2 text-sm text-muted-foreground">Your account cannot manage users or tip packages.</p><Link href="/profile" className="btn-blue inline-block mt-5 rounded-xl px-5 py-2.5 font-bold">Back to profile</Link></div></AppShell>;
  }

  return (
    <AppShell title="Admin portal">
      <PageHeader title="Admin Portal" subtitle="Manage user profiles and premium tip packages." />
      <div className="mb-5 flex gap-2 rounded-2xl border border-border bg-background/40 p-1.5" role="tablist" aria-label="Admin sections">
        <button type="button" role="tab" aria-selected={tab === "tips"} onClick={() => setTab("tips")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === "tips" ? "btn-blue" : "text-muted-foreground hover:bg-secondary"}`} data-testid="tab-admin-tips"><Gem className="h-4 w-4" />Tip packages</button>
        <button type="button" role="tab" aria-selected={tab === "users"} onClick={() => setTab("users")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === "users" ? "btn-blue" : "text-muted-foreground hover:bg-secondary"}`} data-testid="tab-admin-users"><Users className="h-4 w-4" />User profiles</button>
      </div>
      <h2 className="sr-only">{heading}</h2>
      {tab === "tips" ? <PackageManager /> : <UserManager />}
      <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground"><Check className="h-4 w-4 shrink-0 text-win" />Wallet balances and payment records cannot be changed from this portal. Archived packages remain available to existing purchasers.</p>
    </AppShell>
  );
}
