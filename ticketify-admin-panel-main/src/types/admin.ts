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
  created_at: string;
  updated_at: string;
  last_login?: string;
  role_id: string;
  role: {
    name: string;
  };
  user_log: UserLog[];
  user_tickets: any[];
  user_location_tracking: any[];
  feedbacks: any[];
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
  description?: string;
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
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  phone?: string;
  role_id?: string;
  availability?: boolean;
  department?: string;
  address?: string;
  emergency_contact?: string;
  skills?: string[];
  certifications?: string[];
}

export interface UserFilter {
  role?: string;
  availability?: boolean;
  department?: string;
  search?: string;
  page?: number;
  limit?: number;
}
