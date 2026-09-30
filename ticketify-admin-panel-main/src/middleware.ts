import { NextRequest, NextResponse } from 'next/server';
import { jwtDecode } from 'jwt-decode';

interface DecodedToken {
  sub: string;
  email: string;
  crm_user_id: string;
  Roles: string[];
  iat: number;
  exp: number;
}

export function middleware(request: NextRequest) {
  // Check if the request is for admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const accessToken = request.cookies.get('access_token')?.value || 
                       request.headers.get('authorization')?.replace('Bearer ', '');

    // If we have a token in cookies, validate it
    if (accessToken) {
      try {
        const decoded = jwtDecode<DecodedToken>(accessToken);
        
        // Check if token is expired
        const currentTime = Date.now() / 1000;
        if (decoded.exp < currentTime) {
          return NextResponse.redirect(new URL('/auth/login', request.url));
        }

        // Check if user has admin role in the Roles array
        const hasAdminRole = decoded.Roles && decoded.Roles.some(role => 
          role.toLowerCase() === 'admin' ||
          role === 'Administrator' ||
          role === 'Supervisor'
        );
        
        if (!hasAdminRole) {
          // Redirect to unauthorized page or main dashboard
          return NextResponse.redirect(new URL('/', request.url));
        }

        // Allow the request to continue
        return NextResponse.next();
      } catch (error) {
        // Invalid token, redirect to login
        return NextResponse.redirect(new URL('/auth/login', request.url));
      }
    }
    
    // If no cookie token, let client-side handle it (for localStorage tokens)
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*']
};
