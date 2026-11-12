import {
  BarChart3,
  Boxes,
  ClipboardList,
  PackageCheck,
  PackageSearch,
  RadioTower,
  ShieldCheck,
  FileSpreadsheet,
  LayoutDashboard,
  MapPinned,
  MonitorPlay,
  Receipt,
  Smartphone,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { RouteRule } from "@/lib/access";

export type NavItem = RouteRule & {
  label: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Live map", href: "/", icon: MapPinned, screen: "live_map", exact: true },
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, screen: "dashboard" },
      {
        label: "Operations board",
        href: "/dispatch",
        icon: MonitorPlay,
        screen: "operations_board",
      },
      {
        label: "Auto-assign",
        href: "/auto-assign",
        icon: Zap,
        screen: "auto_assign",
      },
      {
        label: "Technician app",
        href: "/field",
        icon: Smartphone,
        screen: "technician_app",
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
        screen: "master_report",
      },
      {
        label: "Ticket aging",
        href: "/reports",
        icon: BarChart3,
        screen: "ticket_aging",
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
        screen: "finance_overview",
        exact: true,
      },
      {
        label: "Payments",
        href: "/finance/reports",
        icon: Receipt,
        screen: "payments",
      },
    ],
  },
  {
    label: "Inventory",
    items: [
      {
        label: "Consumption",
        href: "/inventory",
        icon: PackageSearch,
        screen: "inventory_consumption",
        exact: true,
      },
      {
        label: "Stock & hand-outs",
        href: "/inventory/stock",
        icon: PackageCheck,
        screen: "stock",
        exact: true,
      },
      {
        label: "Stock report",
        href: "/inventory/stock/report",
        icon: ClipboardList,
        screen: "stock_report",
      },
      {
        label: "Item master",
        href: "/inventory/items",
        icon: Boxes,
        screen: "item_master",
      },
      {
        label: "Provisioning log",
        href: "/provisioning",
        icon: RadioTower,
        screen: "provisioning_log",
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
        screen: "team_overview",
        exact: true,
      },
      { label: "Users", href: "/admin/users", icon: Users, screen: "users" },
      {
        label: "Roles & permissions",
        href: "/admin/roles",
        icon: ShieldCheck,
        screen: "full",
      },
    ],
  },
];

/** Pages that need more than their nav item, checked by the shell. */
export const ROUTE_RULES: RouteRule[] = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  { href: "/admin/users/create", screen: "users", level: "EDIT" },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
