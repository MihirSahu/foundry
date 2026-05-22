import { cn } from "@/lib/utils";

type BadgeTone = "default" | "success" | "warning" | "accent" | "violet";

const toneClass: Record<BadgeTone, string> = {
  default: "border-[var(--border)] bg-[var(--panel-strong)] text-[var(--muted-foreground)]",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  accent: "border-orange-200 bg-orange-50 text-orange-800",
  violet: "border-violet-200 bg-violet-50 text-violet-800",
};

export function Badge({
  children,
  className,
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-md border px-2.5 text-xs font-semibold",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
