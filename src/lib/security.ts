import "server-only";

import { createHash } from "node:crypto";

/**
 * Maximum permitted request body size in bytes (64 KB)
 * Protects serverless functions against memory exhaustion attacks.
 */
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

/**
 * In-memory sliding window rate limiter for bounded serverless protection.
 */
interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitBucket>();

// Periodic cleanup of expired rate limit buckets to prevent memory accumulation
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function purgeExpiredBuckets() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of rateLimitMap.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * Check if a client has exceeded their allowed rate limit.
 * @param identifier Client IP, token hash, or correlation identifier
 * @param maxRequests Maximum requests allowed within window (default: 60)
 * @param windowMs Time window in milliseconds (default: 60,000 ms)
 */
export function checkRateLimit(
  identifier: string,
  maxRequests = 60,
  windowMs = 60_000,
): { allowed: boolean; remaining: number; resetSeconds: number } {
  purgeExpiredBuckets();

  const now = Date.now();
  const bucketKey = `${identifier}:${Math.floor(now / windowMs)}`;
  const existing = rateLimitMap.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    const newBucket: RateLimitBucket = {
      count: 1,
      resetAt: now + windowMs,
    };
    rateLimitMap.set(bucketKey, newBucket);
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetSeconds: Math.ceil(windowMs / 1000),
    };
  }

  existing.count += 1;
  const remaining = Math.max(0, maxRequests - existing.count);
  const resetSeconds = Math.ceil((existing.resetAt - now) / 1000);

  return {
    allowed: existing.count <= maxRequests,
    remaining,
    resetSeconds,
  };
}

/**
 * Extracts a client identifier for rate limiting without exposing raw PII.
 */
export function getClientFingerprint(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const authHeader = request.headers.get("authorization") ?? "";

  const rawIp = forwardedFor ? forwardedFor.split(",")[0].trim() : realIp || "127.0.0.1";
  const seed = `${rawIp}:${authHeader.slice(0, 16)}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

/**
 * Validates request Origin and Referer for CSRF protection on state-changing methods.
 */
export function validateOrigin(request: Request): { valid: boolean; reason?: string } {
  const method = request.method.toUpperCase();
  // Safe HTTP methods do not require CSRF checks
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { valid: true };
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");

  if (!origin && !referer) {
    // Direct server-to-server or API calls without Origin header are allowed
    // provided they carry the valid Bearer run token.
    return { valid: true };
  }

  const targetOrigin = origin || (referer ? new URL(referer).origin : null);
  if (!targetOrigin) {
    return { valid: false, reason: "Malformed origin or referer header." };
  }

  try {
    const originUrl = new URL(targetOrigin);
    if (host && originUrl.host.toLowerCase() !== host.toLowerCase()) {
      return { valid: false, reason: `Cross-site origin rejected: ${originUrl.host} vs ${host}` };
    }
  } catch {
    return { valid: false, reason: "Invalid origin URL format." };
  }

  return { valid: true };
}

/**
 * Checks request Content-Length header against maximum allowed bytes.
 */
export function validateRequestSize(
  request: Request,
  maxBytes = MAX_REQUEST_BODY_BYTES,
): { valid: boolean; error?: string } {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsed = parseInt(contentLength, 10);
    if (!Number.isNaN(parsed) && parsed > maxBytes) {
      return {
        valid: false,
        error: `Payload too large. Maximum body size is ${Math.round(maxBytes / 1024)}KB.`,
      };
    }
  }
  return { valid: true };
}

/**
 * Scrubs passwords, API tokens, database connection strings, and keys from any string or object.
 */
export function redactSecrets(input: unknown): unknown {
  if (typeof input === "string") {
    return (
      input
        // Redact PostgreSQL connection URIs: postgresql://user:pass@host/db
        .replace(/postgresql:\/\/[^:]+:[^@]+@/gi, "postgresql://[REDACTED]:[REDACTED]@")
        // Redact Bearer tokens
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
        // Redact GitHub personal access tokens
        .replace(/ghp_[A-Za-z0-9_]{20,}/gi, "ghp_[REDACTED]")
        // Redact Google / Gemini API keys
        .replace(/AIzaSy[A-Za-z0-9_-]{33}/gi, "AIzaSy[REDACTED]")
        .replace(/AQ\.[A-Za-z0-9._-]{30,}/gi, "AQ.[REDACTED]")
        // Redact OpenAI keys
        .replace(/sk-[A-Za-z0-9_-]{20,}/gi, "sk-[REDACTED]")
    );
  }

  if (Array.isArray(input)) {
    return input.map(redactSecrets);
  }

  if (input !== null && typeof input === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("token") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("password") ||
        lowerKey.includes("key") ||
        lowerKey.includes("authorization")
      ) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = redactSecrets(value);
      }
    }
    return sanitized;
  }

  return input;
}

/**
 * Structured security logging helper.
 */
export function logSecurityEvent(event: {
  correlationId: string;
  route: string;
  method: string;
  status: number;
  durationMs?: number;
  message?: string;
  error?: string;
}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: "http_request",
    correlationId: event.correlationId,
    route: event.route,
    method: event.method,
    status: event.status,
    durationMs: event.durationMs ?? 0,
    message: event.message ? redactSecrets(event.message) : undefined,
    error: event.error ? redactSecrets(event.error) : undefined,
  };

  if (event.status >= 500) {
    console.error(JSON.stringify(logEntry));
  } else if (event.status >= 400) {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}
