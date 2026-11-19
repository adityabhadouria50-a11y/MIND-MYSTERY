import type { NextFunction, Request, Response } from 'express';
import { getOrCreateUser, type DbUserRow } from '../services/scoreService.ts';

declare global {
  namespace Express {
    interface Request {
      user?: DbUserRow;
    }
  }
}

// Simple sliding-window in-memory rate limiter
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimitMiddleware(maxRequests = 180, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'local'}:${req.headers['x-device-token'] || 'anon'}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please pause a moment and try again.',
        },
      });
    }
    next();
  };
}

export function attachUserMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = String(req.headers['x-device-token'] || req.query.deviceToken || '').trim();
  if (!token || token.length < 6) {
    return res.status(400).json({
      error: {
        code: 'MISSING_DEVICE_TOKEN',
        message: 'A valid device token header (X-Device-Token) is required.',
      },
    });
  }
  try {
    req.user = getOrCreateUser(token);
    next();
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'USER_INIT_FAILED',
        message: err instanceof Error ? err.message : 'Failed to initialize player profile.',
      },
    });
  }
}

export function sendApiError(res: Response, status: number, code: string, message: string, retryable = false) {
  return res.status(status).json({
    error: {
      code,
      message,
      retryable,
    },
  });
}
