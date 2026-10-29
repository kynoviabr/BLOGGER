export interface NavItem {
  title: string;
  href: string;
  icon: string;
  badge?: string;
}

export const navigationItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/",
    icon: "LayoutDashboard",
  },
  {
    title: "Ideias",
    href: "/ideas",
    icon: "Sparkles",
  },
  {
    title: "Produção",
    href: "/content?status=researching",
    icon: "Layers",
  },
  {
    title: "Revisão e Aprovação",
    href: "/content?status=reviewing",
    icon: "FileText",
  },
  {
    title: "Calendário",
    href: "/calendar",
    icon: "Calendar",
  },
  {
    title: "Publicação",
    href: "/content?status=scheduled",
    icon: "Send",
  },
  {
    title: "Monetization",
    href: "/monetization",
    icon: "BadgeDollarSign",
  },
  {
    title: "Media",
    href: "/media",
    icon: "Image",
  },
  {
    title: "Blogs",
    href: "/blogs",
    icon: "Globe",
  },
  {
    title: "Team",
    href: "/team",
    icon: "Users",
  },
  {
    title: "Logs",
    href: "/logs",
    icon: "ScrollText",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: "Settings",
  },
];
