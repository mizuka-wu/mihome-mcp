/**
 * MIoT Network Monitor
 * 网络状态监控工具
 */

import { networkInterfaces } from 'os';
import axios from 'axios';
import { EventEmitter } from 'events';
import { NetworkInfo, InterfaceStatus } from './types';
import { IP_ADDRESS_LIST, URL_ADDRESS_LIST, NETWORK_REFRESH_INTERVAL, NETWORK_DETECT_TIMEOUT } from './const';

/**
 * 网络监控类
 */
export class MIoTNetwork extends EventEmitter {
  private ipAddrList: string[];
  private urlAddrList: string[];
  private refreshInterval: number;
  private networkStatus: boolean = false;
  private networkInfo: Map<string, NetworkInfo> = new Map();
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(
    ipAddrList: string[] = IP_ADDRESS_LIST,
    urlAddrList: string[] = URL_ADDRESS_LIST,
    refreshInterval: number = NETWORK_REFRESH_INTERVAL
  ) {
    super();
    this.ipAddrList = ipAddrList;
    this.urlAddrList = urlAddrList;
    this.refreshInterval = refreshInterval;
  }

  /**
   * 初始化网络监控
   */
  async init(): Promise<void> {
    await this.refreshNetworkInfo();
    this.startRefreshTimer();
    this.emit('initialized');
  }

  /**
   * 销毁网络监控
   */
  async destroy(): Promise<void> {
    this.stopRefreshTimer();
    this.removeAllListeners();
  }

  /**
   * 获取网络状态
   */
  getNetworkStatus(): boolean {
    return this.networkStatus;
  }

  /**
   * 获取网络信息
   */
  getNetworkInfo(): Record<string, NetworkInfo> {
    return Object.fromEntries(this.networkInfo);
  }

  /**
   * 刷新网络信息
   */
  private async refreshNetworkInfo(): Promise<void> {
    const interfaces = networkInterfaces();
    const newNetworkInfo: Map<string, NetworkInfo> = new Map();

    for (const [ifName, addrs] of Object.entries(interfaces)) {
      if (!addrs || addrs.length === 0) continue;

      // 跳过本地回环和虚拟接口
      if (ifName.startsWith('lo') || ifName.startsWith('docker')) continue;

      const ipv4Addrs = addrs
        .filter((addr) => addr.family === 'IPv4' && !addr.internal)
        .map((addr) => addr.address);

      if (ipv4Addrs.length === 0) continue;

      const macAddr = addrs.find((addr) => addr.mac)?.mac || '';

      newNetworkInfo.set(ifName, {
        if_name: ifName,
        ip_addresses: ipv4Addrs,
        mac_address: macAddr,
        is_up: true,
      });
    }

    this.networkInfo = newNetworkInfo;

    // 检测网络连通性
    const wasOnline = this.networkStatus;
    this.networkStatus = await this.checkNetworkConnectivity();

    if (wasOnline !== this.networkStatus) {
      this.emit('statusChanged', this.networkStatus);
    }

    this.emit('infoRefreshed', this.getNetworkInfo());
  }

  /**
   * 检测网络连通性
   */
  private async checkNetworkConnectivity(): Promise<boolean> {
    // 尝试 ping IP 地址
    for (const ip of this.ipAddrList) {
      try {
        // 使用 TCP 连接测试（ICMP 需要 root 权限）
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), NETWORK_DETECT_TIMEOUT * 1000);

        await axios.get(`http://${ip}`, {
          signal: controller.signal,
          timeout: NETWORK_DETECT_TIMEOUT * 1000,
          validateStatus: () => true, // 接受任何状态码
        });

        clearTimeout(timeout);
        return true;
      } catch {
        // 继续尝试下一个
      }
    }

    // 尝试访问 URL
    for (const url of this.urlAddrList) {
      try {
        await axios.head(url, {
          timeout: NETWORK_DETECT_TIMEOUT * 1000,
          validateStatus: (status: number) => status < 500,
        });
        return true;
      } catch {
        // 继续尝试下一个
      }
    }

    return false;
  }

  /**
   * 启动定时刷新
   */
  private startRefreshTimer(): void {
    this.stopRefreshTimer();
    this.refreshTimer = setInterval(() => {
      this.refreshNetworkInfo().catch((error) => {
        console.error('Network refresh failed:', error);
      });
    }, this.refreshInterval * 1000);
  }

  /**
   * 停止定时刷新
   */
  private stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

// ============================================================================
// 导出
// ============================================================================

export * from './network';
