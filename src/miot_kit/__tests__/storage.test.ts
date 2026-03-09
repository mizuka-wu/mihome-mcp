/**
 * Storage Module Tests
 * 存储模块测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MIoTStorage } from "../storage";
import { MIoTStorageError } from "../error";

describe("Storage Module", () => {
  let storage: MIoTStorage;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `miot-storage-test-${Date.now()}`);
    storage = new MIoTStorage(testDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("save", () => {
    it("should save data to file", async () => {
      const result = await storage.save("test-domain", "test-key", {
        foo: "bar",
      });
      expect(result).toBe(true);

      // Verify file was created
      const filePath = join(testDir, "test-domain", "test-key.json");
      const content = await fs.readFile(filePath, "utf-8");
      expect(JSON.parse(content)).toEqual({ foo: "bar" });
    });

    it("should create nested directories", async () => {
      await storage.save("deep/nested/domain", "key", { data: true });

      const filePath = join(testDir, "deep", "nested", "domain", "key.json");
      const exists = await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("should overwrite existing data", async () => {
      await storage.save("domain", "key", { version: 1 });
      await storage.save("domain", "key", { version: 2 });

      const loaded = await storage.load("domain", "key");
      expect(loaded).toEqual({ version: 2 });
    });
  });

  describe("load", () => {
    it("should load existing data", async () => {
      await storage.save("domain", "key", { test: "data" });

      const loaded = await storage.load("domain", "key");
      expect(loaded).toEqual({ test: "data" });
    });

    it("should return null for non-existent file", async () => {
      const loaded = await storage.load("nonexistent", "key");
      expect(loaded).toBeNull();
    });

    it("should load with type casting", async () => {
      interface TestData {
        name: string;
        value: number;
      }

      await storage.save("domain", "key", { name: "test", value: 42 });

      const loaded = await storage.load<TestData>("domain", "key");
      expect(loaded?.name).toBe("test");
      expect(loaded?.value).toBe(42);
    });
  });

  describe("exists", () => {
    it("should return true for existing file", async () => {
      await storage.save("domain", "key", {});
      const exists = await storage.exists("domain", "key");
      expect(exists).toBe(true);
    });

    it("should return false for non-existent file", async () => {
      const exists = await storage.exists("nonexistent", "key");
      expect(exists).toBe(false);
    });
  });

  describe("remove", () => {
    it("should remove existing file", async () => {
      await storage.save("domain", "key", {});
      const removed = await storage.remove("domain", "key");
      expect(removed).toBe(true);

      const exists = await storage.exists("domain", "key");
      expect(exists).toBe(false);
    });

    it("should return false for non-existent file", async () => {
      const removed = await storage.remove("nonexistent", "key");
      expect(removed).toBe(false);
    });
  });

  describe("list", () => {
    it("should list all keys in domain", async () => {
      await storage.save("domain", "key1", {});
      await storage.save("domain", "key2", {});
      await storage.save("domain", "key3", {});

      const keys = await storage.list("domain");
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
      expect(keys).toContain("key3");
      expect(keys.length).toBe(3);
    });

    it("should return empty array for non-existent domain", async () => {
      const keys = await storage.list("nonexistent");
      expect(keys).toEqual([]);
    });

    it("should only list .json files", async () => {
      await storage.save("domain", "key1", {});

      // Create a non-json file
      const domainDir = join(testDir, "domain");
      await fs.writeFile(join(domainDir, "not-json.txt"), "text");

      const keys = await storage.list("domain");
      expect(keys).toEqual(["key1"]);
    });
  });

  describe("clear", () => {
    it("should clear all data in domain", async () => {
      await storage.save("domain", "key1", {});
      await storage.save("domain", "key2", {});

      const cleared = await storage.clear("domain");
      expect(cleared).toBe(true);

      const keys = await storage.list("domain");
      expect(keys).toEqual([]);
    });

    it("should not throw for non-existent domain", async () => {
      await expect(storage.clear("nonexistent")).resolves.toBe(true);
    });
  });
});
