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
    title: "Blogs",
    href: "/blogs",
    icon: "Globe",
  },
  {
    title: "Editorial Calendar",
    href: "/calendar",
    icon: "Calendar",
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
    title: "Media",
    href: "/media",
    icon: "Image",
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
