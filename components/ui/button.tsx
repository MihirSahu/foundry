import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded px-5 text-base font-normal leading-8 transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-active)]",
        secondary: "border border-[var(--border-strong)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]",
        accent: "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-active)]",
        ghost: "text-[var(--foreground)] hover:bg-[var(--muted)]",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-9 px-4 text-sm",
        icon: "h-[38px] w-[38px] px-0 text-2xl leading-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
