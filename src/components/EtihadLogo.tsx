import { cn } from "@/lib/utils";

// Bank al Etihad brand mark — the eight-fold swirling "wave flower": one
// curling wave petal repeated at 45° around the centre, leaving a small open
// core. Recreated as vector art to match the bank's identity. Uses
// currentColor so it adapts to its container (dark on the white logo chip,
// inherits foreground elsewhere / in dark mode).

const PETAL =
  "M 44 42 C 33 34 31 15 46 6 C 52 3 59 5 62 11 C 55 15 56 24 63 29 C 70 34 69 45 61 48 C 54 51 48 47 44 42 Z";
const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function EtihadMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("block", className)}
      role="img"
      aria-label="Bank al Etihad"
      fill="currentColor"
    >
      {ANGLES.map((a) => (
        <path key={a} d={PETAL} transform={`rotate(${a} 50 50)`} />
      ))}
    </svg>
  );
}

export function EtihadLogo({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[#0f1a2e] shadow-sm">
        <EtihadMark className="h-6 w-6" />
      </div>
      <div className="leading-tight">
        <div className="font-semibold tracking-tight">Bank al Etihad</div>
        {subtitle ? <div className="text-[11px] opacity-70">{subtitle}</div> : null}
      </div>
    </div>
  );
}
