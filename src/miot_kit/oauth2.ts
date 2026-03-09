/**
 * MIoT OAuth2 Client
 * 小米 OAuth2 认证客户端
 */

import axios from "axios";
import { MIoTOAuth2Error } from "./error";
import { MIoTOauthInfo, MIoTUserInfo } from "./types";
import {
  OAUTH2_CLIENT_ID,
  OAUTH2_AUTH_URL,
  OAUTH2_API_HOST_DEFAULT,
  TOKEN_EXPIRES_TS_RATIO,
  MIHOME_HTTP_API_TIMEOUT,
} from "./const";

/**
 * 基础 OAuth2 客户端
 */
export class BaseOAuth2Client {
  protected baseUrl: string;
  protected clientId: string;
  protected redirectUri: string;
  protected state: string | null = null;

  constructor(baseUrl: string, clientId: string, redirectUri: string) {
    if (!baseUrl || !clientId || !redirectUri) {
      throw new Error("Invalid OAuth2 client parameters");
    }
    this.baseUrl = baseUrl;
    this.clientId = clientId;
    this.redirectUri = redirectUri;
  }

  /**
   * 生成授权 URL（子类必须实现）
   */
  async generateAuthUrl(
    state?: string,
    extraParams?: Record<string, string>,
  ): Promise<string> {
    throw new Error("Subclass must implement generateAuthUrl");
  }

  /**
   * 验证 state
   */
  async validateState(state: string): Promise<boolean> {
    return this.state === state;
  }

  /**
   * 生成随机 state
   */
  protected generateState(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

/**
 * 小米 OAuth2 客户端
 */
export class MIoTOAuth2Client extends BaseOAuth2Client {
  private oauthHost: string;
  private deviceId: string;

  constructor(redirectUri: string, cloudServer: string, uuid: string) {
    const oauthHost =
      cloudServer === "cn"
        ? OAUTH2_API_HOST_DEFAULT
        : `${cloudServer}.${OAUTH2_API_HOST_DEFAULT}`;

    const baseUrl = `https://${oauthHost}/app/v2/${PROJECT_CODE}/oauth/get_token`;

    super(baseUrl, OAUTH2_CLIENT_ID, redirectUri);

    this.oauthHost = oauthHost;
    this.deviceId = `${PROJECT_CODE}.${uuid}`;
    this.state = this.generateSha1State();
  }

  /**
   * 生成 SHA1 state
   */
  private generateSha1State(): string {
    const { createHash } = require("crypto");
    return createHash("sha1").update(`d=${this.deviceId}`).digest("hex");
  }

  /**
   * 生成授权 URL
   */
  override async generateAuthUrl(
    state?: string,
    extraParams?: Record<string, string>,
  ): Promise<string> {
    const redirectUri = extraParams?.redirect_uri || this.redirectUri;
    const scope = extraParams?.scope ? extraParams.scope.split(" ") : undefined;
    const skipConfirm = extraParams?.skip_confirm === "true";
    const params: Record<string, string> = {
      redirect_uri: redirectUri || this.redirectUri,
      client_id: OAUTH2_CLIENT_ID,
      response_type: "code",
      device_id: this.deviceId,
      state: this.state!,
    };

    if (scope && scope.length > 0) {
      params.scope = scope.join(" ").trim();
    }

    params.skip_confirm = skipConfirm ? "true" : "false";

    const queryString = new URLSearchParams(params).toString();
    return `${OAUTH2_AUTH_URL}?${queryString}`;
  }

  /**
   * 获取访问令牌
   */
  async getAccessToken(code: string): Promise<MIoTOauthInfo> {
    return this.requestToken({
      client_id: OAUTH2_CLIENT_ID,
      redirect_uri: this.redirectUri,
      code,
      device_id: this.deviceId,
    });
  }

  /**
   * 刷新访问令牌
   */
  async refreshAccessToken(refreshToken: string): Promise<MIoTOauthInfo> {
    return this.requestToken({
      client_id: OAUTH2_CLIENT_ID,
      redirect_uri: this.redirectUri,
      refresh_token: refreshToken,
    });
  }

  /**
   * 请求令牌
   */
  private async requestToken(
    data: Record<string, string>,
  ): Promise<MIoTOauthInfo> {
    const url = `https://${this.oauthHost}/app/v2/mico/oauth/get_token`;

    try {
      const response = await axios.get(url, {
        params: { data: JSON.stringify(data) },
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        timeout: MIHOME_HTTP_API_TIMEOUT * 1000,
        validateStatus: (status: number) => status < 500,
      });

      if (response.status === 401) {
        throw new MIoTOAuth2Error("Unauthorized (401)", -10020);
      }

      if (response.status !== 200) {
        throw new MIoTOAuth2Error(
          `Invalid HTTP status: ${response.status}`,
          -10020,
        );
      }

      const result = response.data;

      if (
        !result ||
        result.code !== 0 ||
        !result.result ||
        !result.result.access_token ||
        !result.result.refresh_token
      ) {
        throw new MIoTOAuth2Error(
          `Invalid response: ${JSON.stringify(result)}`,
          -10020,
        );
      }

      const expiresIn = result.result.expires_in || 0;
      const expiresTs = Math.floor(
        Date.now() / 1000 + expiresIn * TOKEN_EXPIRES_TS_RATIO,
      );

      return {
        access_token: result.result.access_token,
        refresh_token: result.result.refresh_token,
        expires_ts: expiresTs,
      };
    } catch (error) {
      if (error instanceof MIoTOAuth2Error) {
        throw error;
      }
      throw new MIoTOAuth2Error(
        `Token request failed: ${error instanceof Error ? error.message : String(error)}`,
        -10020,
      );
    }
  }
}

// 项目名称常量
const PROJECT_CODE = "mico";

// ============================================================================
// 导出
// ============================================================================

export * from "./oauth2";
