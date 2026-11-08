import { resourceMetadataUrl } from "./config";

// HTTP error responses for /mcp, as JSON-RPC error bodies (what MCP clients expect from the transport).

const BASE_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" } as const;

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  const body = JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });
  return new Response(body, { status, headers: { ...BASE_HEADERS, ...headers } });
}

/** 401 with the RFC 9728 pointer to the protected-resource metadata (MCP authorization spec). */
export function unauthorized(origin: string, hadCredentials: boolean): Response {
  const challenge = hadCredentials
    ? `Bearer resource_metadata="${resourceMetadataUrl(origin)}", error="invalid_token", error_description="The access token is missing, invalid or revoked"`
    : `Bearer resource_metadata="${resourceMetadataUrl(origin)}"`;
  return jsonRpcError(401, "Unauthorized: connect Inroad from Settings → Connect Muse and use that access token.", {
    "WWW-Authenticate": challenge,
  });
}

export const forbiddenOrigin = (): Response => jsonRpcError(403, "Forbidden: origin not allowed.");

export const tooManyRequests = (retryAfterSeconds: number): Response =>
  jsonRpcError(429, "Too many requests. Slow down and retry later.", { "Retry-After": String(retryAfterSeconds) });

export const payloadTooLarge = (): Response => jsonRpcError(413, "Request body is too large (limit 1 MB).");

export const methodNotAllowed = (): Response =>
  jsonRpcError(405, "Method not allowed: this server is stateless; send JSON-RPC requests with POST.", { Allow: "POST" });

export const internalError = (): Response => jsonRpcError(500, "Internal server error.");
