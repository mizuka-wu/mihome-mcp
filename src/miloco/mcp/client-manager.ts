import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type McpTransportType = "stdio" | "http_sse" | "streamable_http";

export type McpConfig = {
  id: string;
  name: string;
  enable?: boolean;
  access_type?: McpTransportType;
  description?: string;
  provider?: string;
  provider_website?: string;
  timeout?: number;
  command?: string;
  args?: string[];
  url?: string;
  request_header_token?: string;
  env_vars?: Record<string, string>;
  working_directory?: string;
  env?: Record<string, string>; // legacy
  cwd?: string; // legacy
  headers?: Record<string, string>;
  auth?: {
    type: "bearer";
    token: string;
  };
};

export type McpClientStatus = {
  client_id: string;
  server_name: string;
  connected: boolean;
  error?: string | null;
};

export type CallToolResult = {
  success: boolean;
  error_message: string | null;
  response: Record<string, unknown> | null;
};

type ClientEntry = {
  config: McpConfig;
  client: Client;
  connected: boolean;
  lastError: string | null;
};

const timeoutSeconds = (config: McpConfig): number => {
  const t = Number(config.timeout);
  if (!Number.isFinite(t) || t <= 0) return 60;
  return t;
};

const withTimeout = async <T>(
  label: string,
  ms: number,
  op: () => Promise<T>,
  onTimeout: () => Promise<void>,
): Promise<T> => {
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    const result = await Promise.race([
      op(),
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timeout after ${Math.ceil(ms / 1000)}s`));
        }, ms);
      }),
    ]);
    return result;
  } catch (e) {
    if (e instanceof Error && e.message.includes("timeout after")) {
      try {
        await onTimeout();
      } catch {}
    }
    throw e;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const toTransportType = (config: McpConfig): McpTransportType => {
  const t = String(config.access_type || "").toLowerCase();
  if (t === "stdio") return "stdio";
  if (t === "http_sse" || t === "sse" || t === "http-sse") return "http_sse";
  if (t === "streamable_http" || t === "streamable-http" || t === "http")
    return "streamable_http";
  return "stdio";
};

const asUrl = (s: string): URL => {
  return new URL(s);
};

const normalizeToolResult = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return { result: raw };
};

const normalizeBearerToken = (token: string): string => {
  let t = String(token || "").trim();
  if (!t) return t;
  if (t.startsWith("Authorization="))
    t = t.slice("Authorization=".length).trim();
  if (t.toLowerCase().startsWith("bearer")) t = t.slice("bearer".length).trim();
  return t;
};

const buildHeaders = (config: McpConfig): Record<string, string> => {
  const base: Record<string, string> = { ...(config.headers || {}) };

  if (config.request_header_token && !base.Authorization) {
    const token = normalizeBearerToken(config.request_header_token);
    if (token) base.Authorization = `Bearer ${token}`;
  }

  if (config.auth?.type === "bearer" && config.auth.token) {
    if (!base.Authorization) base.Authorization = `Bearer ${config.auth.token}`;
  }
  return base;
};

const isToolNotFoundErrorMessage = (msg: string): boolean => {
  const m = String(msg || "").toLowerCase();
  if (!m) return false;
  // Best-effort mapping: SDK / transports may vary in phrasing.
  // Keep it conservative to avoid misclassifying execution errors.
  if (
    m.includes("tool") &&
    (m.includes("not found") || m.includes("does not exist"))
  )
    return true;
  if (m.includes("unknown tool")) return true;
  return false;
};

const extractCallToolResponse = (raw: any): Record<string, unknown> => {
  if (!raw) return {};

  // SDK shape usually contains: { content: [{type:'text', text:'...'}], structuredContent?, isError? }
  const structured = raw.structuredContent;
  if (structured && typeof structured === "object")
    return structured as Record<string, unknown>;

  const content = raw.content;
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const item of content) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as any).text === "string"
      ) {
        texts.push((item as any).text);
      }
    }
    if (texts.length) {
      const merged = texts.join("");
      try {
        const parsed = JSON.parse(merged);
        return normalizeToolResult(parsed);
      } catch {
        return { content: merged };
      }
    }
  }

  return normalizeToolResult(raw);
};

export class McpClientManager {
  private entries = new Map<string, ClientEntry>();

  async upsertAndConnect(
    config: McpConfig,
  ): Promise<{ success: boolean; error: string | null }> {
    await this.disconnect(config.id);

    const client = new Client(
      { name: "miloco-mcp-client", version: "0.0.0" },
      { capabilities: {} },
    );

    const entry: ClientEntry = {
      config,
      client,
      connected: false,
      lastError: null,
    };
    this.entries.set(config.id, entry);

    if (config.enable === false) {
      return { success: false, error: null };
    }

    const ms = timeoutSeconds(config) * 1000;

    try {
      const t = toTransportType(config);
      if (t === "stdio") {
        if (!config.command) throw new Error("command is required for stdio");
        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: config.env_vars ?? config.env,
          cwd: config.working_directory ?? config.cwd,
        });
        await withTimeout(
          "connect",
          ms,
          () => entry.client.connect(transport),
          async () => {
            await entry.client.close();
            entry.connected = false;
            entry.lastError = `connect timeout after ${timeoutSeconds(config)}s`;
          },
        );
      } else if (t === "http_sse") {
        if (!config.url) throw new Error("url is required for http_sse");
        const headers = buildHeaders(config);
        const transport = new SSEClientTransport(asUrl(config.url), {
          requestInit: { headers },
        });
        await withTimeout(
          "connect",
          ms,
          () => entry.client.connect(transport),
          async () => {
            await entry.client.close();
            entry.connected = false;
            entry.lastError = `connect timeout after ${timeoutSeconds(config)}s`;
          },
        );
      } else {
        if (!config.url) throw new Error("url is required for streamable_http");
        const headers = buildHeaders(config);
        const transport = new StreamableHTTPClientTransport(asUrl(config.url), {
          requestInit: { headers },
        });
        await withTimeout(
          "connect",
          ms,
          () => entry.client.connect(transport),
          async () => {
            await entry.client.close();
            entry.connected = false;
            entry.lastError = `connect timeout after ${timeoutSeconds(config)}s`;
          },
        );
      }

      entry.connected = true;
      entry.lastError = null;
      return { success: true, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      entry.connected = false;
      entry.lastError = msg;
      return { success: false, error: msg };
    }
  }

  async disconnect(configId: string): Promise<void> {
    const existing = this.entries.get(configId);
    if (!existing) return;

    try {
      await existing.client.close();
    } catch {}

    existing.connected = false;
  }

  async remove(configId: string): Promise<void> {
    await this.disconnect(configId);
    this.entries.delete(configId);
  }

  async reconnect(
    configId: string,
  ): Promise<{ success: boolean; error: string | null }> {
    const existing = this.entries.get(configId);
    if (!existing) return { success: false, error: "config not found" };
    return await this.upsertAndConnect(existing.config);
  }

  getStatus(): McpClientStatus[] {
    return Array.from(this.entries.values()).map((e) => ({
      client_id: e.config.id,
      server_name: e.config.name,
      connected: e.connected,
      error: e.lastError,
    }));
  }

  async listTools(clientIds: string[] | null): Promise<
    Array<{
      client_id: string;
      tool_name: string;
      description: string;
      parameters: Record<string, unknown> | null;
      tool_info: unknown;
    }>
  > {
    const ids = clientIds ? new Set(clientIds) : null;

    const result: Array<{
      client_id: string;
      tool_name: string;
      description: string;
      parameters: Record<string, unknown> | null;
      tool_info: unknown;
    }> = [];

    for (const entry of this.entries.values()) {
      if (!entry.connected) continue;
      if (ids && !ids.has(entry.config.id)) continue;

      try {
        const ms = timeoutSeconds(entry.config) * 1000;
        const resp = await withTimeout(
          "listTools",
          ms,
          () => entry.client.listTools(),
          async () => {
            await entry.client.close();
            entry.connected = false;
            entry.lastError = `listTools timeout after ${timeoutSeconds(entry.config)}s`;
          },
        );
        for (const tool of resp.tools || []) {
          result.push({
            client_id: entry.config.id,
            tool_name: tool.name,
            description: tool.description || "",
            parameters: (tool.inputSchema as any) || null,
            tool_info: tool as any,
          });
        }
      } catch (e) {
        entry.connected = false;
        entry.lastError = e instanceof Error ? e.message : String(e);
      }
    }

    return result;
  }

  async callTool(params: {
    client_id: string;
    tool_name: string;
    arguments: Record<string, unknown>;
  }): Promise<CallToolResult> {
    const entry = this.entries.get(params.client_id);
    if (!entry) {
      return {
        success: false,
        error_message: "Tool not found",
        response: null,
      };
    }
    if (!entry.connected) {
      return {
        success: false,
        error_message: "Tool not found",
        response: null,
      };
    }

    try {
      const ms = timeoutSeconds(entry.config) * 1000;
      const raw = await withTimeout(
        "callTool",
        ms,
        () =>
          entry.client.callTool({
            name: params.tool_name,
            arguments: params.arguments,
          } as any),
        async () => {
          await entry.client.close();
          entry.connected = false;
          entry.lastError = `callTool timeout after ${timeoutSeconds(entry.config)}s`;
        },
      );

      if (raw && typeof raw === "object" && (raw as any).isError) {
        return {
          success: false,
          error_message: "Tool execution failed",
          response: null,
        };
      }

      return {
        success: true,
        error_message: null,
        response: extractCallToolResponse(raw),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      entry.connected = false;
      entry.lastError = msg;
      let normalizedMessage = "Tool execution failed";
      if (msg.includes("timeout after")) {
        normalizedMessage = msg;
      } else if (isToolNotFoundErrorMessage(msg)) {
        normalizedMessage = "Tool not found";
      }
      return {
        success: false,
        error_message: normalizedMessage,
        response: null,
      };
    }
  }
}
