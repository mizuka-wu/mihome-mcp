/**
 * MIoT Cloud HTTP Client
 * 小米云服务 HTTP 客户端
 */

import axios, { AxiosInstance } from 'axios';
import { createCipheriv, createPublicKey, publicEncrypt, randomBytes } from 'crypto';
import { MIoTHttpError } from './error';
import {
  MIoTDeviceInfo,
  MIoTHomeInfo,
  MIoTGetPropertyParam,
  MIoTSetPropertyParam,
  MIoTActionParam,
  MIoTManualSceneInfo,
  MIoTAppNotify,
} from './types';
import {
  OAUTH2_API_HOST_DEFAULT,
  MIHOME_HTTP_API_PUBKEY,
  MIHOME_HTTP_X_CLIENT_BIZID,
  MIHOME_HTTP_X_ENCRYPT_TYPE,
  MIHOME_HTTP_USER_AGENT,
  MIHOME_HTTP_API_TIMEOUT,
  CLOUD_SERVER_DEFAULT,
} from './const';

/**
 * 小米云服务 HTTP 客户端
 */
export class MIoTCloudClient {
  private axios: AxiosInstance;
  private host: string;
  private accessToken: string;
  private randomAesKey: Buffer;
  private clientSecretB64: string;

  constructor(cloudServer: string, accessToken: string) {
    this.accessToken = accessToken;
    this.host = cloudServer === 'cn'
      ? OAUTH2_API_HOST_DEFAULT
      : `${cloudServer}.${OAUTH2_API_HOST_DEFAULT}`;

    // 生成随机 AES 密钥
    this.randomAesKey = randomBytes(16);

    // 使用 RSA 公钥加密 AES 密钥
    const publicKey = createPublicKey(MIHOME_HTTP_API_PUBKEY);
    const encrypted = publicEncrypt(
      {
        key: publicKey,
        padding: require('crypto').constants.RSA_PKCS1_PADDING,
      },
      this.randomAesKey
    );
    this.clientSecretB64 = encrypted.toString('base64');

    // 创建 axios 实例
    this.axios = axios.create({
      timeout: MIHOME_HTTP_API_TIMEOUT * 1000,
      headers: {
        'User-Agent': MIHOME_HTTP_USER_AGENT,
        'x-client-bizid': MIHOME_HTTP_X_CLIENT_BIZID,
        'x-encrypt-type': MIHOME_HTTP_X_ENCRYPT_TYPE,
      },
    });
  }

  /**
   * 更新访问令牌
   */
  updateAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
  }

  /**
   * 加密请求数据
   */
  private encryptData(data: Record<string, unknown>): string {
    const iv = this.randomAesKey;
    const cipher = createCipheriv('aes-128-cbc', this.randomAesKey, iv);
    const jsonStr = JSON.stringify(data);
    let encrypted = cipher.update(jsonStr, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  }

  /**
   * 发送 HTTP 请求
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const url = `https://${this.host}${path}`;

    try {
      const response = await this.axios.request({
        method,
        url,
        params: method === 'GET' ? params : undefined,
        data: method === 'POST' ? this.encryptData(params || {}) : undefined,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'x-client-secret': this.clientSecretB64,
        },
      });

      if (response.status !== 200) {
        throw new MIoTHttpError(`HTTP ${response.status}`, -10030);
      }

      const result = response.data;
      if (result.code !== 0) {
        throw new MIoTHttpError(result.message || `API error: ${result.code}`, -10030);
      }

      return result.result as T;
    } catch (error) {
      if (error instanceof MIoTHttpError) {
        throw error;
      }
      throw new MIoTHttpError(
        `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        -10030
      );
    }
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(): Promise<{ uid: string; nickname: string; icon: string }> {
    return this.request('GET', '/app/v2/user/get_user_info');
  }

  /**
   * 获取家庭列表
   */
  async getHomes(): Promise<MIoTHomeInfo[]> {
    return this.request('GET', '/app/v2/homeroom/get_homes');
  }

  /**
   * 获取设备列表
   */
  async getDevices(): Promise<MIoTDeviceInfo[]> {
    return this.request('GET', '/app/v2/home/device_list');
  }

  /**
   * 获取设备属性
   */
  async getProperties(params: MIoTGetPropertyParam[]): Promise<unknown[]> {
    return this.request('POST', '/app/v2/device/get_props', { params });
  }

  /**
   * 设置设备属性
   */
  async setProperties(params: MIoTSetPropertyParam[]): Promise<unknown[]> {
    return this.request('POST', '/app/v2/device/set_props', { params });
  }

  /**
   * 执行设备动作
   */
  async doAction(params: MIoTActionParam): Promise<unknown> {
    return this.request('POST', '/app/v2/device/do_action', params);
  }

  /**
   * 获取手动场景列表
   */
  async getManualScenes(): Promise<MIoTManualSceneInfo[]> {
    return this.request('GET', '/app/v2/scene/list_manual_scene');
  }

  /**
   * 执行手动场景
   */
  async runManualScene(sceneId: string): Promise<unknown> {
    return this.request('POST', '/app/v2/scene/run_manual_scene', { scene_id: sceneId });
  }

  /**
   * 发送 App 通知
   */
  async sendAppNotify(content: string): Promise<unknown> {
    return this.request('POST', '/app/v2/message/send_app_notify', { content });
  }
}

// ============================================================================
// 导出
// ============================================================================

export * from './cloud';
