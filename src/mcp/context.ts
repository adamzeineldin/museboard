import type { ConnectorScope } from "@/lib/types";

/**
 * Who a tool runs for. The user comes ONLY from the connector token (src/lib/connector verifyBearer);
 * no tool accepts a user id as an argument.
 */
export interface ToolContext {
  userId: string;
  scope: ConnectorScope;
  /** Clock for rule checks; defaults to the real time. */
  now: () => Date;
}

export interface InroadServerOptions {
  userId: string;
  scope: ConnectorScope;
  now?: () => Date;
}

export function toolContext(options: InroadServerOptions): ToolContext {
  return { userId: options.userId, scope: options.scope, now: options.now ?? (() => new Date()) };
}
