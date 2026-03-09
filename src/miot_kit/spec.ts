/**
 * MIoT Spec Parser
 * MIoT 设备规格解析器
 */

import axios from 'axios';
import { MIoTSpecDevice, MIoTSpecDeviceLite, SpecFilter, SpecModifyProperty } from './types';
import { SPEC_STD_LIB_EFFECTIVE_TIME } from './const';

/**
 * 规格解析器类
 */
export class MIoTSpecParser {
  private cache: Map<string, MIoTSpecDevice> = new Map();
  private specFilters: Map<string, SpecFilter> = new Map();
  private specModifications: Map<string, Record<string, SpecModifyProperty>> = new Map();

  /**
   * 获取设备规格
   */
  async getSpec(model: string): Promise<MIoTSpecDevice | null> {
    // 先检查缓存
    if (this.cache.has(model)) {
      return this.cache.get(model)!;
    }

    try {
      // 从在线服务获取规格
      const spec = await this.fetchSpecFromOnline(model);
      if (spec) {
        // 应用过滤器和修改器
        const processedSpec = this.processSpec(model, spec);
        this.cache.set(model, processedSpec);
        return processedSpec;
      }
    } catch (error) {
      console.error(`Failed to fetch spec for ${model}:`, error);
    }

    return null;
  }

  /**
   * 从在线服务获取规格
   */
  private async fetchSpecFromOnline(model: string): Promise<MIoTSpecDevice | null> {
    const url = `https://miot-spec.org/miot-spec-v2/instance?type=${encodeURIComponent(model)}`;

    try {
      const response = await axios.get(url, {
        timeout: 30000,
      });

      if (response.status === 200 && response.data) {
        return this.parseSpecResponse(response.data);
      }
    } catch (error) {
      console.error(`Failed to fetch spec from online for ${model}:`, error);
    }

    return null;
  }

  /**
   * 解析规格响应
   */
  private parseSpecResponse(data: Record<string, unknown>): MIoTSpecDevice {
    // 转换 services 从数组到记录
    const services = data.services as Array<Record<string, unknown>>;
    const servicesRecord: Record<string, unknown> = {};

    for (const service of services) {
      const siid = service.siid as number;
      servicesRecord[String(siid)] = service;
    }

    return {
      type: data.type as string,
      description: data.description as string,
      services: servicesRecord as Record<string, unknown>,
    } as MIoTSpecDevice;
  }

  /**
   * 处理规格（应用过滤器和修改器）
   */
  private processSpec(model: string, spec: MIoTSpecDevice): MIoTSpecDevice {
    let processed = { ...spec };

    // 应用过滤器
    const filter = this.specFilters.get(model);
    if (filter) {
      processed = this.applyFilter(processed, filter);
    }

    // 应用修改器
    const modifications = this.specModifications.get(model);
    if (modifications) {
      processed = this.applyModifications(processed, modifications);
    }

    return processed;
  }

  /**
   * 应用过滤器
   */
  private applyFilter(spec: MIoTSpecDevice, filter: SpecFilter): MIoTSpecDevice {
    const filtered = { ...spec };

    // 过滤属性
    if (filter.properties) {
      // 实现属性过滤逻辑
    }

    // 过滤服务
    if (filter.services) {
      // 实现服务过滤逻辑
    }

    return filtered;
  }

  /**
   * 应用修改器
   */
  private applyModifications(
    spec: MIoTSpecDevice,
    modifications: Record<string, SpecModifyProperty>
  ): MIoTSpecDevice {
    const modified = { ...spec };

    for (const [key, value] of Object.entries(modifications)) {
      // 解析 key (格式: prop.siid.piid 或 action.siid.aiid)
      const parts = key.split('.');
      if (parts.length >= 3) {
        const [, siid, piid] = parts;
        // 应用修改
        this.applyPropertyModification(modified, siid, piid, value);
      }
    }

    return modified;
  }

  /**
   * 应用属性修改
   */
  private applyPropertyModification(
    spec: MIoTSpecDevice,
    siid: string,
    piid: string,
    modification: SpecModifyProperty
  ): void {
    const service = spec.services[siid];
    if (!service) return;

    const properties = service.properties as Record<string, unknown>;
    if (!properties) return;

    const property = properties[piid];
    if (!property) return;

    // 应用修改
    if (modification.name) {
      (property as Record<string, unknown>).name = modification.name;
    }
    if (modification.access) {
      (property as Record<string, unknown>).access = modification.access;
    }
    if (modification.icon) {
      (property as Record<string, unknown>).icon = modification.icon;
    }
    if (modification.unit) {
      (property as Record<string, unknown>).unit = modification.unit;
    }
  }

  /**
   * 添加规格过滤器
   */
  addSpecFilter(model: string, filter: SpecFilter): void {
    this.specFilters.set(model, filter);
  }

  /**
   * 添加规格修改器
   */
  addSpecModification(model: string, modifications: Record<string, SpecModifyProperty>): void {
    this.specModifications.set(model, modifications);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取规格（简化版）
   */
  async getSpecLite(model: string): Promise<MIoTSpecDeviceLite | null> {
    const spec = await this.getSpec(model);
    if (!spec) return null;

    // 转换为简化版
    return {
      type: spec.type,
      description: spec.description,
      services: Object.values(spec.services),
    } as MIoTSpecDeviceLite;
  }
}

// ============================================================================
// 导出
// ============================================================================

export * from './spec';
