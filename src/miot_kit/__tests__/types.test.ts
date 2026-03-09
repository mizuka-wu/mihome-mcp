/**
 * Types Module Tests
 * 类型定义模块测试
 */

import { describe, it, expect } from "vitest";
import {
  CloudServerSchema,
  SystemLanguageSchema,
  MIoTDeviceInfoSchema,
  MIoTSpecDeviceSchema,
  MIoTOauthInfoSchema,
  MIoTCameraVideoQualitySchema,
  MIoTCameraStatusSchema,
  MIoTManualSceneInfoSchema,
} from "../types";

describe("Types Module", () => {
  describe("CloudServerSchema", () => {
    it("should validate valid cloud servers", () => {
      const validServers = ["cn", "de", "i2", "ru", "sg", "us"];
      validServers.forEach((server) => {
        expect(CloudServerSchema.safeParse(server).success).toBe(true);
      });
    });

    it("should reject invalid cloud servers", () => {
      expect(CloudServerSchema.safeParse("invalid").success).toBe(false);
      expect(CloudServerSchema.safeParse("").success).toBe(false);
      expect(CloudServerSchema.safeParse(null).success).toBe(false);
    });
  });

  describe("SystemLanguageSchema", () => {
    it("should validate valid system languages", () => {
      const validLanguages = [
        "de",
        "en",
        "es",
        "fr",
        "it",
        "ja",
        "ru",
        "zh-Hans",
        "zh-Hant",
      ];
      validLanguages.forEach((lang) => {
        expect(SystemLanguageSchema.safeParse(lang).success).toBe(true);
      });
    });

    it("should reject invalid system languages", () => {
      expect(SystemLanguageSchema.safeParse("invalid").success).toBe(false);
      expect(SystemLanguageSchema.safeParse("").success).toBe(false);
    });
  });

  describe("MIoTOauthInfoSchema", () => {
    it("should validate valid OAuth info", () => {
      const validOAuth = {
        access_token: "test_access_token",
        refresh_token: "test_refresh_token",
        expires_ts: 1234567890,
        user_info: {
          uid: "123456",
          nickname: "TestUser",
          icon: "https://example.com/icon.png",
          union_id: "union123",
        },
      };
      expect(MIoTOauthInfoSchema.safeParse(validOAuth).success).toBe(true);
    });

    it("should reject invalid OAuth info", () => {
      const invalidOAuth = {
        access_token: "",
        refresh_token: "",
        expires_ts: "invalid",
      };
      expect(MIoTOauthInfoSchema.safeParse(invalidOAuth).success).toBe(false);
    });

    it("should work without optional user_info", () => {
      const oauthWithoutUserInfo = {
        access_token: "test_token",
        refresh_token: "test_refresh",
        expires_ts: 1234567890,
      };
      expect(MIoTOauthInfoSchema.safeParse(oauthWithoutUserInfo).success).toBe(
        true,
      );
    });
  });

  describe("MIoTDeviceInfoSchema", () => {
    it("should validate valid device info", () => {
      const validDevice = {
        did: "123456789",
        name: "Test Device",
        uid: "123456",
        urn: "urn:miot-spec-v2:device:light:0000A001:",
        model: "xiaomi.light.bulb1",
        manufacturer: "Xiaomi",
        connect_type: 0,
        pid: 0,
        token: "abc123",
        online: true,
        voice_ctrl: 0,
        order_time: 1234567890,
      };
      expect(MIoTDeviceInfoSchema.safeParse(validDevice).success).toBe(true);
    });

    it("should validate device with sub_devices", () => {
      const deviceWithSub = {
        did: "123456789",
        name: "Parent Device",
        uid: "123456",
        urn: "urn:miot-spec-v2:device:gateway:",
        model: "xiaomi.gateway.v3",
        manufacturer: "Xiaomi",
        connect_type: 0,
        pid: 0,
        token: "abc123",
        online: true,
        voice_ctrl: 0,
        order_time: 1234567890,
        sub_devices: {
          sub1: {
            did: "sub1",
            name: "Sub Device",
            uid: "123456",
            urn: "urn:miot-spec-v2:device:sensor:",
            model: "xiaomi.sensor.temp",
            manufacturer: "Xiaomi",
            connect_type: 0,
            pid: 0,
            token: "def456",
            online: true,
            voice_ctrl: 0,
            order_time: 1234567890,
          },
        },
      };
      expect(MIoTDeviceInfoSchema.safeParse(deviceWithSub).success).toBe(true);
    });
  });

  describe("MIoTSpecDeviceSchema", () => {
    it("should validate valid spec device", () => {
      const validSpec = {
        type: "urn:miot-spec-v2:device:light:0000A001",
        description: "Light",
        services: {
          "1": {
            siid: 1,
            type: "urn:miot-spec-v2:service:light:00007802",
            description: "Light",
            properties: {},
            actions: {},
            events: {},
          },
        },
      };
      expect(MIoTSpecDeviceSchema.safeParse(validSpec).success).toBe(true);
    });
  });

  describe("MIoTCameraVideoQualitySchema", () => {
    it("should validate valid video qualities", () => {
      expect(MIoTCameraVideoQualitySchema.safeParse("LOW").success).toBe(true);
      expect(MIoTCameraVideoQualitySchema.safeParse("HIGH").success).toBe(true);
    });

    it("should reject invalid video qualities", () => {
      expect(MIoTCameraVideoQualitySchema.safeParse("INVALID").success).toBe(
        false,
      );
    });
  });

  describe("MIoTCameraStatusSchema", () => {
    it("should validate valid camera statuses", () => {
      const validStatuses = [
        "DISCONNECTED",
        "CONNECTING",
        "RE_CONNECTING",
        "CONNECTED",
        "ERROR",
      ];
      validStatuses.forEach((status) => {
        expect(MIoTCameraStatusSchema.safeParse(status).success).toBe(true);
      });
    });
  });

  describe("MIoTManualSceneInfoSchema", () => {
    it("should validate valid manual scene info", () => {
      const validScene = {
        scene_id: "scene123",
        scene_name: "Test Scene",
        icon: "https://example.com/icon.png",
        enabled: true,
      };
      expect(MIoTManualSceneInfoSchema.safeParse(validScene).success).toBe(
        true,
      );
    });
  });
});
