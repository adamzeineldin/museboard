import { formatRelative } from "@/components/shell/format";
import { SCOPE_LABELS } from "@/lib/connector/constants";
import type { ConnectorScope } from "@/lib/types";

// Pure: shapes for the Settings "Connect Muse" section.

export interface ConnectorActionState {
  status: "idle" | "success" | "error";
  message: string;
  /** Present only right after creation: the plaintext token, shown once. */
  created?: { token: string; name: string; scopeLabel: string };
  nonce: number;
}

export const IDLE_CONNECTOR_STATE: ConnectorActionState = { status: "idle", message: "", nonce: 0 };

export const connectorFailure = (message: string): ConnectorActionState => ({ status: "error", message, nonce: Date.now() });
export const connectorSuccess = (message: string, created?: ConnectorActionState["created"]): ConnectorActionState => ({
  status: "success",
  message,
  ...(created ? { created } : {}),
  nonce: Date.now(),
});

export interface TokenInput {
  id: string;
  name: string;
  scope: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface TokenRow {
  id: string;
  name: string;
  scopeLabel: string;
  createdLabel: string;
  lastUsedLabel: string;
  revoked: boolean;
  revokedLabel: string | null;
}

export const scopeLabel = (scope: string): string =>
  scope === "read" || scope === "write" ? SCOPE_LABELS[scope as ConnectorScope] : "Unknown access";

/** Active tokens first (newest first), then revoked ones. */
export function tokenRows(tokens: readonly TokenInput[], now: Date): TokenRow[] {
  const rows = tokens.map((token) => ({
    id: token.id,
    name: token.name,
    scopeLabel: scopeLabel(token.scope),
    createdLabel: `Created ${formatRelative(token.createdAt, now)}`,
    lastUsedLabel: token.lastUsedAt ? `Last used ${formatRelative(token.lastUsedAt, now)}` : "Never used",
    revoked: token.revokedAt !== null,
    revokedLabel: token.revokedAt ? `Revoked ${formatRelative(token.revokedAt, now)}` : null,
  }));
  return [...rows.filter((row) => !row.revoked), ...rows.filter((row) => row.revoked)];
}
