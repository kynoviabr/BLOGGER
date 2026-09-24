import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center rounded-brand-btn font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

    const variants = {
      primary: "gradient-primary text-primary-foreground shadow-glow hover:brightness-95",
      secondary: "bg-secondary text-secondary-foreground hover:opacity-85",
      outline: "border border-border bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground",
      ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      danger: "bg-destructive text-destructive-foreground hover:opacity-90 shadow-sm",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs gap-1.5",
      md: "h-10 px-4 text-sm gap-2",
      lg: "h-11 px-6 text-base gap-2.5",
    };

    return (
      <button ref={ref} className={cn(baseStyles, variants[variant], sizes[size], className)} {...props} />
    );
  }
);
Button.displayName = "Button";
