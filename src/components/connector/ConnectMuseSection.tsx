import { EmptyState, Panel } from "@/components/ui";
import { createConnectorTokenAction, revokeConnectorTokenAction } from "@/lib/connector/actions";
import { listTokens } from "@/lib/connector";
import { appOrigin, mcpEndpoint } from "@/mcp/http/config";
import { CopyField } from "./CopyField";
import { CreateTokenForm } from "./CreateTokenForm";
import { TokenList } from "./TokenList";
import { tokenRows } from "./view-model";

export interface ConnectMuseSectionProps {
  userId: string;
}

/** Settings → Connect Muse: issue, list and revoke the access tokens Muse uses to call Inroad's /mcp endpoint. */
export async function ConnectMuseSection({ userId }: ConnectMuseSectionProps) {
  const endpoint = mcpEndpoint(appOrigin());
  const tokens = await listTokens(userId);
  const rows = tokenRows(tokens, new Date());

  return (
    <Panel aria-labelledby="connect-muse-title">
      <div className="flex flex-col gap-1">
        <h2 id="connect-muse-title">Connect Muse</h2>
        <p className="muted">
          Let Meta&apos;s Muse agent use Inroad for you. Create an access token, then add Inroad in Muse with the server URL and
          token below. Muse still asks you before it acts, and approving campaign rules or submitting an application asks every
          time. You can revoke access here at any moment.
        </p>
      </div>
      <CopyField label="Server URL" value={endpoint} hint="MCP over streamable HTTP. Send the token as Authorization: Bearer <token>." />
      <CreateTokenForm action={createConnectorTokenAction} />
      {rows.length === 0 ? (
        <EmptyState title="No connections yet" framed={false}>
          Tokens you create show up here with when Muse last used them.
        </EmptyState>
      ) : (
        <TokenList tokens={rows} revokeAction={revokeConnectorTokenAction} />
      )}
    </Panel>
  );
}
