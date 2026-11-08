# Muse connector: what the public docs say (read 2026-11-07)

Sources read: https://platform.muse.ai/docs (Connector guidelines), https://platform.muse.ai/ and
https://platform.muse.ai/terms (Connector Terms, effective 2026-09-18). The submission form at
`/login?return_to=/submission` is behind login and was NOT read.

## Confirmed
- MCP servers are in scope ("Connector Interface" includes "MCP interfaces or servers").
- Encrypt data in transit (§4.4). Never expose credentials in prompts, tool descriptions, responses, URLs, analytics or logs (§4.4).
- Stop access when authorization is revoked (§4.4).
- When OAuth connects to a user account, offer users the option to limit Muse to **Read Only** (§3.1).
- Every tool is classified **Read**, **Write** or **Sensitive write** (§3.2). A tool that mixes reads and writes counts as a write.
  Tool descriptions must be factual and must not tell Muse to ignore its rules or take unrequested actions.
- Approval prompts (§3.3): Read and Write default to "Ask on first use". Sensitive writes ask "Every use" (Allow once / Deny only).
- "Allow once" covers only the action and details shown (§3.4). A change in scope needs a fresh approval.
- Tool annotations in the submission form are "coming soon" (§5.6). Until then, document the classification in the tool docs.
- Submission needs: overview, privacy and product terms, support and security contacts, data-processing questionnaire,
  endpoint + auth setup + scopes + credentials (marked test vs production), tool docs (inputs/outputs, read/write class,
  sensitive designations, permissions, side effects, status handling, errors, rate limits), and a dedicated test account (§5).
- Review checks that sensitive writes require approval every time (§6).
- Security incidents: notify vendor-incident@meta.com within 48 hours (§4.8).

## NOT confirmed (leave TODOs, do not guess)
- Transport (streamable HTTP vs SSE) and any required endpoint path.
- OAuth 2.1 / dynamic client registration / protected-resource metadata / redirect URIs / scope names.
- Rate-limit and error-format requirements.
- Whether MCP `annotations` (`readOnlyHint`, `destructiveHint`) are read by Muse.

## How Inroad applies this
- Transport: MCP streamable HTTP at `/mcp` (MCP spec default). TODO(muse-docs): confirm.
- Auth: Bearer access tokens bound to one user, issued from Settings → Connect Muse, stored hashed, revocable,
  with a `read` or `write` scope (read-only option per §3.1). Serve `/.well-known/oauth-protected-resource`
  and return `WWW-Authenticate` on 401 per the MCP auth spec. TODO(muse-docs): replace or extend with Muse's OAuth flow.
- Each tool sets MCP annotations AND states its Muse class in its description.
  - Read: find_roles, find_warm_path, get_campaign
  - Write: draft_outreach, propose_campaign, prepare_application, record_submission, run_weekly_pass
  - Sensitive write: approve_campaign, submit_application
