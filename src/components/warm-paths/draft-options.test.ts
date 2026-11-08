import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DraftOptions } from "./DraftOptions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const render = (jobs: Array<{ id: string; title: string }>) =>
  renderToStaticMarkup(createElement(DraftOptions, { contactId: "c1", kind: "coffee_chat", jobId: null, jobs, companyName: "Stripe" }));

describe("DraftOptions markup", () => {
  it("labels the role select when the company has open jobs", () => {
    const html = render([{ id: "j1", title: "SWE Intern" }]);
    const labelFor = html.match(/<label for="([^"]+)"[^>]*>Role<\/label>/)?.[1];
    expect(labelFor).toBeTruthy();
    expect(html).toContain(`<select id="${labelFor}"`);
  });

  it("does not render a form label when there is no control to label", () => {
    const html = render([]);
    expect(html).not.toContain("<label");
    expect(html).toContain(">Role<");
    expect(html).toContain("No open roles at Stripe right now.");
  });
});
