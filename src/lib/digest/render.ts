import { renderDigestHtml } from "./render-html";
import { renderDigestText } from "./render-text";
import type { DigestData, DigestLinks, DigestMessage } from "./types";
import { buildDigestView } from "./view";

/** Pure: the digest email for one user, in their time zone. */
export function renderDigest(data: DigestData, links: DigestLinks): DigestMessage {
  const view = buildDigestView(data, links);
  return { subject: view.subject, text: renderDigestText(view), html: renderDigestHtml(view) };
}
