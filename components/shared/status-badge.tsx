import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status.toUpperCase();

  switch (normalized) {
    case "ACTIVE":
    case "PUBLISHED":
    case "COMPLETED":
      return <Badge variant="success">{status}</Badge>;
    case "IN_PROGRESS":
    case "SCHEDULED":
    case "RUNNING":
      return <Badge variant="info">{status}</Badge>;
    case "IDEA":
    case "PLANNED":
    case "DRAFT":
    case "REVIEWING":
    case "READY":
      return <Badge variant="warning">{status}</Badge>;
    case "FAILED":
    case "ERROR":
      return <Badge variant="error">{status}</Badge>;
    case "INACTIVE":
    case "ARCHIVED":
    default:
      return <Badge variant="default">{status}</Badge>;
  }
}
