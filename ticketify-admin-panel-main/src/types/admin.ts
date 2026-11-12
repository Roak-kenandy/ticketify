import type { Level, Screen } from "@/lib/permissions";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: {
    id: string;
    name: string;
  };
  availability: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
  avatar?: string;
}

export interface UserLog {
  id: string;
  user_id: string;
  log: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  crm_user_id: string;
  email: string;
  name: string;
  phone: string;
  availability: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
  role_id: string;
  role: {
    id: string;
    name: string;
    full_access: boolean;
    permissions: PermissionEntry[];
  };
  /** Overrides on top of the role. */
  permissions: PermissionEntry[];
  user_log: UserLog[];
  user_tickets: any[];
  user_location_tracking: any[];
  feedbacks: any[];
}

export type AccessLevel = "NONE" | Level;

export interface PermissionEntry {
  screen: Screen;
  level: AccessLevel;
}

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  is_system: boolean;
  full_access: boolean;
  field_technician: boolean;
  stock_holder: boolean;
  store: boolean;
  permissions: PermissionEntry[];
  user_count: number;
}

export type RoleInput = Pick<
  Role,
  "name" | "full_access" | "field_technician" | "stock_holder" | "store"
> & { description?: string; permissions: PermissionEntry[] };

export interface ScreenDef {
  key: Screen;
  label: string;
  group: string;
  max: Level;
  levels: Partial<Record<Level, string>>;
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  usersByRole: {
    [roleName: string]: number;
  };
}

export interface CreateUserData {
  crm_user_id: string;
  email: string;
  name: string;
  phone: string;
  password: string;
  role_id: string;
  /** Per-screen changes from the role's levels. */
  permissions?: PermissionEntry[];
}

export interface UpdateUserData {
  name?: string;
  phone?: string;
  role_id?: string;
  /** Replaces the user's overrides as a set. */
  permissions?: PermissionEntry[];
}

export interface UserFilter {
  role?: string;
  availability?: boolean;
  isActive?: boolean;
  department?: string;
  search?: string;
  page?: number;
  limit?: number;
}
