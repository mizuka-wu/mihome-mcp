/**
 * MIoT Client
 * 主客户端，整合所有功能模块
 */

import { MIoTOAuth2Client } from "./oauth2";
import { MIoTCloudClient } from "./cloud";
import { MIoTNetwork } from "./network";
import { MIoTLan } from "./lan";
import { MIoTMdns } from "./mdns";
import { MIoTSpecParser } from "./spec";
import { MIoTI18n } from "./i18n";
import { MIoTStorage } from "./storage";
import { MIoTClientError } from "./error";
import {
  MIoTDeviceInfo,
  MIoTHomeInfo,
  MIoTManualSceneInfo,
  MIoTOauthInfo,
  MIoTGetPropertyParam,
  MIoTSetPropertyParam,
  MIoTActionParam,
  CloudServer,
  SystemLanguage,
} from "./types";
import { CLOUD_SERVER_DEFAULT, SYSTEM_LANGUAGE_DEFAULT } from "./const";

export interface MIoTClientOptions {
  uuid: string;
  redirectUri: string;
  cachePath?: string;
  lang?: SystemLanguage;
  oauthInfo?: MIoTOauthInfo;
  cloudServer?: CloudServer;
}

/**
 * MIoT 主客户端
 */
export class MIoTClient {
  private uuid: string;
  private redirectUri: string;
  private cachePath?: string;
  private lang: SystemLanguage;
  private cloudServer: CloudServer;
  private oauthInfo?: MIoTOauthInfo;

  private storage?: MIoTStorage;
  private i18n: MIoTI18n;
  private oauthClient: MIoTOAuth2Client;
  private cloudClient?: MIoTCloudClient;
  private networkClient: MIoTNetwork;
  private lanClient: MIoTLan;
  private mdnsClient: MIoTMdns;
  private specParser: MIoTSpecParser;

  private devices: Map<string, MIoTDeviceInfo> = new Map();
  private homes: Map<string, MIoTHomeInfo> = new Map();
  private initialized = false;

  constructor(options: MIoTClientOptions) {
    if (!options.uuid) {
      throw new MIoTClientError("uuid is required");
    }
    if (!options.redirectUri) {
      throw new MIoTClientError("redirectUri is required");
    }

    this.uuid = options.uuid;
    this.redirectUri = options.redirectUri;
    this.cachePath = options.cachePath;
    this.lang = options.lang || SYSTEM_LANGUAGE_DEFAULT;
    this.cloudServer = options.cloudServer || CLOUD_SERVER_DEFAULT;
    this.oauthInfo = options.oauthInfo;

    // 初始化子模块
    this.i18n = new MIoTI18n(this.lang);
    this.oauthClient = new MIoTOAuth2Client(
      this.redirectUri,
      this.cloudServer,
      this.uuid,
    );
    this.networkClient = new MIoTNetwork();
    this.lanClient = new MIoTLan([]);
    this.mdnsClient = new MIoTMdns();
    this.specParser = new MIoTSpecParser();

    if (this.cachePath) {
      this.storage = new MIoTStorage(this.cachePath);
    }
  }

  /**
   * 初始化客户端
   */
  async init(): Promise<void> {
    if (this.initialized) {
      console.warn("Client already initialized");
      return;
    }

    // 初始化 i18n
    await this.i18n.init();

    // 初始化网络监控
    await this.networkClient.init();

    // 获取网络接口信息
    const netInfo = this.networkClient.getNetworkInfo();
    const interfaces = Object.keys(netInfo);

    // 重新创建 LAN 客户端
    this.lanClient = new MIoTLan(interfaces);
    await this.lanClient.init();

    // 初始化 mDNS
    await this.mdnsClient.init();

    // 如果有 OAuth 信息，初始化云服务客户端
    if (this.oauthInfo?.access_token) {
      this.cloudClient = new MIoTCloudClient(
        this.cloudServer,
        this.oauthInfo.access_token,
      );

      // 加载设备列表
      await this.loadDevices();
    }

    this.initialized = true;
    console.log("MIoT client initialized");
  }

  /**
   * 销毁客户端
   */
  async destroy(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    await this.i18n.destroy();
    await this.networkClient.destroy();
    await this.lanClient.destroy();
    await this.mdnsClient.destroy();

    this.devices.clear();
    this.homes.clear();
    this.initialized = false;

    console.log("MIoT client destroyed");
  }

  /**
   * 生成 OAuth2 授权 URL
   */
  async generateAuthUrl(): Promise<string> {
    return this.oauthClient.generateAuthUrl();
  }

  /**
   * 获取访问令牌
   */
  async getAccessToken(code: string, state: string): Promise<MIoTOauthInfo> {
    // 验证 state
    const valid = await this.oauthClient.validateState(state);
    if (!valid) {
      throw new MIoTClientError("Invalid state parameter");
    }

    // 获取令牌
    this.oauthInfo = await this.oauthClient.getAccessToken(code);

    // 更新云服务客户端
    this.cloudClient = new MIoTCloudClient(
      this.cloudServer,
      this.oauthInfo.access_token,
    );

    // 保存到存储
    if (this.storage) {
      await this.storage.save("oauth", "info", this.oauthInfo);
    }

    // 加载设备列表
    await this.loadDevices();

    return this.oauthInfo;
  }

  /**
   * 刷新访问令牌
   */
  async refreshAccessToken(): Promise<MIoTOauthInfo> {
    if (!this.oauthInfo?.refresh_token) {
      throw new MIoTClientError("No refresh token available");
    }

    this.oauthInfo = await this.oauthClient.refreshAccessToken(
      this.oauthInfo.refresh_token,
    );

    // 更新云服务客户端
    if (this.cloudClient) {
      this.cloudClient.updateAccessToken(this.oauthInfo.access_token);
    }

    // 保存到存储
    if (this.storage) {
      await this.storage.save("oauth", "info", this.oauthInfo);
    }

    return this.oauthInfo;
  }

  /**
   * 加载设备列表
   */
  private async loadDevices(): Promise<void> {
    if (!this.cloudClient) {
      throw new MIoTClientError("Cloud client not initialized");
    }

    try {
      const devices = await this.cloudClient.getDevices();
      this.devices.clear();
      for (const device of devices) {
        this.devices.set(device.did, device);
      }

      // 加载家庭列表
      const homes = await this.cloudClient.getHomes();
      this.homes.clear();
      for (const home of homes) {
        this.homes.set(home.home_id, home);
      }
    } catch (error) {
      console.error("Failed to load devices:", error);
      throw new MIoTClientError(
        `Failed to load devices: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 获取设备列表
   */
  getDevices(): MIoTDeviceInfo[] {
    return Array.from(this.devices.values());
  }

  /**
   * 根据 DID 获取设备
   */
  getDevice(did: string): MIoTDeviceInfo | undefined {
    return this.devices.get(did);
  }

  /**
   * 获取家庭列表
   */
  getHomes(): MIoTHomeInfo[] {
    return Array.from(this.homes.values());
  }

  /**
   * 获取设备属性
   */
  async getDeviceProperties(
    params: MIoTGetPropertyParam[],
  ): Promise<unknown[]> {
    if (!this.cloudClient) {
      throw new MIoTClientError("Cloud client not initialized");
    }
    return this.cloudClient.getProperties(params);
  }

  /**
   * 设置设备属性
   */
  async setDeviceProperties(
    params: MIoTSetPropertyParam[],
  ): Promise<unknown[]> {
    if (!this.cloudClient) {
      throw new MIoTClientError("Cloud client not initialized");
    }
    return this.cloudClient.setProperties(params);
  }

  /**
   * 执行设备动作
   */
  async doDeviceAction(params: MIoTActionParam): Promise<unknown> {
    if (!this.cloudClient) {
      throw new MIoTClientError("Cloud client not initialized");
    }
    return this.cloudClient.doAction(params);
  }

  /**
   * 获取设备规格
   */
  async getDeviceSpec(model: string): Promise<unknown> {
    return this.specParser.getSpec(model);
  }

  /**
   * 获取手动场景列表
   */
  async getManualScenes(): Promise<MIoTManualSceneInfo[]> {
    if (!this.cloudClient) {
      throw new MIoTClientError("Cloud client not initialized");
    }
    return this.cloudClient.getManualScenes();
  }

  /**
   * 执行手动场景
   */
  async runManualScene(sceneId: string): Promise<unknown> {
    if (!this.cloudClient) {
      throw new MIoTClientError("Cloud client not initialized");
    }
    return this.cloudClient.runManualScene(sceneId);
  }

  /**
   * 发送 App 通知
   */
  async sendAppNotify(content: string): Promise<unknown> {
    if (!this.cloudClient) {
      throw new MIoTClientError("Cloud client not initialized");
    }
    return this.cloudClient.sendAppNotify(content);
  }

  /**
   * 翻译
   */
  async translate(
    domain: string,
    key: string,
    replace?: Record<string, string>,
  ): Promise<string | Record<string, unknown> | null> {
    return this.i18n.translate(domain, key, replace);
  }

  /**
   * 获取网络状态
   */
  getNetworkStatus(): boolean {
    return this.networkClient.getNetworkStatus();
  }
}

// ============================================================================
// 导出
// ============================================================================

export * from "./client";
