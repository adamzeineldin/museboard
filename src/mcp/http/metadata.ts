import { OAUTH_SCOPES } from "@/lib/connector/constants";
import { mcpEndpoint } from "./config";

// RFC 9728 OAuth 2.0 Protected Resource Metadata for the /mcp endpoint.

export interface ProtectedResourceMetadata {
  resource: string;
  resource_name: string;
  scopes_supported: string[];
  bearer_methods_supported: string[];
  authorization_servers: string[];
}

export function protectedResourceMetadata(origin: string): ProtectedResourceMetadata {
  return {
    resource: mcpEndpoint(origin),
    resource_name: "Inroad",
    scopes_supported: [OAUTH_SCOPES.read, OAUTH_SCOPES.write],
    bearer_methods_supported: ["header"],
    // TODO(muse-docs): Muse's OAuth flow (authorization server, dynamic client registration, redirect URIs,
    // scope names) is not confirmed in Meta's public connector docs. Until it is, access tokens are issued by
    // the user from Settings → Connect Muse, so no authorization server is advertised.
    authorization_servers: [],
  };
}
