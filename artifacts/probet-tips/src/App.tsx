import { useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { getGetAuthMeQueryKey, useGetAuthMe } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import { WalletPage, TipsPage, PurchasePage, SuccessPage } from "@/pages/pages";
import { SignInPage as CredentialSignInPage, SignUpPage as CredentialSignUpPage } from "@/pages/auth";
import AccountPage from "@/pages/account";
import AdminPage from "@/pages/admin";
import DepositReviewsPage from "@/pages/deposit-reviews";
import { AppShell, ErrorCard, Sk } from "@/components/app-shell";
import { Logo } from "@/components/brand";
import { AppBootstrapScreen } from "@/components/app-bootstrap-screen";
import { ADMIN_PORTAL_URL, isAdminPortalHost, shouldRedirectAdminPathToPortal } from "@/lib/portal-host";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const APP_BOOTSTRAP_DURATION_MS = 10_000;

const configuredClerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkPubKey = configuredClerkPubKey
  ? publishableKeyFromHost(window.location.hostname, configuredClerkPubKey)
  : "";

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(217 100% 55%)",
    colorForeground: "hsl(215 60% 96%)",
    colorMutedForeground: "hsl(218 30% 72%)",
    colorDanger: "hsl(0 84% 62%)",
    colorBackground: "hsl(224 62% 12%)",
    colorInput: "hsl(224 60% 9%)",
    colorInputForeground: "hsl(215 60% 96%)",
    colorNeutral: "hsl(215 60% 96%)",
    fontFamily: "Manrope, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[hsl(224_62%_12%)] border border-[hsl(217_80%_40%/.4)] rounded-3xl w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-['Exo_2'] text-2xl font-extrabold text-[hsl(215_60%_96%)]",
    headerSubtitle: "text-[hsl(218_30%_72%)]",
    socialButtonsBlockButtonText: "text-[hsl(215_60%_96%)] font-semibold",
    formFieldLabel: "text-[hsl(215_60%_90%)] font-semibold",
    footerActionLink: "text-[hsl(212_100%_65%)] font-bold",
    footerActionText: "text-[hsl(218_30%_72%)]",
    dividerText: "text-[hsl(218_30%_72%)]",
    identityPreviewEditButton: "text-[hsl(212_100%_65%)]",
    formFieldSuccessText: "text-[hsl(142_72%_55%)]",
    alertText: "text-[hsl(215_60%_96%)]",
    logoBox: "h-16 justify-center",
    logoImage: "h-16 w-16",
    socialButtonsBlockButton: "bg-[hsl(222_55%_18%)] border border-[hsl(220_60%_26%)]",
    formButtonPrimary: "bg-gradient-to-b from-[hsl(214_100%_60%)] to-[hsl(222_100%_48%)] text-white font-bold py-2.5",
    formFieldInput: "bg-[hsl(224_60%_9%)] border-[hsl(220_55%_26%)] text-[hsl(215_60%_96%)]",
    footerAction: "justify-center",
    dividerLine: "bg-[hsl(220_60%_22%)]",
    alert: "bg-[hsl(0_84%_60%/.12)] border border-[hsl(0_84%_60%/.4)]",
    otpCodeFieldInput: "bg-[hsl(224_60%_9%)] border-[hsl(220_55%_26%)] text-[hsl(215_60%_96%)]",
    formFieldRow: "gap-3",
    main: "gap-5",
  },
};

function LegacySignInPage() {
  return (
    <div className="min-h-[100dvh] grid place-items-center p-4">
      <div className="glass w-full max-w-lg rounded-3xl p-5 md:p-8">
        <p className="mb-4 text-center text-sm text-muted-foreground">Sign in here only to link data from an older account.</p>
        <SignIn routing="path" path={`${basePath}/legacy-sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/profile`} />
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRoute() {
  return <Redirect to="/dashboard" />;
}

/** Bootstraps the guest/user session cookie once before any domain hooks mount,
 * so parallel first GETs can't create separate guest wallets. */
function SessionBootstrap({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let alive = true;
    let bootstrapResult: "pending" | "ready" | "error" = "pending";
    const controller = new AbortController();
    const startedAt = performance.now();
    const progressTimer = window.setInterval(() => {
      if (!alive) return;
      setProgress(Math.min((performance.now() - startedAt) / APP_BOOTSTRAP_DURATION_MS, 1));
    }, 50);
    const timer = window.setTimeout(() => {
      if (!alive) return;
      window.clearInterval(progressTimer);
      setProgress(1);
      if (bootstrapResult === "ready") {
        setState("ready");
      } else {
        controller.abort();
        setState("error");
      }
    }, APP_BOOTSTRAP_DURATION_MS);

    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Could not check your sign-in.");
        const data = await res.json();
        if (!alive) return;
        qc.setQueryData(getGetAuthMeQueryKey(), data);
        bootstrapResult = "ready";
      } catch {
        if (alive) bootstrapResult = "error";
      }
    })();
    return () => {
      alive = false;
      window.clearInterval(progressTimer);
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [qc, attempt]);

  if (state === "ready") return <>{children}</>;
  return <AppBootstrapScreen
    state={state}
    progress={progress}
    onRetry={() => {
      setProgress(0);
      setState("loading");
      setAttempt((a) => a + 1);
    }}
  />;
}

function AppRoutes({ legacyAvailable }: { legacyAvailable: boolean }) {
  const auth = useGetAuthMe();
  const [location] = useLocation();
  const path = location.split("?")[0];
  const adminPath = path === "/admin" || path.startsWith("/admin/");
  const adminPortalHost = isAdminPortalHost();
  const redirectToAdminPortal = adminPath && shouldRedirectAdminPathToPortal();
  const isPublicAuthRoute = ["/sign-in", "/sign-up", "/legacy-sign-in"]
    .some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

  useEffect(() => {
    if (redirectToAdminPortal) window.location.replace(ADMIN_PORTAL_URL);
  }, [redirectToAdminPortal]);

  if (redirectToAdminPortal) {
    return <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">Opening the Admin portal…</div>;
  }
  if (adminPortalHost && adminPath) return <Redirect to="/" />;
  if (adminPortalHost && path !== "/" && !isPublicAuthRoute) return <Redirect to="/" />;

  if (auth.isLoading) return <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">Checking your account…</div>;
  if (auth.error) {
    return (
      <AppShell title="Account access" adminPortal={adminPortalHost}>
        <ErrorCard message="Could not verify your sign-in. Please try again." onRetry={() => void auth.refetch()} />
      </AppShell>
    );
  }
  if (!adminPortalHost && path === "/" && !auth.data?.account) {
    return <Redirect to="/sign-up" />;
  }
  if (!isPublicAuthRoute && !auth.data?.account) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    return <Redirect to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`} />;
  }

  return (
    <Switch>
      <Route path="/" component={adminPortalHost ? AdminPage : HomeRoute} />
      <Route path="/sign-in/*?" component={CredentialSignInPage} />
      <Route path="/sign-up/*?" component={CredentialSignUpPage} />
      <Route path="/legacy-sign-in/*?" component={legacyAvailable ? LegacySignInPage : AccountUnavailablePage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/chat" component={() => <Redirect to="/dashboard" />} />
      <Route path="/wallet" component={WalletRoute} />
      <Route path="/tips" component={TipsPage} />
      <Route path="/purchase/:id" component={PurchasePage} />
      <Route path="/success" component={SuccessPage} />
      <Route path="/deposit-reviews" component={DepositReviewsPage} />
      <Route path="/profile" component={AccountPage} />
      <Route path="/admin/setup" component={() => <Redirect to="/admin" />} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function WalletRoute() {
  const { data: session } = useGetAuthMe();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [linkState, setLinkState] = useState<"idle" | "linking" | "linked" | "empty" | "error">("idle");
  const [message, setMessage] = useState("");
  const attempted = useRef(false);

  useEffect(() => {
    if (!session?.account || attempted.current || new URLSearchParams(window.location.search).get("link") !== "1") return;
    attempted.current = true;
    setLinkState("linking");
    setLocation("/wallet", { replace: true });
    void (async () => {
      try {
        const response = await fetch("/api/probet/wallet/link", { method: "POST", credentials: "same-origin" });
        const data = await response.json() as { linked?: boolean; message?: string; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not link this wallet.");
        setLinkState(data.linked ? "linked" : "empty");
        setMessage(data.linked ? "Your browser wallet is now saved to this account." : data.message || "Your account wallet is ready.");
        await queryClient.invalidateQueries();
      } catch (error) {
        setLinkState("error");
        setMessage(error instanceof Error ? error.message : "Could not link this wallet.");
      }
    })();
  }, [session?.account, queryClient, setLocation]);

  const accountLinkContent = linkState === "idle" ? null : (
    <div
      className={`mt-4 rounded-2xl border p-4 text-sm ${linkState === "error" ? "border-loss/40 bg-loss/10 text-loss" : "border-primary/30 bg-primary/10"}`}
      role={linkState === "error" ? "alert" : "status"}
      data-testid="status-wallet-link"
    >
      {linkState === "linking" ? "Saving your wallet to this account..." : message}
    </div>
  );
  return <WalletPage accountLinkContent={accountLinkContent} />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome Back!", subtitle: "Sign in to access premium tips" } },
        signUp: { start: { title: "Create Account", subtitle: "Join today and get access to premium betting tips." } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <SessionBootstrap>
            <RoutedErrorBoundary>
              <AppRoutes legacyAvailable />
            </RoutedErrorBoundary>
          </SessionBootstrap>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function AccountUnavailablePage() {
  return (
    <AppShell title="Previous account">
      <div className="glass rounded-3xl p-8 max-w-lg text-center mx-auto">
        <Logo className="h-16 w-16 mx-auto" />
        <h2 className="font-display text-2xl font-extrabold mt-4">Previous-account linking is unavailable</h2>
        <p className="text-sm text-muted-foreground mt-2">You can still create and use a new email-and-password account.</p>
        <a href="/" className="btn-blue inline-block rounded-xl px-5 py-2.5 font-bold mt-5">Return home</a>
      </div>
    </AppShell>
  );
}

function GuestPreviewRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SessionBootstrap>
          <RoutedErrorBoundary>
            <AppRoutes legacyAvailable={false} />
          </RoutedErrorBoundary>
        </SessionBootstrap>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      {clerkPubKey ? <ClerkProviderWithRoutes /> : <GuestPreviewRoutes />}
    </WouterRouter>
  );
}

export default App;
