import { appOrigin } from "@/mcp/http/config";
import { protectedResourceMetadata } from "@/mcp/http/metadata";

// RFC 9728 protected-resource metadata for /mcp, referenced from the 401 WWW-Authenticate header.

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json(protectedResourceMetadata(appOrigin()), {
      headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
    });
  } catch (error) {
    console.error("[well-known] protected-resource metadata failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "server_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
