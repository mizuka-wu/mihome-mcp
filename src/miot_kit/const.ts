/**
 * MIoT Constants
 * 所有配置常量
 */

import { CloudServer, SystemLanguage } from './types';

// ============================================================================
// 基础配置
// ============================================================================

export const NICK_NAME_DEFAULT = 'Xiaomi';
export const PROJECT_CODE = 'mico';

// ============================================================================
// 小米 HTTP API 配置
// ============================================================================

export const MIHOME_HTTP_API_TIMEOUT = 30;
export const MIHOME_HTTP_USER_AGENT = `${PROJECT_CODE}/docker`;
export const MIHOME_HTTP_X_CLIENT_BIZID = `${PROJECT_CODE}api`;
export const MIHOME_HTTP_X_ENCRYPT_TYPE = '1';

// RSA 公钥（用于加密 AES 密钥）
export const MIHOME_HTTP_API_PUBKEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzH220YGgZOlXJ4eSleFb
Beylq4qHsVNzhPTUTy/caDb4a3GzqH6SX4GiYRilZZZrjjU2ckkr8GM66muaIuJw
r8ZB9SSY3Hqwo32tPowpyxobTN1brmqGK146X6JcFWK/QiUYVXZlcHZuMgXLlWyn
zTMVl2fq7wPbzZwOYFxnSRh8YEnXz6edHAqJqLEqZMP00bNFBGP+yc9xmc7ySSyw
OgW/muVzfD09P2iWhl3x8N+fBBWpuI5HjvyQuiX8CZg3xpEeCV8weaprxMxR0epM
3l7T6rJuPXR1D7yhHaEQj2+dyrZTeJO8D8SnOgzV5j4bp1dTunlzBXGYVjqDsRhZ
qQIDAQAB
-----END PUBLIC KEY-----`;

// ============================================================================
// OAuth 2.0 配置
// ============================================================================

export const OAUTH2_CLIENT_ID = '2882303761520431603';
export const OAUTH2_AUTH_URL = 'https://account.xiaomi.com/oauth2/authorize';
export const OAUTH2_API_HOST_DEFAULT = `${PROJECT_CODE}.api.mijia.tech`;

// 注册在小米 OAuth 2.0 服务中的重定向 URI
// 除非有管理员权限，否则不要修改
export const OAUTH2_REDIRECT_URI_LIST = [
  'https://127.0.0.1', // localhost
  `https://${PROJECT_CODE}.api.mijia.tech/login_redirect`, // Xiaomi official
];

// Token 过期时间比例（70% 有效期时刷新）
export const TOKEN_EXPIRES_TS_RATIO = 0.7;

// ============================================================================
// 缓存配置
// ============================================================================

// 规格库缓存有效期：30天（秒）
export const SPEC_STD_LIB_EFFECTIVE_TIME = 3600 * 24 * 30;
// 制造商信息缓存有效期：30天（秒）
export const MANUFACTURER_EFFECTIVE_TIME = 3600 * 24 * 30;

// ============================================================================
// 摄像头配置
// ============================================================================

// 摄像头重连间隔（秒）
export const CAMERA_RECONNECT_TIME_MIN = 3;
export const CAMERA_RECONNECT_TIME_MAX = 1200;

// ============================================================================
// 服务器配置
// ============================================================================

export const CLOUD_SERVER_DEFAULT: CloudServer = 'cn';

export const CLOUD_SERVERS: Record<CloudServer, string> = {
  cn: '中国大陆',
  de: 'Europe',
  i2: 'India',
  ru: 'Russia',
  sg: 'Singapore',
  us: 'United States',
};

// ============================================================================
// 语言配置
// ============================================================================

export const SYSTEM_LANGUAGE_DEFAULT: SystemLanguage = 'zh-Hans';

export const SYSTEM_LANGUAGES: Record<SystemLanguage, string> = {
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  ru: 'Русский',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
};

// ============================================================================
// mDNS 配置
// ============================================================================

export const MDNS_SUPPORT_TYPE_LIST: Record<string, { name: string }> = {
  '_miot-central._tcp.local.': { name: 'MIoT Central Service' },
  '_home-assistant._tcp.local.': { name: 'Home Assistant Service' },
};

export const MIPS_MDNS_REQUEST_TIMEOUT_MS = 5000;
export const MIPS_MDNS_UPDATE_INTERVAL_S = 600;

// ============================================================================
// 网络配置
// ============================================================================

// 用于检测网络状态的 IP 地址
export const IP_ADDRESS_LIST = [
  '1.2.4.8', // CNNIC sDNS
  '8.8.8.8', // Google Public DNS
  '9.9.9.9', // Quad9
];

// 用于检测网络状态的 URL
export const URL_ADDRESS_LIST = [
  'https://www.bing.com',
  'https://www.google.com',
  'https://www.baidu.com',
];

// 网络刷新间隔（秒）
export const NETWORK_REFRESH_INTERVAL = 30;
// 网络检测超时（秒）
export const NETWORK_DETECT_TIMEOUT = 6;

// ============================================================================
// 局域网配置
// ============================================================================

// 小米 Open Token 协议端口
export const OT_PORT = 54321;
export const OT_HEADER = Buffer.from([0x21, 0x31]); // "!1"
export const OT_PROBE_LEN = 32;
export const OT_MSG_LEN = 1400;
export const OT_PROBE_INTERVAL_MIN = 5;
export const OT_PROBE_INTERVAL_MAX = 45;

// ============================================================================
// Home Assistant 配置 (可选)
// ============================================================================

export const HA_HTTP_API_TIMEOUT = 30;

export const SUPPORT_ENTITY_CLASSES: Record<string, { name: string }> = {
  light: { name: 'Light' },
};

// ============================================================================
// 导出所有常量
// ============================================================================

export * from './const';
