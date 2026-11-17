import axiosInterceptorInstance from './axios-interceptor';
import { AdminAuth } from './admin-auth';
import {
  User,
  UserProfile,
  Role,
  RoleInput,
  ScreenDef,
  UserStats,
  CreateUserData,
  UpdateUserData,
  UserFilter,
} from '@/types/admin';
import type { Level } from './permissions';

export class AdminAPI {
  private static getAuthHeaders() {
    return AdminAuth.getAuthHeaders();
  }

  static async getAllUsers(
    filters?: UserFilter,
  ): Promise<{ users: User[]; total: number } | User[]> {
    const params = new URLSearchParams();
    if (filters?.role) {
      params.append('role', filters.role);
    }
    if (filters?.availability !== undefined) {
      params.append(
        'availability',
        filters.availability ? 'AVAILABLE' : 'UNAVAILABLE',
      );
    }
    if (filters?.isActive !== undefined) {
      params.append('status', filters.isActive ? 'ACTIVE' : 'INACTIVE');
    }
    if (filters?.department) {
      params.append('department', filters.department);
    }
    if (filters?.search) {
      params.append('search', filters.search);
    }
    if (filters?.page) {
      params.append('page', filters.page.toString());
    }
    if (filters?.limit) {
      params.append('limit', filters.limit.toString());
    }

    const response = await axiosInterceptorInstance.get(
      `/users?${params.toString()}`,
      { headers: this.getAuthHeaders() },
    );

    return response.data;
  }

  static async getUserById(userId: string): Promise<UserProfile> {
    const response = await axiosInterceptorInstance.get(`/users/${encodeURIComponent(userId)}`, {
      headers: this.getAuthHeaders(),
    });
    return response.data;
  }

  static async createUser(
    userData: CreateUserData,
  ): Promise<{ message: string; user: User }> {
    const response = await axiosInterceptorInstance.post(
      '/auth/sign-up',
      userData,
      { headers: this.getAuthHeaders() },
    );
    return response.data;
  }

  static async deleteUser(userId: string): Promise<void> {
    await axiosInterceptorInstance.delete(`/admin/users/${encodeURIComponent(userId)}`, {
      headers: this.getAuthHeaders(),
    });
  }

  static async toggleUserStatus(userId: string): Promise<User> {
    const response = await axiosInterceptorInstance.patch(
      `/admin/users/${encodeURIComponent(userId)}/toggle-status`,
      {},
      { headers: this.getAuthHeaders() },
    );
    return response.data;
  }

  static async updateUser(userId: string, data: UpdateUserData): Promise<UserProfile> {
    const response = await axiosInterceptorInstance.patch(
      `/admin/users/${encodeURIComponent(userId)}`,
      data,
      { headers: this.getAuthHeaders() },
    );
    return response.data;
  }

  /** Roles with their screens and user counts. */
  static async getAllRoles(): Promise<Role[]> {
    const response = await axiosInterceptorInstance.get('/roles', {
      headers: this.getAuthHeaders(),
    });
    return response.data;
  }

  static async getScreens(): Promise<{ levels: Level[]; screens: ScreenDef[] }> {
    const response = await axiosInterceptorInstance.get('/roles/screens', {
      headers: this.getAuthHeaders(),
    });
    return response.data;
  }

  static async createRole(data: RoleInput): Promise<Role> {
    const response = await axiosInterceptorInstance.post('/roles', data, {
      headers: this.getAuthHeaders(),
    });
    return response.data;
  }

  static async updateRole(roleId: string, data: Partial<RoleInput>): Promise<Role> {
    const response = await axiosInterceptorInstance.patch(
      `/roles/${encodeURIComponent(roleId)}`,
      data,
      { headers: this.getAuthHeaders() },
    );
    return response.data;
  }

  static async deleteRole(roleId: string): Promise<void> {
    await axiosInterceptorInstance.delete(`/roles/${encodeURIComponent(roleId)}`, {
      headers: this.getAuthHeaders(),
    });
  }

  static async getUserStats(): Promise<UserStats> {
    const response = await axiosInterceptorInstance.get('/users/stats', {
      headers: this.getAuthHeaders(),
    });
    return response.data;
  }

  static async resetPassword(data: {
    user_id: string;
    new_password: string;
  }): Promise<void> {
    await axiosInterceptorInstance.post('/auth/reset-password', data, {
      headers: this.getAuthHeaders(),
    });
  }

  /** CRM teams for linking a Medianet tech on create. */
  static async getCrmTeams(): Promise<{
    items: { id: string; label: string; email?: string | null }[];
  }> {
    const response = await axiosInterceptorInstance.get('/admin/directory/crm/teams', {
      headers: this.getAuthHeaders(),
    });
    return response.data;
  }

  /** CRM users in a team — value is crm_user_id. */
  static async getCrmUsers(teamId: string): Promise<{
    items: { id: string; label: string; email?: string | null }[];
  }> {
    const response = await axiosInterceptorInstance.get(
      `/admin/directory/crm/users?team_id=${encodeURIComponent(teamId)}`,
      { headers: this.getAuthHeaders() },
    );
    return response.data;
  }

  /** FMS Assign-to-User list — value is ooredoo_user_id. */
  static async getFmsUsers(): Promise<{
    items: { id: string; label: string; email?: string | null }[];
  }> {
    const response = await axiosInterceptorInstance.get('/admin/directory/fms/users', {
      headers: this.getAuthHeaders(),
    });
    return response.data;
  }
}
