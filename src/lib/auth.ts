import type { Env, User } from './types';

// JWT utilities for Cloudflare Workers
// Using Web Crypto API for signing and verification

interface JWTPayload {
  sub: string;    // user_id
  exp: number;    // expiration time
  iat: number;    // issued at
  jti: string;    // JWT ID (for session tracking)
}

export class AuthService {
  constructor(private env: Env) {}

  // Generate a secure random string for JWT ID and connection codes
  generateRandomString(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomValues = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(randomValues, byte => chars[byte % chars.length]).join('');
  }

  // Generate a 6-digit connection code
  generateConnectionCode(): string {
    const randomValues = crypto.getRandomValues(new Uint8Array(6));
    return Array.from(randomValues, byte => (byte % 10).toString()).join('');
  }

  // Create JWT token
  async createJWT(userId: string, sessionId: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (7 * 24 * 60 * 60); // 7 days

    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const payload: JWTPayload = {
      sub: userId,
      exp,
      iat: now,
      jti: sessionId
    };

    const headerB64 = btoa(JSON.stringify(header));
    const payloadB64 = btoa(JSON.stringify(payload));
    const data = `${headerB64}.${payloadB64}`;

    // Sign with HMAC SHA-256
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.env.JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(data)
    );

    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return `${data}.${signatureB64}`;
  }

  // Verify JWT token
  async verifyJWT(token: string): Promise<JWTPayload | null> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [headerB64, payloadB64, signatureB64] = parts;
      const data = `${headerB64}.${payloadB64}`;

      // Verify signature
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(this.env.JWT_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
      const isValid = await crypto.subtle.verify(
        'HMAC',
        key,
        signature,
        new TextEncoder().encode(data)
      );

      if (!isValid) return null;

      // Decode payload
      const payload: JWTPayload = JSON.parse(atob(payloadB64));

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) return null;

      return payload;
    } catch {
      return null;
    }
  }

  // Extract token from Authorization header or cookie
  extractToken(request: Request): string | null {
    // Try Authorization header first
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // Try cookie
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
      const cookies = new Map(
        cookieHeader.split('; ').map(cookie => {
          const [key, value] = cookie.split('=');
          return [key, decodeURIComponent(value)];
        })
      );
      return cookies.get('auth_token') || null;
    }

    return null;
  }

  // Create secure cookie for token
  createAuthCookie(token: string, maxAge: number = 7 * 24 * 60 * 60): string {
    return `auth_token=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}; Path=/`;
  }

  // Create logout cookie
  createLogoutCookie(): string {
    return 'auth_token=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/';
  }

  // GitHub OAuth URLs
  getGitHubOAuthURL(state?: string, apiUrl?: string): string {
    // Use the current request URL to build the callback URL, or fallback to env
    const baseUrl = apiUrl || this.env.FRONTEND_URL;
    const params = new URLSearchParams({
      client_id: this.env.GITHUB_CLIENT_ID,
      redirect_uri: `${baseUrl}/auth/callback`,
      scope: 'user:email',
      state: state || this.generateRandomString(16)
    });

    return `https://github.com/login/oauth/authorize?${params}`;
  }

  // Exchange GitHub code for access token
  async exchangeGitHubCode(code: string): Promise<string | null> {
    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: this.env.GITHUB_CLIENT_ID,
          client_secret: this.env.GITHUB_CLIENT_SECRET,
          code
        })
      });

      const data = await response.json();
      return data.access_token || null;
    } catch {
      return null;
    }
  }

  // Get GitHub user info
  async getGitHubUser(accessToken: string): Promise<any | null> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitPing-Bot/1.0'
        }
      });

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  // Get GitHub user emails
  async getGitHubUserEmails(accessToken: string): Promise<any[] | null> {
    try {
      const response = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitPing-Bot/1.0'
        }
      });

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
}