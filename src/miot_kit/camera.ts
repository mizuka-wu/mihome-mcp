/**
 * MIoT Camera Module
 * 摄像头模块，通过 koffi FFI 调用 libmiot_camera_lite 实现 P2P 视频流
 */

import { join } from "path";
import { platform, arch } from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { MIoTCameraError, MIoTErrorCode } from "./error";
import { MIoTCameraInfo, MIoTCameraVideoQuality } from "./types";

let koffi: any = null;
try {
  koffi = require("koffi");
} catch {
  // koffi not available, will use mock implementation
}

// ============================================================================
// 类型定义
// ============================================================================

interface LibPaths {
  darwin: {
    arm64: string;
    x64: string;
  };
  linux: {
    arm64: string;
    x64: string;
  };
  win32: {
    x64: string;
  };
}

interface VideoFrame {
  data: Buffer;
  width: number;
  height: number;
  timestamp: number;
  isKeyframe: boolean;
}

interface NativeLibInterface {
  miot_camera_new(did: string, token: string, key: string, ip: string): number;
  miot_camera_free(handle: number): void;
  miot_camera_connect(handle: number, ip: string, timeout: number): number;
  miot_camera_disconnect(handle: number): number;
  miot_camera_start_video(handle: number, hwAccel: number): number;
  miot_camera_stop_video(handle: number): number;
  miot_camera_start_audio(handle: number): number;
  miot_camera_stop_audio(handle: number): number;
  miot_camera_get_status(handle: number): number;
  miot_camera_is_connected(handle: number): boolean;
  miot_camera_set_quality(handle: number, quality: number): number;
  miot_camera_set_frame_interval(handle: number, interval: number): number;
  miot_camera_get_frame(
    handle: number,
    buffer: Buffer,
    metadata: number,
    widthPtr: Buffer,
    heightPtr: Buffer,
    timestampPtr: Buffer,
  ): number;
}

let nativeLib: NativeLibInterface | null = null;

function ensureNativeLib(): NativeLibInterface {
  if (nativeLib) return nativeLib;

  const libPath = getLibPath();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const fullPath = join(__dirname, libPath);

  try {
    nativeLib = loadNativeLibrary(fullPath);
    return nativeLib;
  } catch (error) {
    throw new MIoTCameraError(
      `Failed to load native library from ${fullPath}: ${error instanceof Error ? error.message : String(error)}`,
      MIoTErrorCode.CODE_CAMERA_LOAD_LIB_FAIL,
    );
  }
}

function loadNativeLibrary(libPath: string): NativeLibInterface {
  // TODO: 实现实际的 FFI 加载
  // 当前使用模拟实现以避免依赖问题
  // 要启用真实 dylib 调用，可以使用：
  // - koffi: https://github.com/Koromix/koffi
  // - ffi-napi: https://github.com/node-ffi-napi/node-ffi-napi

  return {
    miot_camera_new: () => 1,
    miot_camera_free: () => {},
    miot_camera_connect: () => 0,
    miot_camera_disconnect: () => 0,
    miot_camera_start_video: () => 0,
    miot_camera_stop_video: () => 0,
    miot_camera_start_audio: () => 0,
    miot_camera_stop_audio: () => 0,
    miot_camera_get_status: () => 0,
    miot_camera_is_connected: () => false,
    miot_camera_set_quality: () => 0,
    miot_camera_set_frame_interval: () => 0,
    miot_camera_get_frame: () => 0,
  };
}

// ============================================================================
// 动态库路径配置
// ============================================================================

const LIB_PATHS: LibPaths = {
  darwin: {
    arm64: "libs/darwin/arm64/libmiot_camera_lite.dylib",
    x64: "libs/darwin/x86_64/libmiot_camera_lite.dylib",
  },
  linux: {
    arm64: "libs/linux/arm64/libmiot_camera_lite.so",
    x64: "libs/linux/x86_64/libmiot_camera_lite.so",
  },
  win32: {
    x64: "libs/win32/x64/libmiot_camera_lite.dll",
  },
};

// ============================================================================
// 动态库加载
// ============================================================================

function getLibPath(): string {
  const currentPlatform = platform() as keyof LibPaths;
  const currentArch = arch();

  if (currentPlatform === "darwin") {
    return currentArch === "arm64"
      ? LIB_PATHS.darwin.arm64
      : LIB_PATHS.darwin.x64;
  }
  if (currentPlatform === "linux") {
    return currentArch === "arm64"
      ? LIB_PATHS.linux.arm64
      : LIB_PATHS.linux.x64;
  }
  if (currentPlatform === "win32") {
    return LIB_PATHS.win32.x64;
  }

  throw new MIoTCameraError(
    `Unsupported platform: ${currentPlatform}-${currentArch}`,
  );
}

// ============================================================================
// 摄像头管理器
// ============================================================================

export class MIoTCameraManager {
  private lib: NativeLibInterface | null = null;
  private instances: Map<string, MIoTCameraInstance> = new Map();
  private frameInterval: number;
  private enableHwAccel: boolean;

  constructor(frameInterval: number = 100, enableHwAccel: boolean = true) {
    this.frameInterval = frameInterval;
    this.enableHwAccel = enableHwAccel;
  }

  async init(): Promise<void> {
    try {
      this.lib = ensureNativeLib();
    } catch (error) {
      throw new MIoTCameraError(
        `Failed to load camera library: ${error instanceof Error ? error.message : String(error)}`,
        MIoTErrorCode.CODE_CAMERA_LOAD_LIB_FAIL,
      );
    }
  }

  async destroy(): Promise<void> {
    for (const instance of this.instances.values()) {
      await instance.destroy();
    }
    this.instances.clear();
    this.lib = null;
  }

  createInstance(
    cameraInfo: MIoTCameraInfo,
    mainLoop?: unknown,
  ): MIoTCameraInstance {
    if (!this.lib) {
      throw new MIoTCameraError(
        "Camera library not initialized",
        MIoTErrorCode.CODE_CAMERA_LOAD_LIB_FAIL,
      );
    }

    const instanceId = `${cameraInfo.did}_${Date.now()}`;
    const instance = new MIoTCameraInstance(
      this.lib,
      this.frameInterval,
      this.enableHwAccel,
      cameraInfo,
      instanceId,
    );

    this.instances.set(instanceId, instance);
    return instance;
  }

  getInstance(instanceId: string): MIoTCameraInstance | undefined {
    return this.instances.get(instanceId);
  }

  removeInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.destroy().catch(() => {
        // Ignore cleanup errors
      });
      this.instances.delete(instanceId);
    }
  }

  getAllInstances(): MIoTCameraInstance[] {
    return Array.from(this.instances.values());
  }
}

// ============================================================================
// 摄像头实例
// ============================================================================

export class MIoTCameraInstance {
  private lib: NativeLibInterface;
  private cInstance: number | null = null;
  private frameInterval: number;
  private enableHwAccel: boolean;
  private cameraInfo: MIoTCameraInfo;
  private instanceId: string;
  private connected: boolean = false;
  private streaming: boolean = false;
  private frameBuffer: VideoFrame[] = [];
  private onFrameCallbacks: Array<(frame: VideoFrame) => void> = [];
  private frameLoopId: NodeJS.Timeout | null = null;

  constructor(
    lib: NativeLibInterface,
    frameInterval: number,
    enableHwAccel: boolean,
    cameraInfo: MIoTCameraInfo,
    instanceId: string,
  ) {
    this.lib = lib;
    this.frameInterval = frameInterval;
    this.enableHwAccel = enableHwAccel;
    this.cameraInfo = cameraInfo;
    this.instanceId = instanceId;

    try {
      this.cInstance = lib.miot_camera_new(
        cameraInfo.did,
        cameraInfo.token || "",
        cameraInfo.key || "",
        cameraInfo.ip || "",
      );

      if (!this.cInstance || this.cInstance === 0) {
        throw new MIoTCameraError(
          "Failed to create camera instance",
          MIoTErrorCode.CODE_CAMERA_CREATE_FAIL,
        );
      }
    } catch (error) {
      throw new MIoTCameraError(
        `Failed to create camera instance: ${error instanceof Error ? error.message : String(error)}`,
        MIoTErrorCode.CODE_CAMERA_CREATE_FAIL,
      );
    }
  }

  async destroy(): Promise<void> {
    this.stopStreaming();
    await this.disconnect();

    if (this.cInstance && this.lib) {
      try {
        this.lib.miot_camera_free(this.cInstance);
      } catch {
        // Ignore cleanup errors
      }
      this.cInstance = null;
    }
  }

  async connect(timeout: number = 30000): Promise<void> {
    if (!this.cInstance || !this.lib) {
      throw new MIoTCameraError(
        "Camera instance not initialized",
        MIoTErrorCode.CODE_CAMERA_NOT_INIT,
      );
    }

    try {
      const result = this.lib.miot_camera_connect(
        this.cInstance,
        this.cameraInfo.ip || "",
        timeout,
      );

      if (result !== 0) {
        throw new MIoTCameraError(
          `Failed to connect to camera: ${result}`,
          MIoTErrorCode.CODE_CAMERA_CONNECT_FAIL,
        );
      }

      this.connected = true;
    } catch (error) {
      if (error instanceof MIoTCameraError) throw error;
      throw new MIoTCameraError(
        `Failed to connect to camera: ${error instanceof Error ? error.message : String(error)}`,
        MIoTErrorCode.CODE_CAMERA_CONNECT_FAIL,
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.cInstance && this.lib && this.connected) {
      try {
        this.lib.miot_camera_disconnect(this.cInstance);
      } catch {
        // Ignore disconnect errors
      }
      this.connected = false;
    }
  }

  isConnected(): boolean {
    if (!this.cInstance || !this.lib) return false;
    try {
      return this.lib.miot_camera_is_connected(this.cInstance);
    } catch {
      return false;
    }
  }

  getStatus(): number {
    if (!this.cInstance || !this.lib) return -1;
    try {
      return this.lib.miot_camera_get_status(this.cInstance);
    } catch {
      return -1;
    }
  }

  setQuality(quality: MIoTVideoQuality): void {
    if (!this.cInstance || !this.lib) return;

    try {
      const qualityValue = quality === "HIGH" ? 1 : 0;
      this.lib.miot_camera_set_quality(this.cInstance, qualityValue);
    } catch {
      // Ignore quality setting errors
    }
  }

  startStreaming(): void {
    if (!this.cInstance || !this.lib || !this.connected) {
      throw new MIoTCameraError(
        "Camera not connected",
        MIoTErrorCode.CODE_CAMERA_NOT_INIT,
      );
    }

    try {
      const result = this.lib.miot_camera_start_video(
        this.cInstance,
        this.enableHwAccel ? 1 : 0,
      );

      if (result !== 0) {
        throw new MIoTCameraError(
          `Failed to start video streaming: ${result}`,
          MIoTErrorCode.CODE_CAMERA_START_STREAM_FAIL,
        );
      }

      this.streaming = true;
      this.startFrameLoop();
    } catch (error) {
      if (error instanceof MIoTCameraError) throw error;
      throw new MIoTCameraError(
        `Failed to start video streaming: ${error instanceof Error ? error.message : String(error)}`,
        MIoTErrorCode.CODE_CAMERA_START_STREAM_FAIL,
      );
    }
  }

  stopStreaming(): void {
    if (this.frameLoopId) {
      clearInterval(this.frameLoopId);
      this.frameLoopId = null;
    }

    if (this.cInstance && this.lib && this.streaming) {
      try {
        this.lib.miot_camera_stop_video(this.cInstance);
      } catch {
        // Ignore stop video errors
      }
      this.streaming = false;
    }
  }

  isStreaming(): boolean {
    return this.streaming;
  }

  onFrame(callback: (frame: VideoFrame) => void): void {
    this.onFrameCallbacks.push(callback);
  }

  offFrame(callback: (frame: VideoFrame) => void): void {
    const index = this.onFrameCallbacks.indexOf(callback);
    if (index > -1) {
      this.onFrameCallbacks.splice(index, 1);
    }
  }

  private startFrameLoop(): void {
    this.frameLoopId = setInterval(() => {
      this.captureFrame();
    }, this.frameInterval);
  }

  private captureFrame(): void {
    if (!this.cInstance || !this.lib || !this.streaming) return;

    try {
      // 分配缓冲区
      const bufferSize = 1024 * 1024; // 1MB 缓冲区
      const frameBuffer = Buffer.alloc(bufferSize);
      const widthBuffer = Buffer.alloc(4); // int32
      const heightBuffer = Buffer.alloc(4); // int32
      const timestampBuffer = Buffer.alloc(8); // int64

      const result = this.lib.miot_camera_get_frame(
        this.cInstance,
        frameBuffer,
        0, // 可选的元数据
        widthBuffer,
        heightBuffer,
        timestampBuffer,
      );

      if (result === 0) {
        const width = widthBuffer.readInt32LE(0);
        const height = heightBuffer.readInt32LE(0);
        const timestamp = Number(timestampBuffer.readBigInt64LE(0));

        if (width > 0 && height > 0) {
          const frame: VideoFrame = {
            data: frameBuffer.slice(0, (width * height * 3) / 2), // YUV420 格式
            width,
            height,
            timestamp,
            isKeyframe: true,
          };

          // 通知所有回调
          this.onFrameCallbacks.forEach((cb) => {
            try {
              cb(frame);
            } catch {
              // Ignore callback errors
            }
          });
        }
      }
    } catch (error) {
      // Ignore frame capture errors
    }
  }

  getLatestFrame(): VideoFrame | null {
    return this.frameBuffer[this.frameBuffer.length - 1] || null;
  }

  getCameraInfo(): MIoTCameraInfo {
    return { ...this.cameraInfo };
  }

  getInstanceId(): string {
    return this.instanceId;
  }
}

// ============================================================================
// 导出类型
// ============================================================================

type MIoTVideoQuality = "LOW" | "HIGH";

export type { VideoFrame, MIoTVideoQuality };
