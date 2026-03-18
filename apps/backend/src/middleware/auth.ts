import type { MiddlewareHandler } from 'hono';

const PUBLIC_PATHS = ['/api/health', '/api/hooks', '/api/webhook/gmail'];

export function createAuthMiddleware(bearerToken: string): MiddlewareHandler {
  return async (c, next) => {
    // Skip auth if no token configured (open source mode without Cloudflare)
    if (!bearerToken) return next();

    // Skip auth for public endpoints
    if (PUBLIC_PATHS.some(p => c.req.path.startsWith(p))) return next();

    const authHeader = c.req.header('Authorization');
    if (!authHeader || authHeader !== `Bearer ${bearerToken}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    return next();
  };
}
