import { createMcpHandler } from "@/mcp/http/handler";

// Muse connector endpoint: MCP streamable HTTP, stateless (docs/MCP.md). POST carries JSON-RPC;
// GET and DELETE answer 405 because there is no standalone SSE stream or session to end.
// Auth is a connector bearer token (Settings → Connect Muse), not the web session, so this path is
// deliberately outside the Auth.js proxy matcher (src/proxy.ts).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = createMcpHandler();

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handle(request);
}
