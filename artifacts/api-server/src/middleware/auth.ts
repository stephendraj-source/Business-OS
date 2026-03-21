import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'nonprofit-os-jwt-secret-2024';

export interface AuthPayload {
  userId: number;
  tenantId: number | null;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    req.auth = undefined;
    return next();
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.auth = payload;
  } catch {
    req.auth = undefined;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

export function requireSuperUser(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || req.auth.role !== 'superuser') {
    return res.status(403).json({ error: 'Forbidden — superuser only' });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.auth.tenantId) return res.status(403).json({ error: 'Forbidden — tenant users only' });
  if (req.auth.role !== 'admin' && req.auth.role !== 'superuser') {
    return res.status(403).json({ error: 'Forbidden — admin role required' });
  }
  next();
}
