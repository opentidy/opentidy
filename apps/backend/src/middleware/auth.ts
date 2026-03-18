import type { MiddlewareHandler } from 'hono';

const PUBLIC_PATHS = ['/api/health', '/api/hooks', '/api/webhook/gmail'];

export function createAuthMiddleware(bearerToken: string): MiddlewareHandler {
  return async (c, next) => {
    // Skip auth if no token configured (open source mode without Cloudflare)
    if (!bearerToken) return next();

    // Skip auth for public endpoints
    if (PUBLIC_PATHS.some(p => c.req.path.startsWith(p))) return next();

    // Skip auth for same-origin requests (SPA served by this server)
    // These are already protected by Cloudflare Access at the network level
    const origin = c.req.header('Origin') || '';
    const referer = c.req.header('Referer') || '';
    const host = c.req.header('Host') || '';
    if (origin.includes(host) || referer.includes(host)) return next();

    const authHeader = c.req.header('Authorization');
    if (!authHeader || authHeader !== `Bearer ${bearerToken}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    return next();
  };
}
