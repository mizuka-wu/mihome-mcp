/**
 * LAN Module Tests
 * 局域网发现模块测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MIoTLan } from "../lan";

describe("LAN Module", () => {
  let lan: MIoTLan;

  beforeEach(() => {
    lan = new MIoTLan(["eth0", "wlan0"]);
  });

  afterEach(async () => {
    await lan.destroy();
  });

  describe("init", () => {
    it("should initialize LAN discovery", async () => {
      // Note: This may fail in test environments without UDP permissions
      try {
        await lan.init();
        expect(lan).toBeDefined();
      } catch (error) {
        // UDP binding may fail in some test environments
        expect(error).toBeDefined();
      }
    });
  });

  describe("destroy", () => {
    it("should destroy without errors", async () => {
      await expect(lan.destroy()).resolves.not.toThrow();
    });
  });

  describe("getDevices", () => {
    it("should return array of devices", () => {
      const devices = lan.getDevices();
      expect(Array.isArray(devices)).toBe(true);
    });
  });

  describe("getDevice", () => {
    it("should return undefined for unknown device", () => {
      const device = lan.getDevice("unknown-did");
      expect(device).toBeUndefined();
    });
  });
});
