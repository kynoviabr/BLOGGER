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
    title: "Ideation Engine",
    href: "/ideas",
    icon: "Sparkles",
  },
  {
    title: "Content",
    href: "/content",
    icon: "FileText",
  },
  {
    title: "Editorial Calendar",
    href: "/calendar",
    icon: "Calendar",
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
