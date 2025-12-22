// Migrated from AssistOS legacy - Phase 4.0
// Source: /tmp/assistos-legacy/server/middleware/rate-limit.ts

import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message: string;
  skipSuccessfulRequests?: boolean;
  skip?: (req: Request) => boolean;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skip: options.skip,
    // CRITICAL: Use session-based key instead of IP to work with trust proxy
    keyGenerator: (req: Request) => {
      // Use session ID if authenticated, otherwise fall back to a generic key
      // This prevents the trust proxy ValidationError
      const sessionId = (req.session as any)?.passport?.user || 'anonymous';
      return `${sessionId}`;
    },
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: options.message,
        retryAfter: Math.ceil(options.windowMs / 1000),
      });
    },
  });
};

export const chatRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Demasiados pedidos de chat. Por favor, aguarde um momento.',
});

export const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Demasiados uploads. Por favor, aguarde um momento.',
});

export const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Demasiados pedidos de webhook. Por favor, aguarde.',
});

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Demasiadas tentativas de autenticação. Por favor, aguarde 15 minutos.',
  skipSuccessfulRequests: true,
});

export const strictAuthRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Demasiadas tentativas falhadas. Conta temporariamente bloqueada.',
});

// Generous rate limiter for UX-critical endpoints like mark-read
// These need to work seamlessly when user clicks through conversations
export const uxRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  max: 300, // 300 requests per minute per user (5 per second)
  message: 'Demasiados pedidos. Por favor, aguarde.',
  skipSuccessfulRequests: true, // Don't count successful requests
});

// General API rate limiter
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Demasiados pedidos. Por favor, aguarde um momento.',
});

// Code generation rate limiter - strict limits to prevent abuse
// AssistBuild code generation is resource-intensive and should be carefully rate-limited
export const codeGenerationRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // 10 code generation requests per hour per user
  message: 'Limite de geração de código atingido. Por favor, aguarde antes de gerar mais código.',
  skipSuccessfulRequests: false, // Count all requests, even successful ones
});
