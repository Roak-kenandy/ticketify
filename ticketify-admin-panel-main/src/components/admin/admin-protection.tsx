"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminAuth } from "@/lib/admin-auth";

interface AdminProtectionProps {
  children: React.ReactNode;
}

export function AdminProtection({ children }: AdminProtectionProps) {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAdminAccess = () => {
      try {
        const token = AdminAuth.getToken();

        if (!token || !AdminAuth.isTokenValid(token)) {
          AdminAuth.clearSession();
          router.replace("/auth/login");
          return;
        }

        if (!AdminAuth.canAccessAdminPanel()) {
          router.replace("/");
          return;
        }

        setIsAuthorized(true);
      } catch {
        AdminAuth.clearSession();
        router.replace("/auth/login");
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminAccess();
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Checking admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
}
