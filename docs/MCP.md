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
| `GET /mcp`, `DELETE /mcp` | `405` with `Allow: POST` (no standalone SSE stream, no session to end). The Origin, token and rate-limit checks run first, so without a valid token the answer is `401` (or `429` once the shared failed-token limit is reached, see Rate limits), and an authenticated GET or DELETE uses up one request of the token's rate limit. |
| Request body | `Content-Type: application/json`, `Accept: application/json, text/event-stream`, at most 1 MB (`413` above) |
| Protected-resource metadata | `GET <APP_URL>/.well-known/oauth-protected-resource` (RFC 9728) |
| Origin | When an `Origin` header is present it must equal the origin of `APP_URL`, else `403` (DNS-rebinding protection per the MCP spec). Server-to-server calls without `Origin` are allowed. |
| Encryption in transit | Production must be served over HTTPS only (`APP_URL=https://...`); guideline §4.4. |

The app's origin comes from `APP_URL`, or from `AUTH_URL` when `APP_URL` is unset or not a valid http(s) URL. In
production one of them must be set (requests fail with `500` and a logged error until it is); outside production the
fallback after both is `http://localhost:3000`.

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
  `error="invalid_token"` when a token was sent). A missing or malformed `Authorization` header always gets this `401`.
  Too many well-formed tokens that fail verification in a minute turn their `401` into a `429` (see Rate limits).
- **Limit.** 10 active tokens per user.

### Scopes

| Token scope | Advertised scope | Tools listed |
| --- | --- | --- |
| `read` (Read only, guideline §3.1) | `inroad.read` | `find_roles`, `find_warm_path`, `get_campaign` |
| `write` (Read and write) | `inroad.write` | all 10 |

Write tools are not registered for a read token: they do not appear in `tools/list`, and calling one returns an error
result (`MCP error -32602: Tool <name> not found`). The attempt is audited as `muse.<tool>` with `ok: false`.

### Test vs production credentials

Tokens are per user and per deployment; there are no shared API keys. A token issued on a test deployment (for example
the reviewer database below) only works there. Production tokens are issued by real users from their own Settings page.
Mark tokens given to Meta reviewers as **test** in the submission form.

## Tools

Every tool returns `structuredContent` that matches its `outputSchema`, plus a one-sentence text summary. Every call
writes an audit entry with actor `muse`, action `muse.<tool>`, the non-sensitive arguments, `ok` and the summary (this
feeds the Muse activity panel in the web app). Calls the MCP SDK refuses before the tool runs (a write tool called with a
read token or any other unknown or disabled tool name, or arguments that fail the input schema) are audited too, as
`muse.<tool>` with `ok: false`, empty `args` and the error text as the summary; a name that is not an Inroad tool is
filed as `muse.unknown_tool` with the name (any characters, spaces and newlines included, cut to 64) in `args.tool`.
The audit wraps the SDK's `tools/call` handler, found by its method name; if it is ever not attached, the server logs
an error on every request. Services called by the tools write their own entries too (for example
`application.prepared` with the rule-check result, ground rule 6).

MCP annotations: `openWorldHint: false` on every tool; Read tools set `readOnlyHint: true, idempotentHint: true`.
Muse's submission form does not take annotations yet (§5.6), so each description starts with `Muse class: ...` and states
its side effects.

| Tool | Muse class | Input | Output | Side effects | Annotations |
| --- | --- | --- | --- | --- | --- |
| `find_roles` | Read | `{ type?: "intern"\|"newgrad", company?: string, newOnly?: boolean }` | `{ roles: [{ jobId, title, company, location, type, url, postedAt, firstSeenAt, matchScore, status, reason, applicationId, warmPath, warmPathContacts }], count }` (≤ 50, best match first) | none | read-only, idempotent |
| `find_warm_path` | Read | `{ company: string }` | `{ company, contacts: [{ contactId, name, role, relationship, source }] }` warmest first. `company` is the matched company's name, or `null` when the user has no saved contacts there (the summary then repeats the name as typed). | none | read-only, idempotent |
| `get_campaign` | Read | `{}` | `{ status: "active"\|"paused"\|"ended"\|"revoked"\|"none", inForce, pending, defaultResume: { resumeId, filename } \| null }`; each version is `{ versionId, createdAt, approvedAt, approvedVia, rules, summary: string[] }` | none | read-only, idempotent |
| `draft_outreach` | Write | `{ contactId, jobId?, kind: "coffee_chat"\|"referral_ask" }` | `{ outreachId, kind, status: "draft", draft, packet, note }` | saves an Outreach draft. **Inroad never sends messages; the user sends them.** | idempotent: no |
| `propose_campaign` | Write | `{ rules: { roles, autoCompanies, askFirstCompanies, resumeId, weeklyCap 1-20, minMatch 50-100, endsOn "YYYY-MM-DD" } }` | `{ versionId, outcome: "created"\|"unchanged_pending"\|"unchanged_in_force"\|"withdrawn_pending", approved, changed, summary: string[], inForceVersionId, replacedVersionId, message }` | saves a NEW pending, unapproved version (`outcome: "created"`); the earlier pending version (`replacedVersionId`) is superseded and can no longer be approved. Rules identical to the pending version return it unchanged (`unchanged_pending`, `changed: false`); identical to the rules in force with nothing pending change nothing (`unchanged_in_force`, `changed: false, approved: true`, the in-force `versionId`). Rules identical to the rules in force while another version is pending withdraw that pending version (`withdrawn_pending`, `replacedVersionId` is the withdrawn version, `versionId` is the version in force); the withdrawn version can no longer be approved and there is nothing new to approve. `summary` is of the stored rules of `versionId`. Nothing changes until approved. | idempotent |
| `approve_campaign` | **Sensitive write** | `{ versionId }` | `{ versionId, approvedAt, approvedVia: "muse", campaignStatus, summary }` | approves the version (`approvedVia: 'muse'`); it becomes the rules in force, and a first approval activates the campaign. Only the current pending version can be approved: a superseded `versionId` is an error ("These rules changed after you reviewed them. Review the latest summary and approve again." plus the next step: call `get_campaign`/`propose_campaign`, show the new summary, ask again) and approves nothing | destructive |
| `prepare_application` | Write | `{ jobId }` | `{ applicationId, jobId, status, decidedBy, ok, reason, topChoice, nextStep \| null }` | creates the Application (`prepared` if the rule check passes, otherwise `waiting` with the reason) and its audit entry. It **never returns the packet or apply URL**: when the application is cleared, `nextStep` says to call `submit_application`; a top-choice company also gets a referral-ask draft. Again for a waiting row: re-checked (a pass prepares it with the campaign's resume; a different failing reason updates the reason, audits and, for a top choice, drafts the referral ask; a Skip/Approve the user made meanwhile is kept). A closed posting is an error ("This posting has closed."). | idempotent |
| `submit_application` | **Sensitive write** | `{ applicationId }` | `{ applicationId, applyUrl, packet, nextStep }` | writes the audit entry (`application.packet_requested`) and, when it returns the packet, stamps `Application.packetReleasedAt` (the packet is released, so `record_submission` can record it later even after a pause or rules edit). Inroad submits nothing. | destructive, idempotent |
| `record_submission` | Write | `{ applicationId, confirmationText?: string ≤ 2000 }` | `{ applicationId, status: "submitted", submittedAt }` | marks it `submitted` and writes `application.submitted`, only if `submit_application` released its packet (stays recordable after a later pause or rules edit) or it may go out right now; otherwise an error with the reason, nothing recorded, and `application.record_refused` audited | idempotent |
| `run_weekly_pass` | Write | `{}` | `{ submitted: string[], waiting: string[], referralDrafts: string[], failed: string[], reason: string \| null }` ("Company · Title") | runs `prepare_application` for every new match the approved campaign covers. `failed` lists matches that hit an error and were not processed (the summary says how many). `reason` is set when the campaign can't run (no approved rules, paused or ended) or when the pass stops because no resume is uploaded; if some matches were already handled the summary says the pass stopped early. | idempotent: no |

### Permissions and approval flow

- `approve_campaign`: Muse must first show the user the summary returned by `propose_campaign` (or `get_campaign`'s
  `pending.summary`) for that exact `versionId` and get an explicit yes. A version's rules never change, and only the
  current pending version can be approved: if the rules changed after the summary was shown (the user saved on the web,
  or another proposal), `approve_campaign` refuses with `stale_version` and approves nothing. If the rules change, propose again and ask again
  (guideline §3.4: "Allow once" covers only what was shown). This is stated in the tool description.
- `prepare_application` is a Write tool, which Muse may let the user allow once, so it never returns the packet or the
  apply URL, even for a cleared application. Only `submit_application`, the Sensitive write Muse confirms on every call,
  releases them (ground rule 2: Inroad does not route around Muse's per-use prompt). This differs from the original
  brief, which had `prepare_application` return "rule-check result + packet".
- `submit_application` returns the packet and the apply URL **only** when the application may go out right now:
  the user approved it in Inroad (`decidedBy: user`), or it is `prepared` by the campaign **and** the rule check passes at
  call time (campaign active and not ended, company on the auto list, role type, minimum match, weekly cap not counting
  this application), and the posting has not closed (a closed posting is refused even when the user approved it).
  Otherwise it returns an error result with the reason and releases nothing. Muse's own browser agent
  fills the employer's form under Muse's own controls; afterwards Muse calls `record_submission`.
- `record_submission` runs the same gate as the web "Mark as submitted" (inside `recordSubmission`): a held application
  whose packet was never released cannot be recorded.
- Nothing in any description asks Muse to skip, batch or pre-approve its own permission prompts. Inroad's campaign consent
  sits on top of Muse's prompts; it does not replace them.

### Status handling

- `find_roles.status`: from the user's existing application when there is one (`prepared`, `waiting`, `submitted`,
  `skipped`, with its stored reason); otherwise from the rule check: `will_auto_apply`, `referral_first` (top-choice
  company) or `held` (the reason says why, e.g. `Match below 75%`, `Weekly limit reached`, `No approved campaign yet`).
  A prepared application that may not go out right now (for example the campaign was paused after it was prepared)
  also shows as `held`, with its `applicationId` and a `Held: ...` reason.
- `prepare_application` on an application the user skipped returns it unchanged (`status: "skipped"`, `ok: false`,
  `nextStep: null`) with the summary "The user skipped this application; nothing will be prepared."
- Application lifecycle: `prepared` (cleared to submit) → `submitted`; `waiting` → the user approves (`prepared`) or skips
  (`skipped`) in the web app. `run_weekly_pass.submitted` lists applications cleared to submit (`prepared`), not sent.
- Campaign: a proposal is pending until approved; the newest approved version stays in force meanwhile.
  `get_campaign.status` is `active`, `paused`, `ended`, `revoked` or `none` (no campaign yet). It is `ended` once the
  end date of the rules in force has passed, even if the campaign was never paused; nothing more is prepared until the
  user approves rules with a new end date.

### Errors

| Situation | What Muse gets |
| --- | --- |
| Bad arguments (unknown key such as `userId`, wrong type, out of range) | tool result `isError: true`, text `MCP error -32602: Input validation error: ...` (audited, see Tools) |
| Business refusal (rule check fails, not found, wrong state, already approved, invalid rules) | tool result `isError: true` with a user-safe sentence, e.g. `Inroad won't release this application: Weekly limit reached`, `We couldn't find that application.` |
| Someone else's id | the same "couldn't find" message as a missing id (no data about other users) |
| Unexpected failure | `isError: true`, `Something went wrong in Inroad. Try again in a moment.` (details logged server side only) |
| Write tool with a read token | `isError: true`, `MCP error -32602: Tool <name> not found` (audited, see Tools) |
| HTTP level | `400` (invalid JSON or JSON-RPC, unsupported `MCP-Protocol-Version`), `401` (token), `403` (Origin), `405` (GET/DELETE), `406` (`Accept` missing `application/json` or `text/event-stream`), `413` (> 1 MB), `415` (`Content-Type` not `application/json`), `429` (rate limit), `500`; JSON-RPC error bodies |

### Rate limits

60 requests per minute per token (token bucket, burst 60). Over the limit: `429` with `Retry-After` in seconds.

Requests that carry a well-formed bearer token (`Bearer inr_` plus 43 characters) that fails verification (unknown or
revoked) share one global bucket of 300 per minute (burst 300). Over it they get `429` with `Retry-After` instead of
`401`. Requests with no `Authorization` header or a malformed one are never counted and always get the `401`
challenge, so a client starting authorization is never told to back off; requests with a valid token are never counted
either. Each counted request still costs one token lookup, so this tells clients to back off rather than blocking
traffic; volumetric protection belongs at the edge.

The buckets are in memory, so they hold per server instance. TODO(scale): use a shared store for multi-instance deploys.

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
