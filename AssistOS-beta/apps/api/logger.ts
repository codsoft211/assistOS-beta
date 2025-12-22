import pino from 'pino';
import { getRequestContext } from './middleware/request-context.js';

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'HH:MM:ss',
        },
      }
    : undefined,
  
  // Sprint 1 Gap 3: Mixin to automatically include context in all logs
  mixin: () => {
    const context = getRequestContext();
    return context ? {
      correlationId: context.correlationId,
      tenantId: context.tenantId,
      environment: context.environment,
    } : {};
  },
  
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  
  base: {
    env: process.env.NODE_ENV || 'development',
  },
  
  timestamp: pino.stdTimeFunctions.isoTime,
  
  serializers: {
    req: (req: any) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      path: req.path,
      headers: {
        host: req.headers?.host,
        'user-agent': req.headers?.['user-agent'],
        'content-type': req.headers?.['content-type'],
      },
      remoteAddress: req.ip || req.connection?.remoteAddress,
      remotePort: req.connection?.remotePort,
    }),
    
    res: (res: any) => ({
      statusCode: res.statusCode,
      headers: {
        'content-type': res.getHeader?.('content-type'),
        'content-length': res.getHeader?.('content-length'),
      },
    }),
    
    err: pino.stdSerializers.err,
    
    tenant: (tenant: any) => {
      if (!tenant) return null;
      return {
        id: tenant.id || tenant.tenantId,
        slug: tenant.slug,
        name: tenant.name,
      };
    },
    
    user: (user: any) => {
      if (!user) return null;
      return {
        id: user.id || user.userId,
        email: user.email,
        role: user.role || user.userRole,
      };
    },
  },
  
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.headers["x-access-token"]',
      'req.body.password',
      'req.body.token',
      'req.body.secret',
      'req.body.apiKey',
      'req.body.accessToken',
      'req.body.refreshToken',
      'password',
      'token',
      'secret',
      'apiKey',
      'accessToken',
      'refreshToken',
      'sessionId',
      'sessionSecret',
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
