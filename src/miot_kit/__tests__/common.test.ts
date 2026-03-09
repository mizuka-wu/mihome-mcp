/**
 * Common Module Tests
 * 通用工具模块测试
 */

import { describe, it, expect, vi } from "vitest";
import {
  calcGroupId,
  generateUuid,
  randomizeInt,
  randomizeFloat,
  buildQueryString,
  delay,
  formatTimestamp,
  getCurrentTimestamp,
  base64Encode,
  base64Decode,
} from "../common";

describe("Common Module", () => {
  describe("calcGroupId", () => {
    it("should calculate consistent group ID for same inputs", () => {
      const groupId1 = calcGroupId("user123", "home456");
      const groupId2 = calcGroupId("user123", "home456");
      expect(groupId1).toBe(groupId2);
    });

    it("should produce different group IDs for different inputs", () => {
      const groupId1 = calcGroupId("user123", "home456");
      const groupId2 = calcGroupId("user123", "home789");
      expect(groupId1).not.toBe(groupId2);
    });

    it("should return 16-character hex string", () => {
      const groupId = calcGroupId("user", "home");
      expect(groupId).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe("generateUuid", () => {
    it("should generate 32-character hex string", () => {
      const uuid = generateUuid();
      expect(uuid).toMatch(/^[a-f0-9]{32}$/);
    });

    it("should generate unique UUIDs", () => {
      const uuid1 = generateUuid();
      const uuid2 = generateUuid();
      expect(uuid1).not.toBe(uuid2);
    });
  });

  describe("randomizeInt", () => {
    it("should return integer within range", () => {
      const result = randomizeInt(100, 0.2);
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(80);
      expect(result).toBeLessThanOrEqual(120);
    });

    it("should return base value when ratio is 0", () => {
      const result = randomizeInt(100, 0);
      expect(result).toBe(100);
    });
  });

  describe("randomizeFloat", () => {
    it("should return float within range", () => {
      const result = randomizeFloat(100, 0.2);
      expect(result).toBeGreaterThanOrEqual(80);
      expect(result).toBeLessThanOrEqual(120);
    });

    it("should return base value when ratio is 0", () => {
      const result = randomizeFloat(100, 0);
      expect(result).toBe(100);
    });
  });

  describe("buildQueryString", () => {
    it("should build query string from params", () => {
      const params = { foo: "bar", num: 123, bool: true };
      const query = buildQueryString(params);
      expect(query).toContain("foo=bar");
      expect(query).toContain("num=123");
      expect(query).toContain("bool=true");
    });

    it("should encode special characters", () => {
      const params = { key: "hello world" };
      const query = buildQueryString(params);
      expect(query).toBe("key=hello%20world");
    });

    it("should handle empty params", () => {
      const query = buildQueryString({});
      expect(query).toBe("");
    });
  });

  describe("delay", () => {
    it("should delay for specified time", async () => {
      const start = Date.now();
      await delay(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(50);
    });
  });

  describe("formatTimestamp", () => {
    it("should format timestamp to ISO string", () => {
      const timestamp = 1609459200; // 2021-01-01 00:00:00 UTC
      const formatted = formatTimestamp(timestamp);
      expect(formatted).toMatch(/^2021-01-01/);
    });
  });

  describe("getCurrentTimestamp", () => {
    it("should return current timestamp in seconds", () => {
      const before = Math.floor(Date.now() / 1000);
      const timestamp = getCurrentTimestamp();
      const after = Math.floor(Date.now() / 1000);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("base64Encode", () => {
    it("should encode string to base64", () => {
      const encoded = base64Encode("hello");
      expect(encoded).toBe("aGVsbG8=");
    });

    it("should handle empty string", () => {
      const encoded = base64Encode("");
      expect(encoded).toBe("");
    });
  });

  describe("base64Decode", () => {
    it("should decode base64 to string", () => {
      const decoded = base64Decode("aGVsbG8=");
      expect(decoded).toBe("hello");
    });

    it("should handle empty string", () => {
      const decoded = base64Decode("");
      expect(decoded).toBe("");
    });

    it("should be inverse of encode", () => {
      const original = "test string 123 !@#";
      const encoded = base64Encode(original);
      const decoded = base64Decode(encoded);
      expect(decoded).toBe(original);
    });
  });
});
