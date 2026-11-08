"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectorFailure, connectorSuccess, scopeLabel, type ConnectorActionState } from "@/components/connector/view-model";
import { getSessionUserId } from "@/lib/current-user";
import { CONNECTOR_SCOPES } from "@/lib/types";
import { isConnectorError, isConnectorField } from "./errors";
import { createConnectorToken, revokeToken } from "./tokens";

// Settings → Connect Muse actions. The user always comes from the web session; the form only carries the
// connection name and scope, or the id of a token to revoke (ownership is checked in the service).
// The plaintext token is returned to the browser once and never logged.

const SIGNED_OUT = "Your session ended. Sign in again.";
const createSchema = z.object({
  name: z.string().max(1000),
  scope: z.enum(CONNECTOR_SCOPES, { error: "Choose read only or read and write." }),
});
const revokeSchema = z.object({ tokenId: z.string().trim().min(1).max(100) });

function failure(error: unknown, fallback: string, context: Record<string, unknown>): ConnectorActionState {
  if (isConnectorError(error)) return connectorFailure(error.message, error.field);
  console.error("[settings] connector action failed", { ...context, error: error instanceof Error ? error.message : String(error) });
  return connectorFailure(fallback);
}

export async function createConnectorTokenAction(_prev: ConnectorActionState, formData: FormData): Promise<ConnectorActionState> {
  const userId = await getSessionUserId();
  if (!userId) return connectorFailure(SIGNED_OUT);
  const parsed = createSchema.safeParse({ name: formData.get("name") ?? "", scope: formData.get("scope") });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return connectorFailure(issue?.message ?? "Check the connection details.", isConnectorField(field) ? field : undefined);
  }

  try {
    const { token, record } = await createConnectorToken(userId, parsed.data.name, parsed.data.scope);
    revalidatePath("/settings");
    return connectorSuccess(`Created “${record.name}”. Copy the token now: Inroad won't show it again.`, {
      token,
      name: record.name,
      scopeLabel: scopeLabel(record.scope),
    });
  } catch (error) {
    return failure(error, "We couldn't create that connection. Try again in a moment.", { userId, action: "create" });
  }
}

export async function revokeConnectorTokenAction(_prev: ConnectorActionState, formData: FormData): Promise<ConnectorActionState> {
  const userId = await getSessionUserId();
  if (!userId) return connectorFailure(SIGNED_OUT);
  const parsed = revokeSchema.safeParse({ tokenId: formData.get("tokenId") });
  if (!parsed.success) return connectorFailure("We couldn't tell which connection you meant. Reload and try again.");

  try {
    const token = await revokeToken(userId, parsed.data.tokenId);
    revalidatePath("/settings");
    return connectorSuccess(`Revoked “${token.name}”. Muse can no longer use it.`);
  } catch (error) {
    return failure(error, "We couldn't revoke that connection. Try again in a moment.", { userId, action: "revoke" });
  }
}
