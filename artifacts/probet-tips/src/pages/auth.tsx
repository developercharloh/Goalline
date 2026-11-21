import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAuthMeQueryKey,
  useBootstrapAdmin,
  useGetAuthMe,
  useSignIn,
  useSignUp,
} from "@workspace/api-client-react";
import { AlertCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Logo, Wordmark } from "@/components/brand";
import { AppShell, PageHeader } from "@/components/app-shell";
import { errMsg } from "@/lib/probet";

function AuthFrame({ children, title }: { children: ReactNode; title: string }) {
  return (
    <main className="min-h-[100dvh] grid lg:grid-cols-2">
      <section className="hidden lg:flex flex-col justify-center items-center gap-6 p-12 relative overflow-hidden">
        <div className="absolute h-96 w-96 rounded-full bg-[hsl(217_100%_50%/.3)] blur-3xl" />
        <Logo className="relative h-40 w-40" />
        <div className="relative text-center"><Wordmark size="lg" tagline /></div>
        <p className="relative max-w-sm text-center text-muted-foreground">Premium football picks, a secure wallet and the ChatBase community.</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <div className="glass w-full max-w-lg rounded-3xl p-6 md:p-8">
          <div className="text-center mb-6">
            <Logo className="h-14 w-14 mx-auto lg:hidden" />
            <h1 className="font-display text-3xl font-extrabold mt-2">{title}</h1>
            <p className="text-sm text-muted-foreground mt-2">Use your email and password. No verification codes.</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/sign-in") || value.startsWith("/sign-up")) return "/dashboard";
  return value;
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="flex items-start gap-2 rounded-xl border border-loss/40 bg-loss/10 p-3 text-sm text-loss" role="alert" data-testid="auth-error"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />{message}</div>;
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  placeholder,
  minLength,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
}) {
  const icons = name === "email" ? <Mail className="h-4 w-4" /> : name === "username" || name === "fullName" ? <UserRound className="h-4 w-4" /> : name.includes("password") ? <LockKeyhole className="h-4 w-4" /> : null;
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {label}
      <span className="relative flex items-center">
        {icons && <span className="absolute left-3 text-muted-foreground">{icons}</span>}
        <input
          name={name}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          minLength={minLength}
          maxLength={maxLength}
          className={`w-full rounded-xl border border-border bg-background/70 py-3 ${icons ? "pl-10" : "px-3"} pr-3 outline-none focus:border-primary`}
          data-testid={`input-${name}`}
        />
      </span>
    </label>
  );
}

export function SignUpPage() {
  const signUp = useSignUp();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const returnTo = safeReturnTo(params.get("returnTo"));
  const [validationError, setValidationError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const password = String(values.password ?? "");
    const confirmPassword = String(values.confirmPassword ?? "");
    if (password !== confirmPassword) {
      setValidationError("Passwords do not match.");
      return;
    }
    signUp.mutate({
      data: {
        email: String(values.email ?? "").trim(),
        username: String(values.username ?? "").trim(),
        fullName: String(values.fullName ?? "").trim(),
        phone: String(values.phone ?? "").trim(),
        country: String(values.country ?? "").trim(),
        password,
        confirmPassword,
      },
    }, {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetAuthMeQueryKey(), { account: result.account, legacySession: false });
        queryClient.invalidateQueries();
        setLocation(returnTo);
      },
    });
  }

  return (
    <AuthFrame title="Create Account">
      <form onSubmit={submit} className="grid gap-4" data-testid="form-signup">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" name="fullName" autoComplete="name" minLength={2} maxLength={100} />
          <Field label="Username" name="username" autoComplete="username" placeholder="Letters, numbers or _" minLength={3} maxLength={24} />
        </div>
        <Field label="Email address" name="email" type="email" autoComplete="email" maxLength={254} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number" name="phone" type="tel" autoComplete="tel" placeholder="+254…" minLength={7} maxLength={24} />
          <Field label="Country" name="country" autoComplete="country-name" minLength={2} maxLength={80} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} />
          <Field label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} />
        </div>
        <FormError message={validationError || (signUp.error ? errMsg(signUp.error) : "")} />
        <button disabled={signUp.isPending} className="btn-blue rounded-xl py-3 font-bold disabled:opacity-60" data-testid="button-signup">
          {signUp.isPending ? "Creating account…" : "Sign Up"}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account? <Link href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`} className="font-bold text-primary">Sign in</Link>
        </p>
        {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && (
          <p className="text-center text-xs text-muted-foreground">
            To link an older account, <Link href="/legacy-sign-in" className="text-primary underline">sign in to your previous account</Link> first.
          </p>
        )}
      </form>
    </AuthFrame>
  );
}

export function SignInPage() {
  const signIn = useSignIn();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const returnTo = safeReturnTo(params.get("returnTo"));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    signIn.mutate({
      data: {
        email: String(values.email ?? "").trim(),
        password: String(values.password ?? ""),
      },
    }, {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetAuthMeQueryKey(), { account: result.account, legacySession: false });
        queryClient.invalidateQueries();
        setLocation(returnTo);
      },
    });
  }

  return (
    <AuthFrame title="Welcome Back">
      <form onSubmit={submit} className="grid gap-4" data-testid="form-signin">
        <Field label="Email address" name="email" type="email" autoComplete="email" maxLength={254} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" minLength={1} maxLength={128} />
        <FormError message={signIn.error ? errMsg(signIn.error) : ""} />
        <button disabled={signIn.isPending} className="btn-blue rounded-xl py-3 font-bold disabled:opacity-60" data-testid="button-signin">
          {signIn.isPending ? "Signing in…" : "Sign In"}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          New to ProBet Tips? <Link href="/sign-up" className="font-bold text-primary">Create account</Link>
        </p>
        {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && (
          <p className="text-center text-xs text-muted-foreground">
            Need data from an older account? <Link href="/legacy-sign-in" className="text-primary underline">Sign in to link it</Link>
          </p>
        )}
      </form>
    </AuthFrame>
  );
}

export function AdminBootstrapPage() {
  const { data, isLoading } = useGetAuthMe();
  const bootstrap = useBootstrapAdmin();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [alreadyAdmin, setAlreadyAdmin] = useState(false);

  if (isLoading) return <AppShell><PageHeader title="Admin setup" /><div className="glass rounded-2xl p-5">Checking account…</div></AppShell>;
  if (!data?.account) return <Redirect to="/sign-in?returnTo=%2Fadmin%2Fsetup" />;
  if (data.account.role === "admin") return <Redirect to="/admin" />;
  const legacySession = data.legacySession;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    bootstrap.mutate({ data: { token: String(values.token ?? "") } }, {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetAuthMeQueryKey(), { account: result.account, legacySession });
        setLocation("/admin");
      },
      onError: (error) => setAlreadyAdmin(errMsg(error).includes("already")),
    });
  }

  return (
    <AppShell title="Initial admin setup">
      <PageHeader title="Initial admin setup" subtitle="This setup code is only valid before the first administrator is created." back="/profile" />
      <form onSubmit={submit} className="glass max-w-xl rounded-3xl p-6 grid gap-4" data-testid="form-admin-bootstrap">
        <p className="text-sm text-muted-foreground">Create your account first, add the private setup code, then submit it once to enable the admin portal.</p>
        <Field label="One-time setup code" name="token" type="password" autoComplete="off" minLength={12} maxLength={256} />
        {bootstrap.error && <FormError message={alreadyAdmin ? "Admin setup has already been completed." : errMsg(bootstrap.error)} />}
        <button disabled={bootstrap.isPending} className="btn-blue rounded-xl py-3 font-bold disabled:opacity-60" data-testid="button-admin-bootstrap">
          {bootstrap.isPending ? "Setting up…" : "Set up admin access"}
        </button>
      </form>
    </AppShell>
  );
}
