import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "error" | "info" | "outline";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-muted text-foreground",
    success: "border border-success/25 bg-success/10 text-success",
    warning: "border border-warning/25 bg-warning/10 text-warning",
    error: "border border-destructive/25 bg-destructive/10 text-destructive",
    info: "border border-info/25 bg-info/10 text-info",
    outline: "border border-border text-muted-foreground",
  };

  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium tracking-wide", variants[variant], className)} {...props} />
  );
}
