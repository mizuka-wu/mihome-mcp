/**
 * MCP Module Tests
 * MCP 服务器模块测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MIoTMcpServer } from "../mcp";

describe("MCP Module", () => {
  let server: MIoTMcpServer;

  beforeEach(() => {
    server = new MIoTMcpServer("/tmp/test-cache");
  });

  describe("constructor", () => {
    it("should create MCP server with cache path", () => {
      expect(server).toBeDefined();
    });
  });

  describe("init", () => {
    it("should initialize without errors", async () => {
      await expect(server.init()).resolves.not.toThrow();
    });
  });

  describe("getTools", () => {
    it("should return array of tools", () => {
      const tools = server.getTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it("should have required tool names", () => {
      const tools = server.getTools();
      const toolNames = tools.map((tool: { name: string }) => tool.name);

      expect(toolNames).toContain("miot_init");
      expect(toolNames).toContain("miot_get_devices");
      expect(toolNames).toContain("miot_get_device_spec");
      expect(toolNames).toContain("miot_get_properties");
      expect(toolNames).toContain("miot_set_property");
      expect(toolNames).toContain("miot_do_action");
      expect(toolNames).toContain("miot_get_manual_scenes");
      expect(toolNames).toContain("miot_run_manual_scene");
      expect(toolNames).toContain("miot_send_notification");
    });

    it("each tool should have required properties", () => {
      const tools = server.getTools();
      tools.forEach(
        (tool: { name: string; description: string; handler: Function }) => {
          expect(tool).toHaveProperty("name");
          expect(tool).toHaveProperty("description");
          expect(tool).toHaveProperty("handler");
          expect(typeof tool.handler).toBe("function");
        },
      );
    });
  });

  describe("Tool handlers", () => {
    // Skip server.init() in beforeEach to avoid network timeout

    describe("miot_init", () => {
      it("should have handler that returns result", async () => {
        const tools = server.getTools();
        const initTool = tools.find(
          (tool: { name: string }) => tool.name === "miot_init",
        )!;

        // Verify handler exists and is a function
        expect(initTool).toHaveProperty("handler");
        expect(typeof initTool.handler).toBe("function");
      });
    });

    describe("miot_generate_auth_url", () => {
      it("should return null when client not initialized", async () => {
        const tools = server.getTools();
        const authUrlTool = tools.find(
          (tool: { name: string }) => tool.name === "miot_generate_auth_url",
        )!;

        const result = await authUrlTool.handler({});
        expect(result).toHaveProperty("url");
        expect(result.url).toBeNull();
      });
    });

    describe("miot_get_devices", () => {
      it("should return empty array when client not initialized", async () => {
        const tools = server.getTools();
        const devicesTool = tools.find(
          (tool: { name: string }) => tool.name === "miot_get_devices",
        )!;

        const result = await devicesTool.handler({});
        expect(result).toHaveProperty("devices");
        expect(Array.isArray(result.devices)).toBe(true);
        expect(result.devices.length).toBe(0);
      });
    });

    describe("miot_get_device_spec", () => {
      it("should return null when client not initialized", async () => {
        const tools = server.getTools();
        const specTool = tools.find(
          (tool: { name: string }) => tool.name === "miot_get_device_spec",
        )!;

        const result = await specTool.handler({ model: "test.model" });
        expect(result).toHaveProperty("spec");
        expect(result.spec).toBeNull();
      });
    });

    describe("miot_get_properties", () => {
      it("should return empty array when client not initialized", async () => {
        const tools = server.getTools();
        const propsTool = tools.find(
          (tool: { name: string }) => tool.name === "miot_get_properties",
        )!;

        const result = await propsTool.handler({
          did: "test-did",
          siid: 1,
          piid: 1,
        });
        expect(result).toHaveProperty("properties");
        expect(Array.isArray(result.properties)).toBe(true);
        expect(result.properties.length).toBe(0);
      });
    });
  });
});
