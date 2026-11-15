import { basePath } from "@/lib/probet";

export function Logo({ className = "h-10 w-10" }: { className?: string }) {
  return <img src={`${basePath}/logo.svg`} alt="ProBet Tips logo" className={className} />;
}

export function Wordmark({ size = "md", tagline = false }: { size?: "sm" | "md" | "lg"; tagline?: boolean }) {
  const t = size === "lg" ? "text-4xl md:text-5xl" : size === "sm" ? "text-lg" : "text-2xl";
  return (
    <div className="leading-none">
      <div className={`font-display italic font-black tracking-tight ${t}`}>
        <span className="brand-grad">ProBet </span>
        <span className="brand-grad-blue">Tips</span>
      </div>
      {tagline && (
        <div className="font-display italic font-bold text-sm md:text-base text-foreground/90 mt-1">
          Win Smarter. Bet Better.
          <div className="h-[2px] mt-1 w-full bg-gradient-to-r from-transparent via-[hsl(43_96%_56%)] to-transparent" />
        </div>
      )}
    </div>
  );
}

