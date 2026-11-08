import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Test-only: serve the real Web-standard route handlers (src/app/mcp/route.ts) from a tiny node:http server
// so an MCP SDK client can talk to them over real HTTP.

export type RouteHandler = (request: Request) => Promise<Response>;
export type RouteHandlers = Partial<Record<"GET" | "POST" | "DELETE", RouteHandler>>;

export interface TestHttpServer {
  url: URL;
  close: () => Promise<void>;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function toHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  return headers;
}

async function toWebRequest(req: IncomingMessage, base: URL): Promise<Request> {
  const method = req.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : new Uint8Array(await readBody(req));
  return new Request(new URL(req.url ?? "/", base), { method, headers: toHeaders(req), body });
}

async function sendWebResponse(response: Response, res: ServerResponse): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

export async function startRouteServer(path: string, handlers: RouteHandlers): Promise<TestHttpServer> {
  let base = new URL("http://127.0.0.1");
  const server: Server = createServer((req, res) => {
    void (async () => {
      const pathname = new URL(req.url ?? "/", base).pathname;
      const handler = handlers[(req.method ?? "") as keyof RouteHandlers];
      if (pathname !== path || !handler) {
        res.writeHead(pathname === path ? 405 : 404).end();
        return;
      }
      try {
        await sendWebResponse(await handler(await toWebRequest(req, base)), res);
      } catch (error) {
        res.writeHead(500).end(error instanceof Error ? error.message : String(error));
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  base = new URL(`http://127.0.0.1:${port}`);
  return {
    url: new URL(path, base),
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

/** An MCP client connected to `url` with the given bearer token. Caller closes it. */
export async function connectClient(url: URL, token: string): Promise<Client> {
  const client = new Client({ name: "inroad-test", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

export const JSON_RPC_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
} as const;
