/**
 * MIoT Storage Module
 * 文件系统存储管理
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { MIoTStorageError } from './error';

export class MIoTStorage {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      throw new MIoTStorageError(`Failed to create directory: ${dirPath}`, -10003);
    }
  }

  /**
   * 获取完整文件路径
   */
  private getFilePath(domain: string, name: string): string {
    return join(this.basePath, domain, `${name}.json`);
  }

  /**
   * 保存数据到文件
   * @param domain 数据域（目录名）
   * @param name 数据名（文件名，不含扩展名）
   * @param data 要保存的数据
   */
  async save(domain: string, name: string, data: unknown): Promise<boolean> {
    try {
      const dirPath = join(this.basePath, domain);
      await this.ensureDir(dirPath);

      const filePath = this.getFilePath(domain, name);
      const content = JSON.stringify(data, null, 2);
      await fs.writeFile(filePath, content, 'utf-8');

      return true;
    } catch (error) {
      if (error instanceof MIoTStorageError) {
        throw error;
      }
      throw new MIoTStorageError(
        `Failed to save data: ${error instanceof Error ? error.message : String(error)}`,
        -10003
      );
    }
  }

  /**
   * 从文件加载数据
   * @param domain 数据域（目录名）
   * @param name 数据名（文件名，不含扩展名）
   * @returns 加载的数据，不存在则返回 null
   */
  async load<T>(domain: string, name: string): Promise<T | null> {
    try {
      const filePath = this.getFilePath(domain, name);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      // 文件不存在返回 null
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new MIoTStorageError(
        `Failed to load data: ${error instanceof Error ? error.message : String(error)}`,
        -10003
      );
    }
  }

  /**
   * 检查数据是否存在
   * @param domain 数据域（目录名）
   * @param name 数据名（文件名，不含扩展名）
   */
  async exists(domain: string, name: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(domain, name);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 删除数据文件
   * @param domain 数据域（目录名）
   * @param name 数据名（文件名，不含扩展名）
   */
  async remove(domain: string, name: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(domain, name);
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw new MIoTStorageError(
        `Failed to remove data: ${error instanceof Error ? error.message : String(error)}`,
        -10003
      );
    }
  }

  /**
   * 列出域中的所有数据名
   * @param domain 数据域（目录名）
   */
  async list(domain: string): Promise<string[]> {
    try {
      const dirPath = join(this.basePath, domain);
      const entries = await fs.readdir(dirPath);
      return entries
        .filter((entry) => entry.endsWith('.json'))
        .map((entry) => entry.slice(0, -5)); // 移除 .json 扩展名
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw new MIoTStorageError(
        `Failed to list data: ${error instanceof Error ? error.message : String(error)}`,
        -10003
      );
    }
  }

  /**
   * 清空指定域的所有数据
   * @param domain 数据域（目录名）
   */
  async clear(domain: string): Promise<boolean> {
    try {
      const dirPath = join(this.basePath, domain);
      await fs.rm(dirPath, { recursive: true, force: true });
      return true;
    } catch (error) {
      throw new MIoTStorageError(
        `Failed to clear data: ${error instanceof Error ? error.message : String(error)}`,
        -10003
      );
    }
  }
}

// ============================================================================
// 导出
// ============================================================================

export * from './storage';
