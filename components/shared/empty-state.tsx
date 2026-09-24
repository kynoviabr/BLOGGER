import * as React from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps { title: string; description: string; actionLabel?: string; onAction?: () => void; icon?: React.ReactNode; }

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-12 text-center">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-accent-foreground">{icon || <FolderOpen className="h-6 w-6" />}</div>
    <h3 className="text-base font-semibold text-foreground">{title}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    {actionLabel && onAction && <Button onClick={onAction} size="sm" className="mt-5">{actionLabel}</Button>}
  </div>;
}
