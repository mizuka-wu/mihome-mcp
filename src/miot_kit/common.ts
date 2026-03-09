/**
 * MIoT Common Utilities
 * 通用工具函数
 */

import { createHash, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import YAML from 'yaml';

/**
 * 计算 group_id
 * 基于用户 ID 和家庭 ID 生成 SHA1 哈希
 */
export function calcGroupId(uid: string, homeId: string): string {
  return createHash('sha1')
    .update(`${uid}central_service${homeId}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * 生成随机 UUID（32位十六进制字符串）
 */
export function generateUuid(): string {
  return randomBytes(16).toString('hex');
}

/**
 * 加载 JSON 文件
 */
export function loadJsonFile<T = unknown>(filePath: string): T {
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * 加载 YAML 文件
 */
export function loadYamlFile<T = unknown>(filePath: string): T {
  const content = readFileSync(filePath, 'utf-8');
  return YAML.parse(content) as T;
}

/**
 * 随机化整数值
 * @param value 基础值
 * @param ratio 随机比例（0-1）
 */
export function randomizeInt(value: number, ratio: number): number {
  return Math.floor(value * (1 - ratio + Math.random() * 2 * ratio));
}

/**
 * 随机化浮点值
 * @param value 基础值
 * @param ratio 随机比例（0-1）
 */
export function randomizeFloat(value: number, ratio: number): number {
  return value * (1 - ratio + Math.random() * 2 * ratio);
}

/**
 * HTTP GET 请求
 */
export async function httpGet(
  url: string,
  params?: Record<string, string>,
  headers?: Record<string, string>,
  timeout = 30000
): Promise<string> {
  const response = await axios.get(url, {
    params,
    headers,
    timeout,
    responseType: 'text',
  });
  return response.data as string;
}

/**
 * HTTP GET JSON 请求
 */
export async function httpGetJson<T = unknown>(
  url: string,
  params?: Record<string, string>,
  headers?: Record<string, string>,
  timeout = 30000
): Promise<T> {
  const response = await axios.get(url, {
    params,
    headers,
    timeout,
  });
  return response.data as T;
}

/**
 * HTTP POST JSON 请求
 */
export async function httpPostJson<T = unknown>(
  url: string,
  data: Record<string, unknown>,
  headers?: Record<string, string>,
  timeout = 30000
): Promise<T> {
  const response = await axios.post(url, data, {
    headers,
    timeout,
  });
  return response.data as T;
}

/**
 * 构建查询参数字符串
 */
export function buildQueryString(params: Record<string, string | number | boolean>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 格式化时间戳为日期字符串
 */
export function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

/**
 * 获取当前 Unix 时间戳（秒）
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * 安全的 Base64 编码
 */
export function base64Encode(str: string): string {
  return Buffer.from(str).toString('base64');
}

/**
 * 安全的 Base64 解码
 */
export function base64Decode(str: string): string {
  return Buffer.from(str, 'base64').toString('utf-8');
}

/**
 * 生成绝对路径
 */
export function genAbsolutePath(relativePath: string, basePath: string): string {
  return join(basePath, relativePath);
}

// ============================================================================
// 导出
// ============================================================================

export * from './common';
