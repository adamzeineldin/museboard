import "server-only";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyBearer, type VerifiedToken } from "@/lib/connector";
import { createInroadMcpServer } from "../server";
import { appOrigin } from "./config";
import { createRateLimiter, MCP_RATE_LIMIT, type RateLimiter } from "./rate-limit";
import { forbiddenOrigin, internalError, methodNotAllowed, payloadTooLarge, tooManyRequests, unauthorized } from "./responses";

// /mcp request pipeline: Origin check (DNS-rebinding protection) -> bearer token -> per-token rate limit
// -> stateless streamable HTTP (a fresh server + transport per request, JSON responses, no sessions).

export const MAX_BODY_BYTES = 1024 * 1024;

export interface McpHandlerDeps {
  limiter?: RateLimiter;
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
  const verify = deps.verify ?? ((header: string | null) => verifyBearer(header));
  const originOf = deps.origin ?? (() => appOrigin());

  return async function handle(request) {
    try {
      const origin = originOf();
      if (!originAllowed(request.headers.get("origin"), origin)) return forbiddenOrigin();

      const authorization = request.headers.get("authorization");
      const token = await verify(authorization);
      if (!token) return unauthorized(origin, authorization !== null);

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
