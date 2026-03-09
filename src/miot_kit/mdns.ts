/**
 * MIoT mDNS Discovery
 * mDNS 局域网服务发现
 */

import { EventEmitter } from 'events';
import { MdnsServiceState, MipsServiceData } from './types';
import { MDNS_SUPPORT_TYPE_LIST } from './const';

/**
 * mDNS 服务发现类（简化版）
 * 注意：完整实现需要 bonjour-service 或 multicast-dns 库
 */
export class MIoTMdns extends EventEmitter {
  private serviceTypes: string[];
  private services: Map<string, MipsServiceData> = new Map();

  constructor() {
    super();
    this.serviceTypes = Object.keys(MDNS_SUPPORT_TYPE_LIST);
  }

  /**
   * 初始化 mDNS 服务发现
   * 注意：这是简化版实现，实际需要使用 bonjour-service 库
   */
  async init(): Promise<void> {
    console.log('mDNS discovery initialized (simplified)');
    console.log('Supported service types:', this.serviceTypes);
    this.emit('initialized');
  }

  /**
   * 销毁 mDNS 服务发现
   */
  async destroy(): Promise<void> {
    this.services.clear();
    this.removeAllListeners();
  }

  /**
   * 获取发现的服务列表
   */
  getServices(): MipsServiceData[] {
    return Array.from(this.services.values());
  }

  /**
   * 根据 DID 查找服务
   */
  findServiceByDid(did: string): MipsServiceData | undefined {
    return this.services.get(did);
  }

  /**
   * 模拟添加服务（用于测试）
   */
  addMockService(data: MipsServiceData): void {
    this.services.set(data.did, data);
    this.emit('serviceAdded', data);
  }

  /**
   * 模拟移除服务（用于测试）
   */
  removeMockService(did: string): void {
    const service = this.services.get(did);
    if (service) {
      this.services.delete(did);
      this.emit('serviceRemoved', service);
    }
  }
}

// ============================================================================
// 导出
// ============================================================================

export * from './mdns';
