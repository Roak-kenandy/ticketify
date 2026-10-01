import {
  BarChart3,
  FileSpreadsheet,
  LayoutDashboard,
  MapPinned,
  MonitorPlay,
  Receipt,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AccessKey } from "@/lib/access";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  access: AccessKey;
  exact?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Live map", href: "/", icon: MapPinned, access: "ops", exact: true },
      {
        label: "Operations board",
        href: "/dispatch",
        icon: MonitorPlay,
        access: "dispatch",
      },
      {
        label: "Auto-assign",
        href: "/auto-assign",
        icon: Zap,
        access: "dispatch-manage",
      },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        label: "Master report",
        href: "/admin/reports",
        icon: FileSpreadsheet,
        access: "reports",
      },
      {
        label: "Ticket aging",
        href: "/reports",
        icon: BarChart3,
        access: "reports",
        exact: true,
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Finance overview",
        href: "/finance",
        icon: Wallet,
        access: "finance",
        exact: true,
      },
      {
        label: "Payments",
        href: "/finance/reports",
        icon: Receipt,
        access: "finance",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        label: "Team overview",
        href: "/admin",
        icon: LayoutDashboard,
        access: "admin",
        exact: true,
      },
      { label: "Users", href: "/admin/users", icon: Users, access: "admin" },
    ],
  },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
