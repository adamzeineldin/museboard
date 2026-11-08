# Inroad connector for Muse (MCP)

Inroad is a job-search copilot for students going after SWE internships and new-grad roles. This document is the
connector documentation in the shape Muse's submission asks for (connector guidelines §5.4): endpoint, transport,
auth, scopes, credentials, every tool, errors and rate limits, plus a reviewer test-account recipe.
What Meta's public docs do and do not confirm is in [`MUSE_CONNECTOR_NOTES.md`](MUSE_CONNECTOR_NOTES.md).

Code: `src/mcp/` (server, tools, HTTP pipeline), `src/app/mcp/route.ts`, `src/app/.well-known/oauth-protected-resource/route.ts`,
`src/lib/connector/` (tokens), `src/components/connector/` (Settings UI).

## Endpoint and transport

| | |
| --- | --- |
| Endpoint | `POST <APP_URL>/mcp` (local: `http://localhost:3000/mcp`) |
| Transport | MCP streamable HTTP, **stateless**: no `Mcp-Session-Id`; every POST is answered with a JSON body (`enableJsonResponse`) |
| `GET /mcp`, `DELETE /mcp` | `405` with `Allow: POST` (no standalone SSE stream, no session to end) |
| Request body | `Content-Type: application/json`, `Accept: application/json, text/event-stream`, at most 1 MB (`413` above) |
| Protected-resource metadata | `GET <APP_URL>/.well-known/oauth-protected-resource` (RFC 9728) |
| Origin | When an `Origin` header is present it must equal the origin of `APP_URL`, else `403` (DNS-rebinding protection per the MCP spec). Server-to-server calls without `Origin` are allowed. |
| Encryption in transit | Production must be served over HTTPS only (`APP_URL=https://...`); guideline §4.4. |

`APP_URL` is required in production (requests fail with `500` and a logged error until it is set); outside production it
falls back to `AUTH_URL` and then `http://localhost:3000`.

## Authentication

Every request needs `Authorization: Bearer <token>`. The token decides the user: **no tool takes a user id**, and every
input schema is strict, so an extra `userId` argument is rejected.

- **Issuing.** The user opens **Settings → Connect Muse**, names the connection and picks **Read only** or
  **Read and write**, then copies the token (shown once) and the server URL into Muse. Reviewers can also use the CLI below.
- **Format.** `inr_` + 32 random bytes in base64url (47 characters). Only its SHA-256 hash is stored
  (`ConnectorToken.tokenHash`); lookup is by hash, so the plaintext is never compared or logged.
- **Revocation.** Settings lists each token with its scope, creation time and "last used" (updated at most once a
  minute). Revoke asks for confirmation and takes effect on the next request (guideline §4.4, "stop access when
  authorization is revoked"). Create and revoke are audited (`connector.token_created`, `connector.token_revoked`)
  without the token.
- **Failures.** Missing, malformed, unknown or revoked token → `401` with
  `WWW-Authenticate: Bearer resource_metadata="<APP_URL>/.well-known/oauth-protected-resource"` (plus
  `error="invalid_token"` when a token was sent).
- **Limit.** 10 active tokens per user.

### Scopes

| Token scope | Advertised scope | Tools listed |
| --- | --- | --- |
| `read` (Read only, guideline §3.1) | `inroad.read` | `find_roles`, `find_warm_path`, `get_campaign` |
| `write` (Read and write) | `inroad.write` | all 10 |

Write tools are not registered for a read token: they do not appear in `tools/list`, and calling one returns an error
result (`Tool <name> not found`).

### Test vs production credentials

Tokens are per user and per deployment; there are no shared API keys. A token issued on a test deployment (for example
the reviewer database below) only works there. Production tokens are issued by real users from their own Settings page.
Mark tokens given to Meta reviewers as **test** in the submission form.

## Tools

Every tool returns `structuredContent` that matches its `outputSchema`, plus a one-sentence text summary. Every call
writes an audit entry with actor `muse`, action `muse.<tool>`, the non-sensitive arguments, `ok` and the summary (this
feeds the Muse activity panel in the web app). Services called by the tools write their own entries too (for example
`application.prepared` with the rule-check result, ground rule 6).

MCP annotations: `openWorldHint: false` on every tool; Read tools set `readOnlyHint: true, idempotentHint: true`.
Muse's submission form does not take annotations yet (§5.6), so each description starts with `Muse class: ...` and states
its side effects.

| Tool | Muse class | Input | Output | Side effects | Annotations |
| --- | --- | --- | --- | --- | --- |
| `find_roles` | Read | `{ type?: "intern"\|"newgrad", company?: string, newOnly?: boolean }` | `{ roles: [{ jobId, title, company, location, type, url, postedAt, firstSeenAt, matchScore, status, reason, applicationId, warmPath, warmPathContacts }], count }` (≤ 50, best match first) | none | read-only, idempotent |
| `find_warm_path` | Read | `{ company: string }` | `{ company, contacts: [{ contactId, name, role, relationship, source }] }` warmest first | none | read-only, idempotent |
| `get_campaign` | Read | `{}` | `{ status: "active"\|"paused"\|"none", inForce, pending, defaultResume: { resumeId, filename } \| null }`; each version is `{ versionId, createdAt, approvedAt, approvedVia, rules, summary: string[] }` | none | read-only, idempotent |
| `draft_outreach` | Write | `{ contactId, jobId?, kind: "coffee_chat"\|"referral_ask" }` | `{ outreachId, kind, status: "draft", draft, packet, note }` | saves an Outreach draft. **Inroad never sends messages; the user sends them.** | idempotent: no |
| `propose_campaign` | Write | `{ rules: { roles, autoCompanies, askFirstCompanies, resumeId, weeklyCap 1-20, minMatch 50-100, endsOn "YYYY-MM-DD" } }` | `{ versionId, approved: false, summary: string[], inForceVersionId, message }` | saves a pending, unapproved version (replaces an earlier pending one). Nothing changes until approved. | idempotent |
| `approve_campaign` | **Sensitive write** | `{ versionId }` | `{ versionId, approvedAt, approvedVia: "muse", campaignStatus, summary }` | approves the version (`approvedVia: 'muse'`); it becomes the rules in force, and a first approval activates the campaign | destructive |
| `prepare_application` | Write | `{ jobId }` | `{ applicationId, jobId, status, decidedBy, ok, reason, topChoice, packet \| null }` | creates the Application (`prepared` if the rule check passes, otherwise `waiting` with the reason) and its audit entry; a top-choice company also gets a referral-ask draft | idempotent |
| `submit_application` | **Sensitive write** | `{ applicationId }` | `{ applicationId, applyUrl, packet, nextStep }` | none besides the audit entry (`application.packet_requested`). Inroad submits nothing. | destructive, idempotent |
| `record_submission` | Write | `{ applicationId, confirmationText?: string ≤ 2000 }` | `{ applicationId, status: "submitted", submittedAt }` | marks it `submitted` and writes `application.submitted` | idempotent |
| `run_weekly_pass` | Write | `{}` | `{ submitted: string[], waiting: string[], referralDrafts: string[], failed: string[], reason: string \| null }` ("Company · Title") | runs `prepare_application` for every new match the approved campaign covers | idempotent: no |

### Permissions and approval flow

- `approve_campaign`: Muse must first show the user the summary returned by `propose_campaign` (or `get_campaign`'s
  `pending.summary`) for that exact `versionId` and get an explicit yes. If the rules change, propose again and ask again
  (guideline §3.4: "Allow once" covers only what was shown). This is stated in the tool description.
- `submit_application` returns the packet and the apply URL **only** when the application may go out right now:
  the user approved it in Inroad (`decidedBy: user`), or it is `prepared` by the campaign **and** the rule check passes at
  call time (campaign active and not ended, company on the auto list, role type, minimum match, weekly cap not counting
  this application). Otherwise it returns an error result with the reason and releases nothing. Muse's own browser agent
  fills the employer's form under Muse's own controls; afterwards Muse calls `record_submission`.
- Nothing in any description asks Muse to skip, batch or pre-approve its own permission prompts. Inroad's campaign consent
  sits on top of Muse's prompts; it does not replace them.

### Status handling

- `find_roles.status`: from the user's existing application when there is one (`prepared`, `waiting`, `submitted`,
  `skipped`, with its stored reason); otherwise from the rule check: `will_auto_apply`, `referral_first` (top-choice
  company) or `held` (the reason says why, e.g. `Match below 75%`, `Weekly limit reached`, `No approved campaign yet`).
- Application lifecycle: `prepared` (cleared to submit) → `submitted`; `waiting` → the user approves (`prepared`) or skips
  (`skipped`) in the web app. `run_weekly_pass.submitted` lists applications cleared to submit (`prepared`), not sent.
- Campaign: a proposal is pending until approved; the newest approved version stays in force meanwhile.

### Errors

| Situation | What Muse gets |
| --- | --- |
| Bad arguments (unknown key such as `userId`, wrong type, out of range) | tool result `isError: true`, text `Input validation error: ...` |
| Business refusal (rule check fails, not found, wrong state, already approved, invalid rules) | tool result `isError: true` with a user-safe sentence, e.g. `Inroad won't release this application: Weekly limit reached`, `We couldn't find that application.` |
| Someone else's id | the same "couldn't find" message as a missing id (no data about other users) |
| Unexpected failure | `isError: true`, `Something went wrong in Inroad. Try again in a moment.` (details logged server side only) |
| Write tool with a read token | `isError: true`, `Tool <name> not found` |
| HTTP level | `401` (token), `403` (Origin), `405` (GET/DELETE), `413` (> 1 MB), `429` (rate limit), `500`; JSON-RPC error bodies |

### Rate limits

60 requests per minute per token (token bucket, burst 60). Over the limit: `429` with `Retry-After` in seconds.
The bucket is in memory, so it holds per server instance. TODO(scale): use a shared store for multi-instance deploys.

## Reviewer test account

```bash
npm install && cp .env.example .env            # set AUTH_SECRET; APP_URL=https://<test host> on a deployment
npm run db:push && npm run db:seed              # demo@inroad.test with sample jobs and 4 contacts
npm run dev                                     # or build + start on the test host
```

1. Sign in at `/signin` as `demo@inroad.test` (with `EMAIL_SERVER` unset the magic link is in `.dev-mail/last-link.txt`).
2. Settings → upload a resume (e.g. `src/lib/resume/__fixtures__/resume.pdf`) so jobs get match scores.
3. Create a token: Settings → **Connect Muse** → name it, choose **Read and write**, copy it. Or from the shell:
   ```bash
   npm run mcp:token -- demo@inroad.test --scope write --name "Muse review"
   ```
   (prints the token once on stdout; `--scope read` for the read-only check).
4. Add the connector in Muse with `<APP_URL>/mcp` and the token. Suggested script: `find_roles` → `get_campaign`
   (its `defaultResume.resumeId` goes into the rules) → `propose_campaign` → show the summary → approve →
   `run_weekly_pass` → `submit_application` on a cleared one (and on a waiting one, to see the refusal) →
   `record_submission`. Every step shows up in the app's Activity page and the Muse panel.

Integration tests that drive every tool through the SDK client over HTTP: `src/mcp/integration/*.test.ts`.

## Not yet confirmed with Meta

These are not covered by Meta's public Muse docs (read 2026-11-07); each has a `TODO(muse-docs)` in code or here.

- TODO(muse-docs): transport (streamable HTTP vs SSE) and whether Muse expects a specific endpoint path.
- TODO(muse-docs): Muse's OAuth flow: authorization server, OAuth 2.1 / PKCE, dynamic client registration, redirect URIs
  and scope names. Until confirmed, `authorization_servers` is empty and tokens are issued from Settings.
- TODO(muse-docs): whether Muse reads MCP annotations (`readOnlyHint`, `destructiveHint`) or only the submission form's
  classification.
- TODO(muse-docs): required error format and rate-limit expectations (we return JSON-RPC errors and 60/min/token).
- TODO(muse-docs): whether Muse fetches the resume file in the packet. `packet.resume.downloadPath` points at
  `/api/resumes/<id>`, which needs the web session, not the connector token.
- TODO(muse-docs): the submission form itself (behind login) was not read: data-processing questionnaire answers,
  support and security contacts, privacy and product terms links. Security incidents go to vendor-incident@meta.com
  within 48 hours (§4.8).
