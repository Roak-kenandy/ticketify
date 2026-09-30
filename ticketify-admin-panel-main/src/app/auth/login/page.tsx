"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminAuth } from "@/lib/admin-auth";
import axiosInterceptorInstance from "@/lib/axios-interceptor";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = AdminAuth.getToken();
    if (token && AdminAuth.isTokenValid(token)) {
      router.replace(AdminAuth.isFinance() ? "/finance" : "/");
    }
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email || !password) {
      toast.error("Please enter both email and password");
      return;
    }

    setSubmitting(true);
    try {
      const response = await axiosInterceptorInstance.post("/auth/login", {
        email,
        password,
      });

      const roleName = response.data?.user?.role?.name ?? "";
      const allowedRoles = [
        "Admin",
        "Administrator",
        "Supervisor",
        "CEO",
        "Finance",
      ];

      if (!allowedRoles.includes(roleName)) {
        AdminAuth.clearSession();
        toast.error("You are not authorized to access this application");
        return;
      }

      AdminAuth.setToken(response.data.access_token);
      if (response.data.refresh_token) {
        localStorage.setItem("refresh_token", response.data.refresh_token);
      }
      localStorage.setItem("user", JSON.stringify(response.data.user));

      toast.success("Login successful");
      router.replace("/");
    } catch (error: any) {
      AdminAuth.clearSession();
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        toast.error("Invalid email or password");
      } else {
        toast.error("Login failed. Please try again later.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full h-screen lg:grid lg:min-h-[600px] lg:grid-cols-2 xl:min-h-[800px]">
      <div className="flex items-center justify-center py-12">
        <form onSubmit={handleSubmit} className="mx-auto grid w-[350px] gap-6">
          <div className="grid gap-2 text-center">
            <h1 className="text-3xl font-bold">Ticketify Login</h1>
            <p className="text-balance text-muted-foreground">
              Enter your email below to login to your account
            </p>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in..." : "Login"}
            </Button>
          </div>
        </form>
      </div>

      <div className="hidden bg-muted lg:block bg-gradient-to-tr from-blue-950 to-blue-800 text-white relative" />
    </div>
  );
}
