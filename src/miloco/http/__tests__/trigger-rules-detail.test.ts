import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMilocoHttpServer } from "../server-impl";
import WebSocket from "ws";

type JsonResponse<T = unknown> = {
  code: number;
  message: string;
  data: T | null;
};

class CookieJar {
  private cookieHeader: string | null = null;

  capture(setCookie: string | null): void {
    if (!setCookie) return;
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

describe("Trigger rules detail shape", () => {
  let server: Awaited<ReturnType<typeof startMilocoHttpServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.MILOCO_HTTP_TEST_ENABLED = "true";
    process.env.MILOCO_HTTP_ENABLED = "true";
    process.env.MILOCO_HTTP_PORT = "0";
    process.env.MILOCO_DATA_PATH = `/tmp/mihome-mcp-test-trigger-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    server = await startMilocoHttpServer();
    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.server.close(() => resolve()));
  });

  async function loginAdmin(): Promise<CookieJar> {
    const jar = new CookieJar();
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
    expect(loginResp.status).toBe(200);
    jar.capture(loginResp.headers.get("set-cookie"));
    expect(jar.header()).toBeTruthy();
    return jar;
  }

  it("GET /api/trigger/rules returns TriggerRuleDetail-like cameras + execute_info.mcp_list statuses", async () => {
    const jar = await loginAdmin();

    const createRule = await jsonFetch<{ rule_id: string }>({
      baseUrl,
      path: "/api/trigger/rule",
      method: "POST",
      jar,
      body: {
        enabled: true,
        name: "r1",
        cameras: ["did1"],
        condition: "c",
        execute_info: {
          mcp_list: ["local_default", "unknown_mcp"],
        },
      },
    });

    expect(createRule.status).toBe(200);
    expect(createRule.json.code).toBe(0);

    const resp = await jsonFetch<any[]>({
      baseUrl,
      path: "/api/trigger/rules",
      jar,
    });

    expect(resp.status).toBe(200);
    expect(resp.json.code).toBe(0);
    expect(Array.isArray(resp.json.data)).toBe(true);
    expect(resp.json.data!.length).toBeGreaterThan(0);

    const r = resp.json.data![0];
    expect(Array.isArray(r.cameras)).toBe(true);
    expect(typeof r.cameras[0].did).toBe("string");
    expect(typeof r.cameras[0].name).toBe("string");

    expect(r.execute_info).toBeTruthy();
    expect(Array.isArray(r.execute_info.mcp_list)).toBe(true);
    expect(typeof r.execute_info.mcp_list[0].client_id).toBe("string");
    expect(typeof r.execute_info.mcp_list[0].server_name).toBe("string");
    expect(typeof r.execute_info.mcp_list[0].connected).toBe("boolean");
  });

  it("POST /api/trigger/rule rejects duplicate rule name with 409", async () => {
    const jar = await loginAdmin();

    const body = {
      enabled: true,
      name: "dup-name",
      cameras: ["did1"],
      condition: "c",
      execute_info: { mcp_list: [] },
    };

    const r1 = await jsonFetch<{ rule_id: string }>({
      baseUrl,
      path: "/api/trigger/rule",
      method: "POST",
      jar,
      body,
    });
    expect(r1.status).toBe(200);

    const r2 = await jsonFetch({
      baseUrl,
      path: "/api/trigger/rule",
      method: "POST",
      jar,
      body,
    });
    expect(r2.status).toBe(409);
    expect(r2.json.data).toBeNull();
  });

  it("POST /api/trigger/rule rejects empty notify.content with 400", async () => {
    const jar = await loginAdmin();

    const r = await jsonFetch({
      baseUrl,
      path: "/api/trigger/rule",
      method: "POST",
      jar,
      body: {
        enabled: true,
        name: "notify-empty",
        cameras: ["did1"],
        condition: "c",
        execute_info: {
          mcp_list: [],
          notify: { content: "" },
        },
      },
    });

    expect(r.status).toBe(400);
    expect(r.json.data).toBeNull();
  });

  it("PUT /api/trigger/rule/:rule_id requires full rule body (no partial update)", async () => {
    const jar = await loginAdmin();

    const createRule = await jsonFetch<{ rule_id: string }>({
      baseUrl,
      path: "/api/trigger/rule",
      method: "POST",
      jar,
      body: {
        enabled: true,
        name: "put-full-body",
        cameras: ["did1"],
        condition: "c",
        execute_info: { mcp_list: [] },
      },
    });

    expect(createRule.status).toBe(200);
    const ruleId = createRule.json.data!.rule_id;

    const partialUpdate = await jsonFetch({
      baseUrl,
      path: `/api/trigger/rule/${ruleId}`,
      method: "PUT",
      jar,
      body: { name: "new" },
    });

    expect(partialUpdate.status).toBe(400);
    expect(partialUpdate.json.data).toBeNull();
  });

  it("DELETE /api/trigger/rule/:rule_id returns 404 when rule does not exist", async () => {
    const jar = await loginAdmin();

    const r = await jsonFetch({
      baseUrl,
      path: `/api/trigger/rule/${crypto.randomUUID()}`,
      method: "DELETE",
      jar,
    });

    expect(r.status).toBe(404);
    expect(r.json.data).toBeNull();
  });

  it("POST /api/trigger/execute_actions requires array body", async () => {
    const jar = await loginAdmin();

    const r = await jsonFetch({
      baseUrl,
      path: "/api/trigger/execute_actions",
      method: "POST",
      jar,
      body: { not: "array" },
    });

    expect(r.status).toBe(400);
    expect(r.json.data).toBeNull();
  });

  it("Chat history endpoints align with python shapes + 404 behavior", async () => {
    const jar = await loginAdmin();

    const list1 = await jsonFetch<any[]>({
      baseUrl,
      path: "/api/chat/historys",
      jar,
    });
    expect(list1.status).toBe(200);
    expect(list1.json.code).toBe(0);
    expect(Array.isArray(list1.json.data)).toBe(true);

    const missing = await jsonFetch({
      baseUrl,
      path: `/api/chat/history/${crypto.randomUUID()}`,
      jar,
    });
    expect(missing.status).toBe(404);
    expect(missing.json.data).toBeNull();

    const missingDel = await jsonFetch({
      baseUrl,
      path: `/api/chat/history/${crypto.randomUUID()}`,
      method: "DELETE",
      jar,
    });
    expect(missingDel.status).toBe(404);
    expect(missingDel.json.data).toBeNull();

    const search = await jsonFetch<any[]>({
      baseUrl,
      path: "/api/chat/history/search?keyword=",
      jar,
    });
    expect(search.status).toBe(200);
    expect(Array.isArray(search.json.data)).toBe(true);
  });

  it("Chat WS /api/chat/ws/query streams ToastStream and finishes, and persists history", async () => {
    const jar = await loginAdmin();

    const sessionId = crypto.randomUUID();
    const requestId = crypto.randomUUID();

    const cookie = jar.header();
    expect(cookie).toBeTruthy();

    const ws = new WebSocket(
      `ws://127.0.0.1:${server.port}/api/chat/ws/query?request_id=${requestId}&session_id=${sessionId}`,
      {
        headers: {
          cookie: cookie!,
        },
      },
    );

    const messages: any[] = [];

    try {
      await new Promise<void>((resolve, reject) => {
        let openTimer: ReturnType<typeof setTimeout> | null = null;

        const timer = setTimeout(() => {
          try {
            ws.terminate();
          } catch {}
          reject(new Error("ws timeout"));
        }, 8000);

        const cleanup = () => {
          clearTimeout(timer);
          if (openTimer) clearTimeout(openTimer);
          try {
            ws.terminate();
          } catch {}
        };

        openTimer = setTimeout(() => {
          cleanup();
          reject(new Error("ws open timeout"));
        }, 1500);

        ws.on("open", () => {
          if (openTimer) clearTimeout(openTimer);
          ws.send(
            JSON.stringify({
              header: {
                type: "event",
                namespace: "Nlp",
                name: "Request",
                timestamp: Date.now(),
                request_id: "ignored",
                session_id: null,
              },
              payload: JSON.stringify({ query: "hello" }),
            }),
          );
        });

        ws.on("unexpected-response", () => {
          cleanup();
          reject(new Error("ws unexpected response"));
        });

        ws.on("message", (data) => {
          const obj = JSON.parse(data.toString("utf-8"));
          messages.push(obj);
          if (
            obj?.header?.namespace === "Dialog" &&
            obj?.header?.name === "Finish"
          ) {
            cleanup();
            resolve();
          }
        });

        ws.on("close", () => {
          const finished = messages.some(
            (m) =>
              m?.header?.namespace === "Dialog" && m?.header?.name === "Finish",
          );
          if (!finished) {
            cleanup();
            reject(new Error("ws closed"));
          }
        });

        ws.on("error", (e) => {
          cleanup();
          reject(e);
        });
      });
    } finally {
      try {
        ws.terminate();
      } catch {}
    }

    expect(messages.some((m) => m?.header?.namespace === "Template")).toBe(
      true,
    );
    expect(
      messages.some(
        (m) =>
          m?.header?.namespace === "Dialog" && m?.header?.name === "Finish",
      ),
    ).toBe(true);

    const hist = await jsonFetch<any>({
      baseUrl,
      path: `/api/chat/history/${sessionId}`,
      jar,
    });
    expect(hist.status).toBe(200);
    expect(hist.json.data?.session_id).toBe(sessionId);
    expect(Array.isArray(hist.json.data?.session?.data)).toBe(true);
  }, 15000);
});
