/**
 * MIoT MCP Server Integration
 * MCP 服务器集成，提供小米 IoT 设备控制能力
 */

import { MIoTClient, MIoTClientOptions } from "./client";
import { MIoTStorage } from "./storage";
import { MIoTDeviceInfo, MIoTHomeInfo, MIoTManualSceneInfo } from "./types";

interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * MIoT MCP 服务器
 */
export class MIoTMcpServer {
  private client: MIoTClient | null = null;
  private storage: MIoTStorage | null = null;
  private cachePath: string;

  constructor(cachePath: string) {
    this.cachePath = cachePath;
  }

  /**
   * 初始化
   */
  async init(): Promise<void> {
    this.storage = new MIoTStorage(this.cachePath);

    // 尝试从存储加载配置
    const config = await this.storage.load<MIoTClientOptions>(
      "config",
      "client",
    );
    if (config) {
      this.client = new MIoTClient(config);
      await this.client.init();
    }
  }

  /**
   * 获取所有可用工具
   */
  getTools(): Tool[] {
    return [
      {
        name: "miot_init",
        description: "Initialize MIoT client with OAuth2 authentication",
        parameters: {
          type: "object",
          properties: {
            uuid: { type: "string", description: "Device UUID" },
            redirectUri: { type: "string", description: "OAuth2 redirect URI" },
            cloudServer: {
              type: "string",
              description: "Cloud server region (cn, de, us, etc.)",
            },
          },
          required: ["uuid", "redirectUri"],
        },
        handler: this.handleInit.bind(this),
      },
      {
        name: "miot_generate_auth_url",
        description: "Generate OAuth2 authorization URL",
        handler: this.handleGenerateAuthUrl.bind(this),
      },
      {
        name: "miot_get_access_token",
        description: "Exchange authorization code for access token",
        parameters: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "Authorization code from OAuth2 callback",
            },
            state: {
              type: "string",
              description: "State parameter from OAuth2 callback",
            },
          },
          required: ["code", "state"],
        },
        handler: this.handleGetAccessToken.bind(this),
      },
      {
        name: "miot_get_devices",
        description: "Get list of all MIoT devices",
        handler: this.handleGetDevices.bind(this),
      },
      {
        name: "miot_get_device_spec",
        description: "Get device specification by model",
        parameters: {
          type: "object",
          properties: {
            model: { type: "string", description: "Device model identifier" },
          },
          required: ["model"],
        },
        handler: this.handleGetDeviceSpec.bind(this),
      },
      {
        name: "miot_get_properties",
        description: "Get device properties",
        parameters: {
          type: "object",
          properties: {
            did: { type: "string", description: "Device ID" },
            siid: { type: "number", description: "Service instance ID" },
            piid: { type: "number", description: "Property instance ID" },
          },
          required: ["did", "siid", "piid"],
        },
        handler: this.handleGetProperties.bind(this),
      },
      {
        name: "miot_set_property",
        description: "Set device property",
        parameters: {
          type: "object",
          properties: {
            did: { type: "string", description: "Device ID" },
            siid: { type: "number", description: "Service instance ID" },
            piid: { type: "number", description: "Property instance ID" },
            value: { description: "Property value to set" },
          },
          required: ["did", "siid", "piid", "value"],
        },
        handler: this.handleSetProperty.bind(this),
      },
      {
        name: "miot_do_action",
        description: "Execute device action",
        parameters: {
          type: "object",
          properties: {
            did: { type: "string", description: "Device ID" },
            siid: { type: "number", description: "Service instance ID" },
            aiid: { type: "number", description: "Action instance ID" },
            params: { type: "array", description: "Action parameters" },
          },
          required: ["did", "siid", "aiid"],
        },
        handler: this.handleDoAction.bind(this),
      },
      {
        name: "miot_get_manual_scenes",
        description: "Get list of manual scenes (automations)",
        handler: this.handleGetManualScenes.bind(this),
      },
      {
        name: "miot_run_manual_scene",
        description: "Execute a manual scene",
        parameters: {
          type: "object",
          properties: {
            sceneId: { type: "string", description: "Scene ID to execute" },
          },
          required: ["sceneId"],
        },
        handler: this.handleRunManualScene.bind(this),
      },
      {
        name: "miot_send_notification",
        description: "Send notification to MIoT app",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", description: "Notification content" },
          },
          required: ["content"],
        },
        handler: this.handleSendNotification.bind(this),
      },
    ];
  }

  private async handleInit(
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const cloudServer = args.cloudServer as string;
      const options: MIoTClientOptions = {
        uuid: args.uuid as string,
        redirectUri: args.redirectUri as string,
        cloudServer:
          cloudServer === "cn" ||
          cloudServer === "de" ||
          cloudServer === "i2" ||
          cloudServer === "ru" ||
          cloudServer === "sg" ||
          cloudServer === "us"
            ? cloudServer
            : "cn",
      };

      this.client = new MIoTClient(options);
      await this.client.init();

      // 保存配置
      if (this.storage) {
        await this.storage.save("config", "client", options);
      }

      return { success: true, message: "MIoT client initialized successfully" };
    } catch (error) {
      return {
        success: false,
        message: `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async handleGenerateAuthUrl(): Promise<{ url: string | null }> {
    if (!this.client) {
      return { url: null };
    }
    const url = await this.client.generateAuthUrl();
    return { url };
  }

  private async handleGetAccessToken(
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    if (!this.client) {
      return { success: false, message: "Client not initialized" };
    }
    try {
      await this.client.getAccessToken(
        args.code as string,
        args.state as string,
      );
      return { success: true, message: "Access token obtained successfully" };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get access token: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async handleGetDevices(): Promise<{ devices: MIoTDeviceInfo[] }> {
    if (!this.client) {
      return { devices: [] };
    }
    const devices = this.client.getDevices();
    return { devices };
  }

  private async handleGetDeviceSpec(
    args: Record<string, unknown>,
  ): Promise<{ spec: unknown }> {
    if (!this.client) {
      return { spec: null };
    }
    const spec = await this.client.getDeviceSpec(args.model as string);
    return { spec };
  }

  private async handleGetProperties(
    args: Record<string, unknown>,
  ): Promise<{ properties: unknown[] }> {
    if (!this.client) {
      return { properties: [] };
    }
    const properties = await this.client.getDeviceProperties([
      {
        did: args.did as string,
        siid: args.siid as number,
        piid: args.piid as number,
      },
    ]);
    return { properties };
  }

  private async handleSetProperty(
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; result: unknown }> {
    if (!this.client) {
      return { success: false, result: null };
    }
    try {
      const result = await this.client.setDeviceProperties([
        {
          did: args.did as string,
          siid: args.siid as number,
          piid: args.piid as number,
          value: args.value,
        },
      ]);
      return { success: true, result: result[0] };
    } catch (error) {
      return {
        success: false,
        result: null,
      };
    }
  }

  private async handleDoAction(
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; result: unknown }> {
    if (!this.client) {
      return { success: false, result: null };
    }
    try {
      const result = await this.client.doDeviceAction({
        did: args.did as string,
        siid: args.siid as number,
        aiid: args.aiid as number,
        in: (args.params as unknown[]) || [],
      });
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        result: null,
      };
    }
  }

  private async handleGetManualScenes(): Promise<{
    scenes: MIoTManualSceneInfo[];
  }> {
    if (!this.client) {
      return { scenes: [] };
    }
    const scenes = await this.client.getManualScenes();
    return { scenes };
  }

  private async handleRunManualScene(
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; result: unknown }> {
    if (!this.client) {
      return { success: false, result: null };
    }
    try {
      const result = await this.client.runManualScene(args.sceneId as string);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        result: null,
      };
    }
  }

  private async handleSendNotification(
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; result: unknown }> {
    if (!this.client) {
      return { success: false, result: null };
    }
    try {
      const result = await this.client.sendAppNotify(args.content as string);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        result: null,
      };
    }
  }
}

// ============================================================================
// 导出
// ============================================================================

export * from "./mcp";
