import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMilocoHttpServer } from "../server-impl";

type JsonResponse<T = unknown> = {
  code: number;
  message: string;
  data: T | null;
};

class CookieJar {
  private cookieHeader: string | null = null;

  capture(setCookie: string | null): void {
    if (!setCookie) return;
    // take first Set-Cookie only; good enough for our auth flow
    const cookie = setCookie.split(";")[0];
    if (cookie) this.cookieHeader = cookie;
  }

  header(): string | undefined {
    return this.cookieHeader || undefined;
  }
}

async function jsonFetch<T>(params: {
  baseUrl: string;
  path: string;
  method?: string;
  jar?: CookieJar;
  body?: unknown;
}): Promise<{ status: number; json: JsonResponse<T>; headers: Headers }> {
  const res = await fetch(`${params.baseUrl}${params.path}`, {
    method: params.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(params.jar?.header() ? { cookie: params.jar.header()! } : {}),
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });
  const json = (await res.json()) as JsonResponse<T>;
  return { status: res.status, json, headers: res.headers };
}

describe("Miloco MCP HTTP contract", () => {
  let server: Awaited<ReturnType<typeof startMilocoHttpServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.MILOCO_HTTP_TEST_ENABLED = "true";
    process.env.MILOCO_HTTP_ENABLED = "true";
    process.env.MILOCO_HTTP_PORT = "0";
    process.env.MILOCO_DATA_PATH = "/tmp/mihome-mcp-test-http";

    server = await startMilocoHttpServer();
    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.server.close(() => resolve()));
  });

  it("/api/mcp/tools returns data as { tools, count }", async () => {
    const jar = new CookieJar();

    // Ensure admin exists
    await jsonFetch({
      baseUrl,
      path: "/api/auth/register",
      method: "POST",
      body: { password: "pw" },
    }).catch(() => null);

    const loginResp = await jsonFetch<{ username: string }>({
      baseUrl,
      path: "/api/auth/login",
      method: "POST",
      body: { username: "admin", password: "pw" },
    });
    jar.capture(loginResp.headers.get("set-cookie"));

    const resp = await jsonFetch<{ tools: unknown[]; count: number }>({
      baseUrl,
      path: "/api/mcp/tools",
      jar,
    });

    expect(resp.status).toBe(200);
    expect(resp.json.code).toBe(0);
    expect(resp.json.data).toBeTruthy();
    expect(Array.isArray(resp.json.data!.tools)).toBe(true);
    expect(typeof resp.json.data!.count).toBe("number");
    expect(resp.json.data!.count).toBe(resp.json.data!.tools.length);
  });

  it("/api/mcp/call_tool returns HTTP 400 with NormalResponse.data=null on failure", async () => {
    const jar = new CookieJar();

    // Ensure admin exists
    await jsonFetch({
      baseUrl,
      path: "/api/auth/register",
      method: "POST",
      body: { password: "pw" },
    }).catch(() => null);

    const loginResp = await jsonFetch<{ username: string }>({
      baseUrl,
      path: "/api/auth/login",
      method: "POST",
      body: { username: "admin", password: "pw" },
    });
    jar.capture(loginResp.headers.get("set-cookie"));

    const resp = await jsonFetch({
      baseUrl,
      path: "/api/mcp/call_tool",
      method: "POST",
      jar,
      body: {
        client_id: "no_such_client",
        tool_name: "no_such_tool",
        arguments: {},
      },
    });

    expect(resp.status).toBe(400);
    expect(resp.json.message).toBe("Tool not found");
    expect(resp.json.data).toBeNull();
  });
});
