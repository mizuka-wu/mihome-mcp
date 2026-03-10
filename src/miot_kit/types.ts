/**
 * MIoT Type Definitions
 * 使用 zod 进行运行时类型验证
 */

import { z } from "zod";

// ============================================================================
// 基础枚举类型
// ============================================================================

export const CloudServerSchema = z.enum(["cn", "de", "i2", "ru", "sg", "us"]);
export type CloudServer = z.infer<typeof CloudServerSchema>;

export const SystemLanguageSchema = z.enum([
  "de",
  "en",
  "es",
  "fr",
  "it",
  "ja",
  "ru",
  "zh-Hans",
  "zh-Hant",
]);
export type SystemLanguage = z.infer<typeof SystemLanguageSchema>;

export const MIoTCameraVideoQualitySchema = z.enum(["LOW", "HIGH"]);
export type MIoTCameraVideoQuality = z.infer<
  typeof MIoTCameraVideoQualitySchema
>;

export const MIoTCameraStatusSchema = z.enum([
  "DISCONNECTED",
  "CONNECTING",
  "RE_CONNECTING",
  "CONNECTED",
  "ERROR",
]);
export type MIoTCameraStatus = z.infer<typeof MIoTCameraStatusSchema>;

// ============================================================================
// OAuth 相关类型
// ============================================================================

export const MIoTUserInfoSchema = z.object({
  uid: z.string(),
  nickname: z.string(),
  icon: z.string(),
  union_id: z.string(),
});
export type MIoTUserInfo = z.infer<typeof MIoTUserInfoSchema>;

export const BaseOAuthInfoSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_ts: z.number(), // Unix timestamp in seconds
});
export type BaseOAuthInfo = z.infer<typeof BaseOAuthInfoSchema>;

export const MIoTOauthInfoSchema = BaseOAuthInfoSchema.extend({
  user_info: z.optional(MIoTUserInfoSchema),
});
export type MIoTOauthInfo = z.infer<typeof MIoTOauthInfoSchema>;

// ============================================================================
// 家庭和房间
// ============================================================================

export const MIoTRoomInfoSchema = z.object({
  room_id: z.string(),
  room_name: z.string(),
  create_ts: z.number(), // Second
  dids: z.array(z.string()),
});
export type MIoTRoomInfo = z.infer<typeof MIoTRoomInfoSchema>;

export const MIoTHomeInfoSchema = z.object({
  home_id: z.string(),
  home_name: z.string(),
  share_home: z.boolean(),
  uid: z.string(),
  room_list: z.record(MIoTRoomInfoSchema),
  create_ts: z.number(),
  dids: z.array(z.string()),
  group_id: z.string(),
  city_id: z.optional(z.number()),
  longitude: z.optional(z.number()),
  latitude: z.optional(z.number()),
  address: z.optional(z.string()),
});
export type MIoTHomeInfo = z.infer<typeof MIoTHomeInfoSchema>;

// ============================================================================
// 设备信息
// ============================================================================

export const MIoTDeviceInfoCoreSchema = z.object({
  did: z.string(),
  name: z.string(),
});
export type MIoTDeviceInfoCore = z.infer<typeof MIoTDeviceInfoCoreSchema>;

export const MIoTDeviceInfoSchema = z.object({
  did: z.string(),
  name: z.string(),
  uid: z.string(),
  urn: z.string(),
  model: z.string(),
  manufacturer: z.string(),
  connect_type: z.number(),
  pid: z.number(),
  token: z.string(),
  online: z.boolean(),
  voice_ctrl: z.number(),
  order_time: z.number(), // Device bind or share time
  sub_devices: z.record(z.string(), z.any()).default({}),
  is_set_pincode: z.number().default(0),
  pincode_type: z.number().default(0),
  // Home information
  home_id: z.optional(z.string()),
  home_name: z.optional(z.string()),
  room_id: z.optional(z.string()),
  room_name: z.optional(z.string()),
  // Network info
  rssi: z.optional(z.number()),
  lan_status: z.optional(z.boolean()),
  local_ip: z.optional(z.string()),
  ssid: z.optional(z.string()),
  bssid: z.optional(z.string()),
  icon: z.optional(z.string()),
  parent_id: z.optional(z.string()),
});
export type MIoTDeviceInfo = z.infer<typeof MIoTDeviceInfoSchema>;

// ============================================================================
// 摄像头
// ============================================================================

export const MIoTCameraCodecSchema = z.enum(["H264", "H265"]);
export type MIoTCameraCodec = z.infer<typeof MIoTCameraCodecSchema>;

export const MIoTCameraFrameTypeSchema = z.enum(["FRAME_I", "FRAME_P"]);
export type MIoTCameraFrameType = z.infer<typeof MIoTCameraFrameTypeSchema>;

export const MIoTCameraFrameDataSchema = z.object({
  codec_id: z.number(),
  length: z.number(),
  timestamp: z.number(),
  sequence: z.number(),
  frame_type: MIoTCameraFrameTypeSchema,
  channel: z.number(),
  data: z.instanceof(Buffer),
});
export type MIoTCameraFrameData = z.infer<typeof MIoTCameraFrameDataSchema>;

export const MIoTCameraExtraInfoSchema = z.object({
  channel_count: z.number().default(1),
  name: z.string(),
  vendor: z.string(),
  year: z.optional(z.number()),
});
export type MIoTCameraExtraInfo = z.infer<typeof MIoTCameraExtraInfoSchema>;

export const MIoTCameraInfoSchema = z.object({
  did: z.string(),
  model: z.string(),
  name: z.string(),
  status: MIoTCameraStatusSchema,
  channel_count: z.number().default(1),
  lan_status: z.boolean().default(false),
  local_ip: z.optional(z.string()),
  token: z.string().optional(),
  key: z.string().optional(),
  ip: z.string().optional(),
});
export type MIoTCameraInfo = z.infer<typeof MIoTCameraInfoSchema>;

// ============================================================================
// 局域网设备
// ============================================================================

export const NetworkInfoSchema = z.object({
  if_name: z.string(),
  ip_addresses: z.array(z.string()),
  mac_address: z.string(),
  is_up: z.boolean(),
});
export type NetworkInfo = z.infer<typeof NetworkInfoSchema>;

export const InterfaceStatusSchema = z.enum(["UP", "DOWN", "UNKNOWN"]);
export type InterfaceStatus = z.infer<typeof InterfaceStatusSchema>;

export const MIoTLanDeviceInfoSchema = z.object({
  did: z.string(),
  online: z.boolean(),
  ip: z.optional(z.string()),
});
export type MIoTLanDeviceInfo = z.infer<typeof MIoTLanDeviceInfoSchema>;

// ============================================================================
// Spec 相关
// ============================================================================

export const MIoTSpecTypeLevelSchema = z.enum([
  "UNKNOWN",
  "OPTIONAL",
  "REQUIRED",
  "CUSTOM",
]);
export type MIoTSpecTypeLevel = z.infer<typeof MIoTSpecTypeLevelSchema>;

export const MIoTSpecValueRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number(),
});
export type MIoTSpecValueRange = z.infer<typeof MIoTSpecValueRangeSchema>;

export const MIoTSpecValueListItemSchema = z.object({
  name: z.string(),
  value: z.any(),
  description: z.string(),
});
export type MIoTSpecValueListItem = z.infer<typeof MIoTSpecValueListItemSchema>;

export const MIoTSpecPropertySchema = z.object({
  piid: z.number(),
  type: z.string(),
  description: z.string(),
  format: z.string(),
  access: z.array(z.string()),
  value_range: z.optional(MIoTSpecValueRangeSchema),
  value_list: z.optional(z.array(MIoTSpecValueListItemSchema)),
  unit: z.optional(z.string()),
  expr: z.optional(z.string()),
});
export type MIoTSpecProperty = z.infer<typeof MIoTSpecPropertySchema>;

export const MIoTSpecActionSchema = z.object({
  aiid: z.number(),
  description: z.string(),
  in: z.array(z.any()),
  out: z.array(z.any()),
});
export type MIoTSpecAction = z.infer<typeof MIoTSpecActionSchema>;

export const MIoTSpecEventSchema = z.object({
  eiid: z.number(),
  description: z.string(),
  arguments: z.array(z.any()),
});
export type MIoTSpecEvent = z.infer<typeof MIoTSpecEventSchema>;

export const MIoTSpecServiceSchema = z.object({
  siid: z.number(),
  type: z.string(),
  description: z.string(),
  properties: z.record(z.string(), MIoTSpecPropertySchema).default({}),
  actions: z.record(z.string(), MIoTSpecActionSchema).default({}),
  events: z.record(z.string(), MIoTSpecEventSchema).default({}),
});
export type MIoTSpecService = z.infer<typeof MIoTSpecServiceSchema>;

export const MIoTSpecDeviceSchema = z.object({
  type: z.string(),
  description: z.string(),
  services: z.record(z.string(), MIoTSpecServiceSchema),
});
export type MIoTSpecDevice = z.infer<typeof MIoTSpecDeviceSchema>;

export const MIoTSpecDeviceLiteSchema = z.object({
  type: z.string(),
  description: z.string(),
  services: z.array(MIoTSpecServiceSchema),
});
export type MIoTSpecDeviceLite = z.infer<typeof MIoTSpecDeviceLiteSchema>;

// ============================================================================
// API 参数
// ============================================================================

export const MIoTGetPropertyParamSchema = z.object({
  did: z.string(),
  siid: z.number(),
  piid: z.number(),
});
export type MIoTGetPropertyParam = z.infer<typeof MIoTGetPropertyParamSchema>;

export const MIoTSetPropertyParamSchema = z.object({
  did: z.string(),
  siid: z.number(),
  piid: z.number(),
  value: z.any(),
});
export type MIoTSetPropertyParam = z.infer<typeof MIoTSetPropertyParamSchema>;

export const MIoTActionParamSchema = z.object({
  did: z.string(),
  siid: z.number(),
  aiid: z.number(),
  in: z.array(z.any()).optional(),
});
export type MIoTActionParam = z.infer<typeof MIoTActionParamSchema>;

// ============================================================================
// mDNS 相关
// ============================================================================

export const MdnsServiceStateSchema = z.enum(["ADDED", "REMOVED", "UPDATED"]);
export type MdnsServiceState = z.infer<typeof MdnsServiceStateSchema>;

export const MipsServiceDataSchema = z.object({
  profile: z.string(),
  profile_bin: z.instanceof(Buffer),
  name: z.string(),
  addresses: z.array(z.string()),
  port: z.number(),
  type: z.string(),
  server: z.string(),
  did: z.string(),
  group_id: z.string(),
  role: z.number(),
  suite_mqtt: z.boolean(),
});
export type MipsServiceData = z.infer<typeof MipsServiceDataSchema>;

// ============================================================================
// 场景和自动化
// ============================================================================

export const MIoTManualSceneInfoSchema = z.object({
  scene_id: z.string(),
  scene_name: z.string(),
  icon: z.string(),
  enabled: z.boolean(),
});
export type MIoTManualSceneInfo = z.infer<typeof MIoTManualSceneInfoSchema>;

export const MIoTAppNotifySchema = z.object({
  content: z.string(),
});
export type MIoTAppNotify = z.infer<typeof MIoTAppNotifySchema>;

// ============================================================================
// Home Assistant 相关 (可选)
// ============================================================================

export const HAStateInfoSchema = z.object({
  entity_id: z.string(),
  state: z.string(),
  attributes: z.record(z.any()),
  last_changed: z.string(),
  last_updated: z.string(),
});
export type HAStateInfo = z.infer<typeof HAStateInfoSchema>;

export const HAAutomationInfoSchema = z.object({
  automation_id: z.string(),
  alias: z.string(),
  description: z.string(),
});
export type HAAutomationInfo = z.infer<typeof HAAutomationInfoSchema>;

// ============================================================================
// 配置类型
// ============================================================================

export const CameraExtraInfoSchema = z.object({
  channel_count: z.number().optional(),
  name: z.string(),
  vendor: z.string(),
  year: z.number().optional(),
});

export const CameraExtraInfoConfigSchema = z.object({
  allow_classes: z.array(z.string()),
  extra_info: z.record(z.string(), CameraExtraInfoSchema),
  allowlist: z.record(z.string(), z.record(z.string(), CameraExtraInfoSchema)),
  denylist: z.record(
    z.string(),
    z.record(
      z.string(),
      CameraExtraInfoSchema.and(z.object({ reason: z.string() })),
    ),
  ),
});
export type CameraExtraInfoConfig = z.infer<typeof CameraExtraInfoConfigSchema>;

export const SpecFilterSchema = z.object({
  properties: z.array(z.string()).optional(),
  services: z.array(z.string()).optional(),
  events: z.array(z.string()).optional(),
});
export type SpecFilter = z.infer<typeof SpecFilterSchema>;

export const SpecModifyPropertySchema = z.object({
  name: z.string().optional(),
  access: z.array(z.string()).optional(),
  icon: z.string().optional(),
  unit: z.string().optional(),
  expr: z.string().optional(),
});
export type SpecModifyProperty = z.infer<typeof SpecModifyPropertySchema>;

// ============================================================================
// 导出所有类型
// ============================================================================

export * from "./types";
