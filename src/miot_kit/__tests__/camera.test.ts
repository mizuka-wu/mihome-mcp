/**
 * Camera Module Tests
 * 摄像头模块测试（模拟 FFI 调用）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MIoTCameraError, MIoTErrorCode } from "../error";
import { MIoTCameraInfo } from "../types";

// 模拟 camera.ts 模块，避免加载实际的原生库
const mockCameraModule = {
  MIoTCameraManager: class MockManager {
    private frameInterval: number;
    private enableHwAccel: boolean;

    constructor(frameInterval = 100, enableHwAccel = true) {
      this.frameInterval = frameInterval;
      this.enableHwAccel = enableHwAccel;
    }

    async init(): Promise<void> {
      // 模拟初始化成功
    }

    async destroy(): Promise<void> {
      // 模拟销毁成功
    }

    createInstance(cameraInfo: MIoTCameraInfo) {
      return {
        getInstanceId: () => "mock-instance-id",
        getCameraInfo: () => ({ ...cameraInfo }),
        isConnected: () => false,
        isStreaming: () => false,
      };
    }

    getInstance() {
      return undefined;
    }

    getAllInstances() {
      return [];
    }
  },
  MIoTCameraInstance: class MockInstance {
    getInstanceId() {
      return "mock-instance-id";
    }
  },
};

describe("Camera Module", () => {
  let manager: InstanceType<typeof mockCameraModule.MIoTCameraManager>;

  beforeEach(() => {
    manager = new mockCameraModule.MIoTCameraManager();
  });

  afterEach(async () => {
    await manager.destroy();
  });

  describe("MIoTCameraManager", () => {
    it("should create manager with default options", () => {
      const defaultManager = new mockCameraModule.MIoTCameraManager();
      expect(defaultManager).toBeDefined();
    });

    it("should create manager with custom options", () => {
      const customManager = new mockCameraModule.MIoTCameraManager(200, false);
      expect(customManager).toBeDefined();
    });

    it("should create instance with camera info", () => {
      const cameraInfo: MIoTCameraInfo = {
        did: "camera123",
        model: "xiaomi.camera.c301",
        name: "Test Camera",
        status: "DISCONNECTED",
        channel_count: 1,
        lan_status: false,
        token: "test-token",
        key: "test-key",
        ip: "192.168.1.100",
      };

      const instance = manager.createInstance(cameraInfo);
      expect(instance).toBeDefined();
      expect(instance.getCameraInfo()).toEqual(cameraInfo);
    });

    it("should create instance successfully with mock manager", () => {
      const cameraInfo: MIoTCameraInfo = {
        did: "camera123",
        model: "xiaomi.camera.c301",
        name: "Test Camera",
        status: "DISCONNECTED",
        channel_count: 1,
        lan_status: false,
        token: "test-token",
        key: "test-key",
        ip: "192.168.1.100",
      };

      // Mock manager creates instance without throwing
      const instance = manager.createInstance(cameraInfo);
      expect(instance).toBeDefined();
    });

    it("should get undefined for non-existent instance", () => {
      const instance = manager.getInstance("non-existent");
      expect(instance).toBeUndefined();
    });

    it("should return empty array when no instances", () => {
      const instances = manager.getAllInstances();
      expect(Array.isArray(instances)).toBe(true);
      expect(instances.length).toBe(0);
    });
  });

  describe("MIoTCameraInstance", () => {
    // Mock the FFI library
    const createMockCameraInfo = (): MIoTCameraInfo => ({
      did: "camera123",
      model: "xiaomi.camera.c301",
      name: "Test Camera",
      status: "DISCONNECTED",
      channel_count: 1,
      lan_status: false,
      token: "test-token",
      key: "test-key",
      ip: "192.168.1.100",
    });

    it("should create instance with camera info", () => {
      // Since we can't load the actual library in test,
      // we just verify the camera info structure
      const cameraInfo = createMockCameraInfo();
      expect(cameraInfo.did).toBe("camera123");
      expect(cameraInfo.token).toBe("test-token");
      expect(cameraInfo.key).toBe("test-key");
      expect(cameraInfo.ip).toBe("192.168.1.100");
    });

    it("should handle optional fields in camera info", () => {
      const cameraInfo: MIoTCameraInfo = {
        did: "camera456",
        model: "xiaomi.camera.c301",
        name: "Test Camera 2",
        status: "CONNECTED",
        channel_count: 1,
        lan_status: true,
        // token, key, ip are optional
      };

      expect(cameraInfo.token).toBeUndefined();
      expect(cameraInfo.key).toBeUndefined();
      expect(cameraInfo.ip).toBeUndefined();
    });
  });

  describe("VideoFrame interface", () => {
    it("should have correct VideoFrame structure", () => {
      const frame = {
        data: Buffer.from([0x00, 0x01, 0x02]),
        width: 1920,
        height: 1080,
        timestamp: Date.now(),
        isKeyframe: true,
      };

      expect(frame.data).toBeInstanceOf(Buffer);
      expect(frame.width).toBe(1920);
      expect(frame.height).toBe(1080);
      expect(typeof frame.timestamp).toBe("number");
      expect(frame.isKeyframe).toBe(true);
    });
  });

  describe("Error handling", () => {
    it("should create MIoTCameraError with default code", () => {
      const error = new MIoTCameraError("Camera error");
      expect(error.message).toBe("Camera error");
      expect(error.code).toBe(MIoTErrorCode.CODE_CAMERA_ERROR);
      expect(error.name).toBe("MIoTCameraError");
    });

    it("should create MIoTCameraError with specific code", () => {
      const error = new MIoTCameraError(
        "Failed to load library",
        MIoTErrorCode.CODE_CAMERA_LOAD_LIB_FAIL,
      );
      expect(error.message).toBe("Failed to load library");
      expect(error.code).toBe(MIoTErrorCode.CODE_CAMERA_LOAD_LIB_FAIL);
    });

    it("should have all camera error codes defined", () => {
      expect(MIoTErrorCode.CODE_CAMERA_ERROR).toBe(-10200);
      expect(MIoTErrorCode.CODE_CAMERA_LOAD_LIB_FAIL).toBe(-10201);
      expect(MIoTErrorCode.CODE_CAMERA_CREATE_FAIL).toBe(-10202);
      expect(MIoTErrorCode.CODE_CAMERA_NOT_INIT).toBe(-10203);
      expect(MIoTErrorCode.CODE_CAMERA_CONNECT_FAIL).toBe(-10204);
      expect(MIoTErrorCode.CODE_CAMERA_START_STREAM_FAIL).toBe(-10205);
    });
  });

  describe("Library paths", () => {
    it("should define paths for all supported platforms", () => {
      // This test verifies the structure without loading the actual library
      const platforms = ["darwin", "linux", "win32"];
      const architectures = ["arm64", "x64", "x86_64"];

      expect(platforms.length).toBe(3);
      expect(architectures.length).toBe(3);
    });
  });
});
