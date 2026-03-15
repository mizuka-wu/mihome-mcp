import { describe, expect, it, vi } from "vitest";

vi.mock("@modelcontextprotocol/sdk/client", () => {
  class Client {
    connect() {
      return new Promise<void>(() => {});
    }
    close() {
      return Promise.resolve();
    }
    listTools() {
      return Promise.resolve({ tools: [] });
    }
    callTool() {
      return Promise.resolve({ content: [] });
    }
  }
  return { Client };
});

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => {
  class StdioClientTransport {
    constructor(_opts: unknown) {}
  }
  return { StdioClientTransport };
});

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => {
  class SSEClientTransport {
    constructor(_url: URL, _opts?: unknown) {}
  }
  return { SSEClientTransport };
});

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => {
  class StreamableHTTPClientTransport {
    constructor(_url: URL, _opts?: unknown) {}
  }
  return { StreamableHTTPClientTransport };
});

describe("McpClientManager timeout", () => {
  it("upsertAndConnect should respect config.timeout and return timeout error", async () => {
    const { McpClientManager } = await import("../client-manager");

    const mgr = new McpClientManager();
    const start = Date.now();

    const result = await mgr.upsertAndConnect({
      id: "t1",
      name: "test",
      enable: true,
      access_type: "stdio",
      command: "echo",
      args: ["ok"],
      timeout: 1,
    });

    const elapsed = Date.now() - start;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/connect timeout after/i);
    // Allow some scheduling overhead
    expect(elapsed).toBeLessThan(2500);
  });

  it("callTool should map tool-not-found errors to 'Tool not found'", async () => {
    const { McpClientManager } = await import("../client-manager");

    const mgr = new McpClientManager();

    // Insert a fake connected entry.
    (mgr as any).entries.set("c1", {
      config: { id: "c1", name: "test", timeout: 60 },
      client: {
        callTool: () => Promise.reject(new Error("Tool 'x' does not exist")),
        close: () => Promise.resolve(),
      },
      connected: true,
      lastError: null,
    });

    const result = await mgr.callTool({
      client_id: "c1",
      tool_name: "x",
      arguments: {},
    });

    expect(result.success).toBe(false);
    expect(result.error_message).toBe("Tool not found");
    expect(result.response).toBeNull();
  });

  it("callTool should timeout and disconnect client", async () => {
    const { McpClientManager } = await import("../client-manager");

    const mgr = new McpClientManager();

    // Insert a fake connected entry with a tool that hangs.
    const entry = {
      config: { id: "c2", name: "test", timeout: 1 },
      client: {
        callTool: () => new Promise<void>(() => {}), // Never resolves
        close: () => Promise.resolve(),
      },
      connected: true,
      lastError: null,
    };
    (mgr as any).entries.set("c2", entry);

    const start = Date.now();
    const result = await mgr.callTool({
      client_id: "c2",
      tool_name: "x",
      arguments: {},
    });
    const elapsed = Date.now() - start;

    expect(result.success).toBe(false);
    expect(result.error_message).toMatch(/callTool timeout after/i);
    expect(result.response).toBeNull();
    // Verify client was disconnected
    expect(entry.connected).toBe(false);
    // Verify timeout occurred within expected window (1s timeout + overhead)
    expect(elapsed).toBeGreaterThanOrEqual(1000);
    expect(elapsed).toBeLessThan(2500);
  });
});
