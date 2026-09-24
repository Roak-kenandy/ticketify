"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminAPI } from "@/lib/admin-api";
import { Role, CreateUserData } from "@/types/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, User } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function CreateUserPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateUserData>({
    crm_user_id: "",
    email: "",
    name: "",
    phone: "",
    password: "",
    role_id: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchRoles({ silent: true });
  }, []);

  const fetchRoles = async (options?: { silent?: boolean }) => {
    try {
      const rolesData = await AdminAPI.getAllRoles();
      setRoles(rolesData);
    } catch (error) {
      console.error("Failed to fetch roles:", error);
      if (!options?.silent) {
        toast.error("Failed to load roles");
      }
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.crm_user_id.trim()) {
      newErrors.crm_user_id = "CRM User ID is required";
    }

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (!formData.role_id) {
      newErrors.role_id = 'Role is required';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^[\d\s\-\+\(\)]+$/.test(formData.phone)) {
      newErrors.phone = 'Invalid phone number format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      const result = await AdminAPI.createUser(formData);
      if (!result?.user) {
        toast.error("User was not created. Please check the form and try again.");
        return;
      }
      toast.success("User created successfully");
      router.push("/admin/users");
    } catch (error: any) {
      console.error("Failed to create user:", error);

      // Handle specific API errors
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else if (error.response?.status === 409) {
        toast.error("User with this email already exists");
      } else {
        toast.error("Failed to create user");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof CreateUserData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Create New User
          </h1>
          <p className="text-muted-foreground">Add a new user to the system</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* User Information */}
              <div>
                <h3 className="text-lg font-semibold mb-4">
                  User Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="crm_user_id">CRM User ID *</Label>
                    <Input
                      id="crm_user_id"
                      value={formData.crm_user_id}
                      onChange={(e) =>
                        handleInputChange("crm_user_id", e.target.value)
                      }
                      placeholder="743f1b25-6132-4f5d-9457-1b0fb1c763a3"
                      className={errors.crm_user_id ? "border-destructive" : ""}
                    />
                    {errors.crm_user_id && (
                      <p className="text-sm text-destructive">{errors.crm_user_id}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        handleInputChange("email", e.target.value)
                      }
                      placeholder="its@medianet.mv"
                      className={errors.email ? "border-destructive" : ""}
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive">{errors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        handleInputChange("name", e.target.value)
                      }
                      placeholder="Mohamed Saifullah"
                      className={errors.name ? "border-destructive" : ""}
                    />
                    {errors.name && (
                      <p className="text-sm text-destructive">{errors.name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) =>
                        handleInputChange("phone", e.target.value)
                      }
                      placeholder="+9607722229"
                      className={errors.phone ? "border-destructive" : ""}
                    />
                    {errors.phone && (
                      <p className="text-sm text-destructive">{errors.phone}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password *</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) =>
                        handleInputChange("password", e.target.value)
                      }
                      placeholder="Test@123"
                      className={errors.password ? "border-destructive" : ""}
                    />
                    {errors.password && (
                      <p className="text-sm text-destructive">
                        {errors.password}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role_id">Role ID *</Label>
                    <Select
                      value={formData.role_id}
                      onValueChange={(value) =>
                        handleInputChange("role_id", value)
                      }
                    >
                      <SelectTrigger
                        className={errors.role_id ? "border-destructive" : ""}
                      >
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name} (ID: {role.id})
                            {role.description && (
                              <span className="text-muted-foreground ml-2">
                                - {role.description}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.role_id && (
                      <p className="text-sm text-destructive">
                        {errors.role_id}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-4">
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Create User
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <User className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">User Guidelines</h3>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>• Each user needs to have the same id as in the CRM system</p>
              <p>• Password must be at least 6 characters long</p>
              <p>• Email address must be unique in the system</p>
              <p>• Phone number is optional but recommended</p>
              <p>• Users can update their profile after first login</p>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-4">Available Roles</h3>
            <div className="space-y-2">
              {roles.map((role) => (
                <div key={role.id} className="p-2 border rounded">
                  <p className="font-medium text-sm">{role.name}</p>
                  {role.description && (
                    <p className="text-xs text-muted-foreground">
                      {role.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
