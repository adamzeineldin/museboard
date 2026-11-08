import { z } from "zod";
import { CONNECTOR_SCOPES } from "@/lib/types";

// Arguments for the create-token CLI: <email> [--scope read|write] [--name "..."].

const argsSchema = z.object({
  email: z.email("Pass the account's email address as the first argument."),
  scope: z.enum(CONNECTOR_SCOPES, { error: "--scope must be read or write." }),
  name: z.string().trim().min(1).max(60),
});

export type CreateTokenArgs = z.infer<typeof argsSchema>;

export const CREATE_TOKEN_USAGE =
  'Usage: npx tsx --conditions=react-server src/mcp/cli/create-token.ts <email> [--scope read|write] [--name "Muse review"]';

export function parseCreateTokenArgs(argv: readonly string[]): CreateTokenArgs {
  const values: Record<string, string> = { scope: "write", name: "Muse review" };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--scope" || arg === "--name") {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value.\n${CREATE_TOKEN_USAGE}`);
      values[arg.slice(2)] = value;
      i += 1;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option ${arg}.\n${CREATE_TOKEN_USAGE}`);
    } else {
      positional.push(arg);
    }
  }
  const parsed = argsSchema.safeParse({ ...values, email: positional[0] ?? "" });
  if (!parsed.success || positional.length > 1) {
    throw new Error(`${parsed.error?.issues[0]?.message ?? "Too many arguments."}\n${CREATE_TOKEN_USAGE}`);
  }
  return parsed.data;
}
