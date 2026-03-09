/**
 * MIoT i18n
 * 国际化翻译模块
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import YAML from 'yaml';
import { SYSTEM_LANGUAGE_DEFAULT } from './const';

/**
 * 国际化翻译类
 */
export class MIoTI18n {
  private lang: string;
  private cache: Map<string, Record<string, unknown>> = new Map();

  constructor(lang: string = SYSTEM_LANGUAGE_DEFAULT) {
    this.lang = lang;
  }

  /**
   * 初始化
   */
  async init(): Promise<void> {
    console.log('i18n initialized, lang:', this.lang);
  }

  /**
   * 更新语言
   */
  async updateLang(lang: string): Promise<void> {
    this.cache.clear();
    this.lang = lang;
    console.log('i18n language updated:', lang);
  }

  /**
   * 销毁
   */
  async destroy(): Promise<void> {
    this.cache.clear();
  }

  /**
   * 翻译
   * @param domain 域（文件名）
   * @param key 键（支持点号路径，如 "tools.get_devices.description"）
   * @param replace 替换变量
   * @param defaultValue 默认值
   */
  async translate(
    domain: string,
    key: string,
    replace?: Record<string, string>,
    defaultValue?: string | Record<string, unknown>
  ): Promise<string | Record<string, unknown> | null> {
    const data = await this.loadDomain(domain);
    if (!data) {
      return defaultValue ?? null;
    }

    // 解析键路径
    const keys = key.split('.');
    let result: unknown = data;

    for (const k of keys) {
      if (result && typeof result === 'object' && k in result) {
        result = (result as Record<string, unknown>)[k];
      } else {
        return defaultValue ?? null;
      }
    }

    // 如果是字符串，执行变量替换
    if (typeof result === 'string') {
      return replace ? this.replaceVariables(result, replace) : result;
    }

    // 如果是对象，返回对象
    if (typeof result === 'object' && result !== null) {
      return result as Record<string, unknown>;
    }

    return defaultValue ?? null;
  }

  /**
   * 加载域数据
   */
  private async loadDomain(domain: string): Promise<Record<string, unknown> | null> {
    // 检查缓存
    if (this.cache.has(domain)) {
      return this.cache.get(domain)!;
    }

    try {
      // 加载 YAML 文件
      const filePath = join(__dirname, 'i18n', this.lang, `${domain}.yaml`);
      const content = await readFile(filePath, 'utf-8');
      const data = YAML.parse(content) as Record<string, unknown>;

      // 存入缓存
      this.cache.set(domain, data);
      return data;
    } catch (error) {
      console.warn(`Failed to load i18n file for domain ${domain}:`, error);
      return null;
    }
  }

  /**
   * 替换变量
   */
  private replaceVariables(text: string, replace: Record<string, string>): string {
    let result = text;
    for (const [key, value] of Object.entries(replace)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return result;
  }

  /**
   * 获取当前语言
   */
  getLang(): string {
    return this.lang;
  }
}

// ============================================================================
// 导出
// ============================================================================

export * from './i18n';
