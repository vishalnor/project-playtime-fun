import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AppBackground({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-linear-to-b from-[#eef2ff] via-[#f6f4ff] to-[#e9f2ff]">
      <div className="blob pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full bg-brand/40 blur-3xl" />
      <div className="blob2 pointer-events-none absolute top-40 -right-20 h-72 w-72 rounded-full bg-violet/30 blur-3xl" />
      <div className="blob pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-cyan-300/40 blur-3xl" />
      <div className="relative mx-auto w-full max-w-3xl px-5 py-5">{children}</div>
    </div>
  );
}

export function Panel({
  children,
  className,
  elevated,
}: {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl p-5",
        elevated ? "glass lift" : "glass-soft",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-medium tracking-[0.16em] text-slate-400 uppercase">
      {children}
    </p>
  );
}

export function Pill({
  tone = "brand",
  children,
}: {
  tone?: "brand" | "success" | "warning" | "danger" | "muted";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    brand: "bg-brand/12 text-brand",
    success: "bg-success/15 text-success",
    warning: "bg-warning/18 text-amber-700",
    danger: "bg-danger/12 text-danger",
    muted: "bg-white/70 text-slate-500",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
