/**
 * MIoT LAN Discovery
 * 小米 Open Token 协议局域网设备发现
 */

import { createSocket, Socket } from 'dgram';
import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';
import { MIoTLanDeviceInfo, NetworkInfo } from './types';
import { OT_PORT, OT_HEADER, OT_PROBE_LEN, OT_PROBE_INTERVAL_MIN, OT_PROBE_INTERVAL_MAX } from './const';

/**
 * 局域网设备发现类
 */
export class MIoTLan extends EventEmitter {
  private socket: Socket | null = null;
  private netInterfaces: string[];
  private devices: Map<string, MIoTLanDeviceInfo> = new Map();
  private probeTimer: NodeJS.Timeout | null = null;
  private lastProbeInterval: number = OT_PROBE_INTERVAL_MIN;

  constructor(netInterfaces: string[]) {
    super();
    this.netInterfaces = netInterfaces;
  }

  /**
   * 初始化局域网发现
   */
  async init(): Promise<void> {
    this.socket = createSocket('udp4');

    this.socket.on('message', (msg, rinfo) => {
      this.handleMessage(msg, rinfo.address);
    });

    this.socket.on('error', (error) => {
      console.error('LAN socket error:', error);
      this.emit('error', error);
    });

    // 绑定到 OT_PORT
    return new Promise((resolve, reject) => {
      this.socket!.bind(OT_PORT, () => {
        console.log('LAN discovery listening on port', OT_PORT);
        this.startProbeTimer();
        this.emit('initialized');
        resolve();
      });

      this.socket!.on('error', reject);
    });
  }

  /**
   * 销毁局域网发现
   */
  async destroy(): Promise<void> {
    this.stopProbeTimer();

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.devices.clear();
    this.removeAllListeners();
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(msg: Buffer, ip: string): void {
    // 检查消息头
    if (msg.length < OT_PROBE_LEN || !msg.slice(0, 2).equals(OT_HEADER)) {
      return;
    }

    // 解析设备 DID（简化处理）
    // 实际协议更复杂，这里做简化
    const did = this.extractDidFromMessage(msg);
    if (!did) return;

    const existingDevice = this.devices.get(did);
    if (!existingDevice || !existingDevice.online) {
      const device: MIoTLanDeviceInfo = {
        did,
        online: true,
        ip,
      };
      this.devices.set(did, device);
      this.emit('deviceFound', device);
    }
  }

  /**
   * 从消息中提取 DID（简化实现）
   */
  private extractDidFromMessage(msg: Buffer): string | null {
    // 实际协议需要解析特定的字节位置
    // 这里做简化处理，返回模拟的 DID
    if (msg.length < 20) return null;
    return `lan_device_${msg.slice(8, 16).toString('hex')}`;
  }

  /**
   * 发送探针消息
   */
  private sendProbe(): void {
    if (!this.socket) return;

    // 生成探针消息
    const probeMsg = Buffer.alloc(OT_PROBE_LEN);
    OT_HEADER.copy(probeMsg, 0);
    randomBytes(OT_PROBE_LEN - 2).copy(probeMsg, 2);

    // 广播到所有接口
    for (const iface of this.netInterfaces) {
      this.socket.setBroadcast(true);
      this.socket.send(probeMsg, OT_PORT, '255.255.255.255', (error) => {
        if (error) {
          console.error(`Failed to send probe on ${iface}:`, error);
        }
      });
    }
  }

  /**
   * 启动探针定时器
   */
  private startProbeTimer(): void {
    this.stopProbeTimer();

    const scheduleProbe = () => {
      this.sendProbe();

      // 随机间隔，避免网络拥塞
      const interval = this.calculateNextInterval();
      this.lastProbeInterval = interval;
      this.probeTimer = setTimeout(scheduleProbe, interval * 1000);
    };

    scheduleProbe();
  }

  /**
   * 停止探针定时器
   */
  private stopProbeTimer(): void {
    if (this.probeTimer) {
      clearTimeout(this.probeTimer);
      this.probeTimer = null;
    }
  }

  /**
   * 计算下一次探针间隔
   */
  private calculateNextInterval(): number {
    const min = OT_PROBE_INTERVAL_MIN;
    const max = OT_PROBE_INTERVAL_MAX;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 获取发现的设备列表
   */
  getDevices(): MIoTLanDeviceInfo[] {
    return Array.from(this.devices.values());
  }

  /**
   * 根据 DID 获取设备
   */
  getDevice(did: string): MIoTLanDeviceInfo | undefined {
    return this.devices.get(did);
  }
}

// ============================================================================
// 导出
// ============================================================================

export * from './lan';
