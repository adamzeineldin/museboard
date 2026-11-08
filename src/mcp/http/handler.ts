import "server-only";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyBearer, type VerifiedToken } from "@/lib/connector";
import { parseBearerHeader } from "@/lib/connector/token-format";
import { createInroadMcpServer } from "../server";
import { appOrigin } from "./config";
import { createRateLimiter, FAILED_AUTH_KEY, FAILED_AUTH_RATE_LIMIT, MCP_RATE_LIMIT, type RateLimiter } from "./rate-limit";
import { forbiddenOrigin, internalError, methodNotAllowed, payloadTooLarge, tooManyRequests, unauthorized } from "./responses";

// /mcp request pipeline: Origin check (DNS-rebinding protection) -> bearer token (a well-formed token that fails
// verification counts against one global rate limit) -> per-token rate limit -> stateless streamable HTTP (a fresh server + transport per request,
// JSON responses, no sessions).

export const MAX_BODY_BYTES = 1024 * 1024;

export interface McpHandlerDeps {
  limiter?: RateLimiter;
  /** Global bucket for well-formed tokens that fail verification; over it they get 429 instead of 401. */
  failedAuthLimiter?: RateLimiter;
  verify?: (header: string | null) => Promise<VerifiedToken | null>;
  origin?: () => string;
}

/** Browsers always send Origin on cross-site requests; reject any that isn't this app. Absent = non-browser client. */
export function originAllowed(originHeader: string | null, origin: string): boolean {
  if (originHeader === null) return true;
  try {
    return new URL(originHeader).origin === origin;
  } catch {
    return false;
  }
}

function declaredBodyTooLarge(request: Request): boolean {
  const length = Number(request.headers.get("content-length") ?? "0");
  return Number.isFinite(length) && length > MAX_BODY_BYTES;
}

async function serve(request: Request, token: VerifiedToken): Promise<Response> {
  const server = createInroadMcpServer({ userId: token.userId, scope: token.scope });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: MAX_BODY_BYTES,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    // JSON response mode: the body is complete once handleRequest resolves, so closing here is safe.
    await server.close().catch((error: unknown) => {
      console.error("[mcp] closing server failed", { error: error instanceof Error ? error.message : String(error) });
    });
  }
}

export function createMcpHandler(deps: McpHandlerDeps = {}): (request: Request) => Promise<Response> {
  const limiter = deps.limiter ?? createRateLimiter(MCP_RATE_LIMIT);
  const failedAuthLimiter = deps.failedAuthLimiter ?? createRateLimiter(FAILED_AUTH_RATE_LIMIT);
  const verify = deps.verify ?? ((header: string | null) => verifyBearer(header));
  const originOf = deps.origin ?? (() => appOrigin());

  return async function handle(request) {
    try {
      const origin = originOf();
      if (!originAllowed(request.headers.get("origin"), origin)) return forbiddenOrigin();

      const authorization = request.headers.get("authorization");
      const token = await verify(authorization);
      if (!token) {
        // A missing or malformed header is a client that has not authorized yet: always send the 401 challenge.
        if (parseBearerHeader(authorization) === null) return unauthorized(origin, authorization !== null);
        const failed = failedAuthLimiter.take(FAILED_AUTH_KEY);
        return failed.allowed ? unauthorized(origin, true) : tooManyRequests(failed.retryAfterSeconds);
      }

      const decision = limiter.take(token.tokenId);
      if (!decision.allowed) return tooManyRequests(decision.retryAfterSeconds);

      // Stateless: no standalone SSE stream (GET) and no session to end (DELETE).
      if (request.method !== "POST") return methodNotAllowed();
      if (declaredBodyTooLarge(request)) return payloadTooLarge();
      return await serve(request, token);
    } catch (error) {
      console.error("[mcp] request failed", { method: request.method, error: error instanceof Error ? error.message : String(error) });
      return internalError();
    }
  };
}
