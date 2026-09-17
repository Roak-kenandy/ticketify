import axiosInterceptorInstance from './axios-interceptor';
import { AdminAuth } from './admin-auth';
import { User, UserProfile, Role, UserStats, CreateUserData, UpdateUserData, UserFilter } from '@/types/admin';

export class AdminAPI {
  private static getAuthHeaders() {
    return AdminAuth.getAuthHeaders();
  }

  // User Management
  static async getAllUsers(filters?: UserFilter): Promise<{ users: User[]; total: number }> {
    const params = new URLSearchParams();
    if (filters?.role) params.append('role', filters.role);
    if (filters?.availability !== undefined) params.append('availability', filters.availability.toString());
    if (filters?.department) params.append('department', filters.department);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const response = await axiosInterceptorInstance.get(
      `/users?${params.toString()}`,
      { headers: this.getAuthHeaders() }
    );
  
    return response.data;
  }

  static async getUserById(userId: string): Promise<UserProfile> {
    const response = await axiosInterceptorInstance.get(
      `/users/${userId}`,
      { headers: this.getAuthHeaders() }
    );
    return response.data;
  }

  static async createUser(userData: CreateUserData): Promise<User> {
    const response = await axiosInterceptorInstance.post(
      '/auth/sign-up',
      userData,
      { headers: this.getAuthHeaders() }
    );
    return response.data;
  }

  static async updateUser(userId: string, userData: UpdateUserData): Promise<User> {
    const response = await axiosInterceptorInstance.put(
      `/admin/users/${userId}`,
      userData,
      { headers: this.getAuthHeaders() }
    );
    return response.data;
  }

  static async deleteUser(userId: string): Promise<void> {
    await axiosInterceptorInstance.delete(
      `/admin/users/${userId}`,
      { headers: this.getAuthHeaders() }
    );
  }

  static async toggleUserStatus(userId: string): Promise<User> {
    const response = await axiosInterceptorInstance.patch(
      `/admin/users/${userId}/toggle-status`,
      {},
      { headers: this.getAuthHeaders() }
    );
    return response.data;
  }

  // Role Management
  static async getAllRoles(): Promise<Role[]> {
    const response = await axiosInterceptorInstance.get(
      '/auth/roles',
      { headers: this.getAuthHeaders() }
    );
    return response.data;
  }

  static async getUserStats(): Promise<UserStats> {
    const response = await axiosInterceptorInstance.get(
      '/users/stats',
      { headers: this.getAuthHeaders() }
    );
    return response.data;
  }

  // Password Reset
  static async resetUserPassword(userId: string, newPassword: string): Promise<void> {
    await axiosInterceptorInstance.patch(
      `/admin/users/${userId}/reset-password`,
      { password: newPassword },
      { headers: this.getAuthHeaders() }
    );
  }

  static async resetPassword(data: { user_id: string; new_password: string }): Promise<void> {
    await axiosInterceptorInstance.post(
      '/auth/reset-password',
      data,
      { headers: this.getAuthHeaders() }
    );
  }

  // Bulk Operations
  static async bulkUpdateUsers(userIds: string[], updateData: UpdateUserData): Promise<void> {
    await axiosInterceptorInstance.patch(
      '/admin/users/bulk-update',
      { user_ids: userIds, update_data: updateData },
      { headers: this.getAuthHeaders() }
    );
  }

  static async bulkDeleteUsers(userIds: string[]): Promise<void> {
    await axiosInterceptorInstance.delete(
      '/admin/users/bulk-delete',
      { 
        data: { user_ids: userIds },
        headers: this.getAuthHeaders() 
      }
    );
  }
}
