import "dotenv/config";
import { createConnectorToken } from "@/lib/connector";
import { db } from "@/lib/db";
import { parseCreateTokenArgs } from "./args";

// Issue a connector token for an existing account (e.g. the seeded reviewer account) from the command line.
// The token is printed once to stdout and never logged anywhere else. See docs/MCP.md "Reviewer test account".

async function main(): Promise<void> {
  const args = parseCreateTokenArgs(process.argv.slice(2));
  const user = await db.user.findUnique({ where: { email: args.email }, select: { id: true } });
  if (!user) throw new Error(`No account for ${args.email}. Run npm run db:seed or sign up first.`);
  const { token, record } = await createConnectorToken(user.id, args.name, args.scope);
  process.stderr.write(`Created "${record.name}" (${record.scope}) for ${args.email}. Store it now; it won't be shown again.\n`);
  process.stdout.write(`${token}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
