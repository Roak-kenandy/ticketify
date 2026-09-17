"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';

interface DecodedToken {
  sub: string;
  email: string;
  crm_user_id: string;
  Roles: string[];
  iat: number;
  exp: number;
}

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
        const accessToken = localStorage.getItem('access_token');
        
        if (!accessToken) {
          console.log('No access token found, redirecting to login');
          router.replace('/auth/login');
          return;
        }

        const decoded = jwtDecode<DecodedToken>(accessToken);
        
        // Check if token is expired
        const currentTime = Date.now() / 1000;
        if (decoded.exp < currentTime) {
          console.log('Token expired, redirecting to login');
          localStorage.removeItem('access_token');
          router.replace('/auth/login');
          return;
        }

        // Check if user has admin role in the Roles array
        const hasAdminRole = decoded.Roles && decoded.Roles.some(role => 
          role.toLowerCase() === 'admin' || role === 'Administrator'
        );
        
        if (!hasAdminRole) {
          console.log('User does not have admin role:', decoded.Roles);
          router.replace('/');
          return;
        }

        console.log('Admin access granted for user:', decoded.email);
        setIsAuthorized(true);
      } catch (error) {
        console.error('Error checking admin access:', error);
        localStorage.removeItem('access_token');
        router.replace('/auth/login');
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
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">Checking Access...</h2>
          <p className="text-muted-foreground">Please wait while we verify your permissions.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
