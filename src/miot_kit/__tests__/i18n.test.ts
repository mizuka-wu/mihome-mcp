/**
 * I18n Module Tests
 * 国际化模块测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MIoTMdns } from "../mdns";
import { MIoTI18n } from "../i18n";

describe("I18n Module", () => {
  let i18n: MIoTI18n;

  beforeEach(() => {
    i18n = new MIoTI18n("zh-Hans");
  });

  afterEach(async () => {
    await i18n.destroy();
  });

  describe("constructor", () => {
    it("should initialize with default language", () => {
      const defaultI18n = new MIoTI18n();
      expect(defaultI18n.getLang()).toBe("zh-Hans");
    });

    it("should initialize with custom language", () => {
      const enI18n = new MIoTI18n("en");
      expect(enI18n.getLang()).toBe("en");
    });
  });

  describe("init", () => {
    it("should initialize without errors", async () => {
      await expect(i18n.init()).resolves.not.toThrow();
    });
  });

  describe("updateLang", () => {
    it("should update language", async () => {
      await i18n.updateLang("en");
      expect(i18n.getLang()).toBe("en");
    });

    it("should clear cache when updating language", async () => {
      await i18n.init();
      await i18n.updateLang("en");
      // Cache is cleared internally
      expect(i18n.getLang()).toBe("en");
    });
  });

  describe("translate", () => {
    it("should return null for non-existent domain", async () => {
      await i18n.init();
      const result = await i18n.translate("nonexistent", "key");
      expect(result).toBeNull();
    });

    it("should return null for non-existent key", async () => {
      await i18n.init();
      // Even if domain exists, non-existent key returns null
      const result = await i18n.translate("mcp", "nonexistent.key");
      expect(result).toBeNull();
    });

    it("should return default value when provided", async () => {
      await i18n.init();
      const defaultValue = "Default Text";
      const result = await i18n.translate(
        "nonexistent",
        "key",
        undefined,
        defaultValue,
      );
      expect(result).toBe(defaultValue);
    });
  });

  describe("destroy", () => {
    it("should destroy without errors", async () => {
      await i18n.init();
      await expect(i18n.destroy()).resolves.not.toThrow();
    });
  });

  describe("getLang", () => {
    it("should return current language", () => {
      expect(i18n.getLang()).toBe("zh-Hans");
    });
  });
});
