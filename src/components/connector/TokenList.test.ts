import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TokenList } from "./TokenList";
import { IDLE_CONNECTOR_STATE, type TokenRow } from "./view-model";

const token: TokenRow = {
  id: "t1",
  name: "Muse on my phone",
  scopeLabel: "Read and write",
  createdLabel: "Created 2 hours ago",
  lastUsedLabel: "Never used",
  revoked: false,
  revokedLabel: null,
};

const render = (): string =>
  renderToStaticMarkup(createElement(TokenList, { tokens: [token], revokeAction: async () => IDLE_CONNECTOR_STATE }));

describe("TokenList", () => {
  it("fills the row's 44px first column with a decorative logo so the details get the wide column", () => {
    const html = render();
    const row = html.match(/<li class="row">([\s\S]*?)<\/li>/)?.[1] ?? "";
    expect(row.startsWith('<div class="logo" aria-hidden="true">')).toBe(true);
  });

  it("moves focus after a revoke to the labelled list, not to the live region, so the result is announced once", () => {
    const html = render();
    expect(html).toContain('<ul class="list" aria-label="Muse connections" tabindex="-1">');
    expect(html).toMatch(/<div aria-live="polite"><\/div>/);
  });
});
