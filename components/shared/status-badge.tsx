import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  errorMessage?: string | null;
}

export function StatusBadge({ status, errorMessage }: StatusBadgeProps) {
  const normalized = status.toUpperCase();

  let badgeElement: React.ReactNode;

  switch (normalized) {
    case "ACTIVE":
    case "PUBLISHED":
    case "COMPLETED":
      badgeElement = <Badge variant="success">{status}</Badge>;
      break;
    case "IN_PROGRESS":
    case "SCHEDULED":
    case "RUNNING":
    case "PUBLISHING":
      badgeElement = <Badge variant="info">{status}</Badge>;
      break;
    case "IDEA":
    case "PLANNED":
    case "DRAFT":
    case "REVIEWING":
    case "READY":
      badgeElement = <Badge variant="warning">{status}</Badge>;
      break;
    case "FAILED":
    case "PUBLISH_FAILED":
    case "ERROR":
      badgeElement = (
        <Badge variant="error" className="cursor-help inline-flex items-center gap-1">
          {errorMessage && <AlertTriangle className="h-3 w-3 shrink-0" />}
          {status}
        </Badge>
      );
      break;
    case "INACTIVE":
    case "ARCHIVED":
    default:
      badgeElement = <Badge variant="default">{status}</Badge>;
      break;
  }

  if ((normalized === "FAILED" || normalized === "PUBLISH_FAILED" || normalized === "ERROR") && errorMessage) {
    return (
      <Tooltip
        side="top"
        content={
          <div className="space-y-1 text-left">
            <div className="font-semibold text-rose-300 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
              <span>Último erro registrado:</span>
            </div>
            <p className="text-slate-200 text-[11px] leading-snug break-words">
              {errorMessage}
            </p>
          </div>
        }
      >
        {badgeElement}
      </Tooltip>
    );
  }

  return badgeElement;
}
