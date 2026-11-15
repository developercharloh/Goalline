import { useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { getGetDashboardQueryKey } from "@workspace/api-client-react";
import type { Dashboard } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import DashboardPage, { DashboardView } from "@/pages/dashboard";
import { WalletPage, HistoryPage, TipsPage, PurchasePage, SuccessPage, ChatPage, ProfilePage } from "@/pages/pages";
import { AppShell } from "@/components/app-shell";
import { Logo, Wordmark } from "@/components/brand";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

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

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-center items-center gap-6 p-12 relative overflow-hidden">
        <div className="absolute h-96 w-96 rounded-full bg-[hsl(217_100%_50%/.3)] blur-3xl" />
        <Logo className="relative h-40 w-40" />
        <div className="relative text-center"><Wordmark size="lg" tagline /></div>
        <p className="relative max-w-sm text-center text-muted-foreground">Premium football picks, a top-up-only wallet and the ChatBase community.</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10">{children}</div>
    </div>
  );
}

function SignInPage() {
  return <AuthFrame><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></AuthFrame>;
}

function SignUpPage() {
  return <AuthFrame><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></AuthFrame>;
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

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/dashboard" /></Show>
      <Show when="signed-out"><AppShell title="ProBet Tips preview"><DashboardView guest /></AppShell></Show>
    </>
  );
}

function Protected({ children }: { children: ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

/** Bootstraps the guest/user session cookie once before any domain hooks mount,
 * so parallel first GETs can't create separate guest wallets. */
function SessionBootstrap({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/probet/dashboard", { credentials: "same-origin" });
        if (!res.ok) throw new Error("Could not load your wallet.");
        const data = (await res.json()) as Dashboard;
        if (alive) qc.setQueryData(getGetDashboardQueryKey(), data);
        if (alive) setState("ready");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => { alive = false; };
  }, [qc, attempt]);

  if (state === "ready") return <>{children}</>;
  return (
    <div className="min-h-[100dvh] grid place-items-center">
      <div className="text-center">
        <Logo className={`h-20 w-20 mx-auto ${state === "loading" ? "animate-pulse" : ""}`} />
        {state === "error" ? (
          <>
            <p className="mt-4 font-semibold">Could not reach ProBet Tips.</p>
            <button type="button" onClick={() => { setState("loading"); setAttempt((a) => a + 1); }} className="btn-blue mt-4 rounded-lg px-5 py-2 font-bold" data-testid="button-bootstrap-retry">Try again</button>
          </>
        ) : <p className="mt-4 text-sm text-muted-foreground">Loading your wallet...</p>}
      </div>
    </div>
  );
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
              <Switch>
                <Route path="/" component={HomeRedirect} />
                <Route path="/sign-in/*?" component={SignInPage} />
                <Route path="/sign-up/*?" component={SignUpPage} />
                <Route path="/dashboard"><Protected><DashboardPage /></Protected></Route>
                <Route path="/chat" component={ChatPage} />
                <Route path="/wallet" component={WalletPage} />
                <Route path="/history" component={HistoryPage} />
                <Route path="/tips" component={TipsPage} />
                <Route path="/purchase/:id" component={PurchasePage} />
                <Route path="/success" component={SuccessPage} />
                <Route path="/profile" component={ProfilePage} />
                <Route component={NotFound} />
              </Switch>
            </RoutedErrorBoundary>
          </SessionBootstrap>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function GuestHomePage() {
  return <AppShell title="Guest preview"><DashboardView guest /></AppShell>;
}

function AccountUnavailablePage() {
  return (
    <AppShell title="Account access">
      <div className="glass rounded-3xl p-8 max-w-lg text-center mx-auto">
        <Logo className="h-16 w-16 mx-auto" />
        <h2 className="font-display text-2xl font-extrabold mt-4">Sign-in is not enabled yet</h2>
        <p className="text-sm text-muted-foreground mt-2">You can continue exploring the guest demo while account access is being configured.</p>
        <a href="/" className="btn-blue inline-block rounded-xl px-5 py-2.5 font-bold mt-5">Return to demo</a>
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
            <Switch>
              <Route path="/" component={GuestHomePage} />
              <Route path="/dashboard" component={GuestHomePage} />
              <Route path="/sign-in/*?" component={AccountUnavailablePage} />
              <Route path="/sign-up/*?" component={AccountUnavailablePage} />
              <Route path="/chat" component={ChatPage} />
              <Route path="/wallet" component={WalletPage} />
              <Route path="/history" component={HistoryPage} />
              <Route path="/tips" component={TipsPage} />
              <Route path="/purchase/:id" component={PurchasePage} />
              <Route path="/success" component={SuccessPage} />
              <Route path="/profile" component={ProfilePage} />
              <Route component={NotFound} />
            </Switch>
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
