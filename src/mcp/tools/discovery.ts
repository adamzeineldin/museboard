import "server-only";
import { z } from "zod";
import { contactsByCompany } from "@/lib/outreach";
import { findCompanies } from "../data/companies";
import { FIND_ROLES_LIMIT, NEW_ROLE_DAYS } from "../data/role-rows";
import { findRoles } from "../data/roles";
import { companyNameSchema, isoString, jobTypeInput, ROLE_STATUSES } from "../schemas";
import { defineTool } from "../tool-kit";

// Read tools: find_roles and find_warm_path. No side effects besides the muse.<tool> audit entry.

const RoleSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  type: z.string(),
  url: z.string(),
  postedAt: isoString.nullable(),
  firstSeenAt: isoString,
  matchScore: z.number().int().nullable(),
  status: z.enum(ROLE_STATUSES),
  reason: z.string(),
  applicationId: z.string().nullable(),
  warmPath: z.boolean(),
  warmPathContacts: z.number().int(),
});

export const findRolesTool = defineTool({
  name: "find_roles",
  title: "Find roles",
  museClass: "read",
  description: [
    "Muse class: Read. No side effects (Inroad only records that the tool was called).",
    `Lists open internship and new-grad jobs from Inroad's job feed for the signed-in user, best match first, up to ${FIND_ROLES_LIMIT}.`,
    "Each role has its match score (0-100, null if not scored yet), a status, the reason for that status, and whether the user has a contact at the company (warm path).",
    "Status comes from the user's existing application when there is one (prepared, waiting, submitted, skipped);",
    "otherwise from the user's approved campaign rules: will_auto_apply, referral_first (a top-choice company: ask for a referral first) or held (the reason says why).",
    `Optional filters: type ("intern" or "newgrad"), company (name, case-insensitive), newOnly (first seen in the last ${NEW_ROLE_DAYS} days).`,
  ].join(" "),
  input: z.strictObject({
    type: jobTypeInput.optional().describe('"intern" or "newgrad"'),
    company: companyNameSchema.optional().describe("Company name, case-insensitive"),
    newOnly: z.boolean().optional().describe(`Only roles first seen in the last ${NEW_ROLE_DAYS} days`),
  }),
  output: z.object({ roles: z.array(RoleSchema), count: z.number().int() }),
  auditArgs: (input) => ({ type: input.type ?? null, company: input.company ?? null, newOnly: input.newOnly ?? false }),
  async run(ctx, input) {
    const roles = await findRoles(ctx.userId, input, ctx.now());
    const autoCount = roles.filter((role) => role.status === "will_auto_apply").length;
    const summary =
      roles.length === 0
        ? "No open roles match those filters."
        : `Found ${roles.length} open role${roles.length === 1 ? "" : "s"}; ${autoCount} fit the approved campaign rules.`;
    return { data: { roles, count: roles.length }, summary };
  },
});

const ContactSchema = z.object({
  contactId: z.string(),
  name: z.string(),
  role: z.string(),
  relationship: z.string(),
  source: z.string(),
});

export const findWarmPathTool = defineTool({
  name: "find_warm_path",
  title: "Find a warm path",
  museClass: "read",
  description: [
    "Muse class: Read. No side effects (Inroad only records that the tool was called).",
    "Lists the contacts the user saved in Inroad (entered by hand or imported from their own CSV) at one company, warmest relationship first.",
    "Use a contactId with draft_outreach to draft a coffee-chat or referral message. Inroad does not look anyone up online.",
  ].join(" "),
  input: z.strictObject({ company: companyNameSchema.describe("Company name, case-insensitive") }),
  output: z.object({ company: z.string().nullable(), contacts: z.array(ContactSchema) }),
  auditArgs: (input) => ({ company: input.company }),
  async run(ctx, input) {
    const companies = await findCompanies(input.company);
    const grouped = await contactsByCompany(ctx.userId);
    const match = companies.find((company) => (grouped.get(company.id) ?? []).length > 0) ?? companies[0] ?? null;
    const contacts = (match ? (grouped.get(match.id) ?? []) : []).map((c) => ({
      contactId: c.id,
      name: c.name,
      role: c.role,
      relationship: c.relationship,
      source: c.source,
    }));
    const where = match?.name ?? input.company;
    const summary =
      contacts.length === 0
        ? `No saved contacts at ${where}.`
        : `${contacts.length} contact${contacts.length === 1 ? "" : "s"} at ${where}; warmest first: ${contacts[0].name}.`;
    return { data: { company: match?.name ?? null, contacts }, summary };
  },
});
