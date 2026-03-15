/**
 * MIoT Camera Module
 * 摄像头模块，通过 FFI 调用 libmiot_camera_lite 实现 P2P 视频流
 */

import { createRequire } from "module";
import { promises as fs } from "fs";
import { join } from "path";
import { platform, arch } from "os";
import { MIoTCameraError, MIoTErrorCode } from "./error";
import { MIoTCameraInfo, MIoTCameraVideoQuality } from "./types";

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

type FfiModule = {
  Library: (
    libPath: string,
    functions: Record<string, [string, string[]]>,
  ) => any;
};

type RefModule = {
  alloc: (type: string, value?: unknown) => Buffer;
  refType: (type: string) => string;
  NULL: Buffer;
};

let ffi: FfiModule | null = null;
let ref: RefModule | null = null;

function ensureNativeDeps(): { ffi: FfiModule; ref: RefModule } {
  if (ffi && ref) return { ffi, ref };

  const require = createRequire(import.meta.url);
  const ffiName = "ffi-napi";
  const refName = "ref-napi";

  // Use non-literal require targets to reduce bundler static detection.
  ffi = require(ffiName) as FfiModule;
  ref = require(refName) as RefModule;

  return { ffi, ref };
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

function loadLibrary(): any {
  const { ffi, ref } = ensureNativeDeps();
  const libPath = getLibPath();
  const fullPath = join(__dirname, libPath);

  // 定义 FFI 接口
  return ffi.Library(fullPath, {
    // 创建/销毁实例
    miot_camera_new: ["pointer", ["string", "string", "string", "string"]],
    miot_camera_free: ["void", ["pointer"]],

    // 连接/断开
    miot_camera_connect: ["int", ["pointer", "string", "int"]],
    miot_camera_disconnect: ["int", ["pointer"]],

    // 视频控制
    miot_camera_start_video: ["int", ["pointer", "int"]],
    miot_camera_stop_video: ["int", ["pointer"]],

    // 获取视频帧
    miot_camera_get_frame: [
      "int",
      [
        "pointer",
        "pointer",
        "pointer",
        ref.refType("int"),
        ref.refType("int"),
        ref.refType("long"),
      ],
    ],

    // 音频控制
    miot_camera_start_audio: ["int", ["pointer"]],
    miot_camera_stop_audio: ["int", ["pointer"]],

    // 状态获取
    miot_camera_get_status: ["int", ["pointer"]],
    miot_camera_is_connected: ["bool", ["pointer"]],

    // 配置
    miot_camera_set_quality: ["int", ["pointer", "int"]],
    miot_camera_set_frame_interval: ["int", ["pointer", "int"]],
  });
}

// ============================================================================
// 摄像头管理器
// ============================================================================

export class MIoTCameraManager {
  private lib: any | null = null;
  private instances: Map<string, MIoTCameraInstance> = new Map();
  private frameInterval: number;
  private enableHwAccel: boolean;

  constructor(frameInterval: number = 100, enableHwAccel: boolean = true) {
    this.frameInterval = frameInterval;
    this.enableHwAccel = enableHwAccel;
  }

  async init(): Promise<void> {
    try {
      this.lib = loadLibrary();
    } catch (error) {
      throw new MIoTCameraError(
        `Failed to load camera library: ${error instanceof Error ? error.message : String(error)}`,
        MIoTErrorCode.CODE_CAMERA_LOAD_LIB_FAIL,
      );
    }
  }

  async destroy(): Promise<void> {
    // 销毁所有实例
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
  private lib: any;
  private cInstance: Buffer | null = null;
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
    lib: any,
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

    // 创建 C 实例
    this.cInstance = lib.miot_camera_new(
      cameraInfo.did,
      cameraInfo.token || "",
      cameraInfo.key || "",
      cameraInfo.ip || "",
    );

    if (!this.cInstance) {
      throw new MIoTCameraError(
        "Failed to create camera instance",
        MIoTErrorCode.CODE_CAMERA_CREATE_FAIL,
      );
    }
  }

  async destroy(): Promise<void> {
    this.stopStreaming();
    await this.disconnect();

    if (this.cInstance && this.lib) {
      this.lib.miot_camera_free(this.cInstance);
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
  }

  async disconnect(): Promise<void> {
    if (this.cInstance && this.lib && this.connected) {
      this.lib.miot_camera_disconnect(this.cInstance);
      this.connected = false;
    }
  }

  isConnected(): boolean {
    if (!this.cInstance || !this.lib) return false;
    return this.lib.miot_camera_is_connected(this.cInstance);
  }

  getStatus(): number {
    if (!this.cInstance || !this.lib) return -1;
    return this.lib.miot_camera_get_status(this.cInstance);
  }

  setQuality(quality: MIoTVideoQuality): void {
    if (!this.cInstance || !this.lib) return;

    const qualityValue = quality === "HIGH" ? 1 : 0;
    this.lib.miot_camera_set_quality(this.cInstance, qualityValue);
  }

  startStreaming(): void {
    if (!this.cInstance || !this.lib || !this.connected) {
      throw new MIoTCameraError(
        "Camera not connected",
        MIoTErrorCode.CODE_CAMERA_NOT_INIT,
      );
    }

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
  }

  stopStreaming(): void {
    if (this.frameLoopId) {
      clearInterval(this.frameLoopId);
      this.frameLoopId = null;
    }

    if (this.cInstance && this.lib && this.streaming) {
      this.lib.miot_camera_stop_video(this.cInstance);
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

    const { ref } = ensureNativeDeps();

    // 分配缓冲区
    const bufferSize = 1024 * 1024; // 1MB 缓冲区
    const frameBuffer = Buffer.alloc(bufferSize);
    const widthRef = ref.alloc("int");
    const heightRef = ref.alloc("int");
    const timestampRef = ref.alloc("long");

    const result = this.lib.miot_camera_get_frame(
      this.cInstance,
      frameBuffer,
      ref.NULL, // 可选的元数据
      widthRef,
      heightRef,
      timestampRef,
    );

    if (result === 0) {
      const width = (widthRef as unknown as { deref(): number }).deref();
      const height = (heightRef as unknown as { deref(): number }).deref();
      const timestamp = (
        timestampRef as unknown as { deref(): number }
      ).deref();

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
