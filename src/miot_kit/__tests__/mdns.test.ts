/**
 * MDNS Module Tests
 * mDNS 服务发现模块测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MIoTMdns } from "../mdns";
import { MipsServiceData } from "../types";

describe("MDNS Module", () => {
  let mdns: MIoTMdns;

  beforeEach(() => {
    mdns = new MIoTMdns();
  });

  afterEach(async () => {
    await mdns.destroy();
  });

  describe("constructor", () => {
    it("should create mDNS instance", () => {
      expect(mdns).toBeDefined();
    });
  });

  describe("init", () => {
    it("should initialize without errors", async () => {
      await expect(mdns.init()).resolves.not.toThrow();
    });

    it("should emit initialized event", async () => {
      const initSpy = vi.fn();
      mdns.on("initialized", initSpy);
      await mdns.init();
      expect(initSpy).toHaveBeenCalled();
    });
  });

  describe("destroy", () => {
    it("should destroy without errors", async () => {
      await mdns.init();
      await expect(mdns.destroy()).resolves.not.toThrow();
    });
  });

  describe("getServices", () => {
    it("should return empty array initially", () => {
      const services = mdns.getServices();
      expect(Array.isArray(services)).toBe(true);
      expect(services.length).toBe(0);
    });

    it("should return mock services after adding", async () => {
      await mdns.init();

      const mockService: MipsServiceData = {
        profile: "test-profile",
        profile_bin: Buffer.from("test"),
        name: "Test Service",
        addresses: ["192.168.1.1"],
        port: 8080,
        type: "_miot-central._tcp.local.",
        server: "test-server",
        did: "123456789",
        group_id: "group123",
        role: 1,
        suite_mqtt: true,
      };

      mdns.addMockService(mockService);

      const services = mdns.getServices();
      expect(services.length).toBe(1);
      expect(services[0].did).toBe("123456789");
    });
  });

  describe("findServiceByDid", () => {
    it("should return undefined for unknown DID", () => {
      const service = mdns.findServiceByDid("unknown");
      expect(service).toBeUndefined();
    });

    it("should return service for known DID", async () => {
      await mdns.init();

      const mockService: MipsServiceData = {
        profile: "test-profile",
        profile_bin: Buffer.from("test"),
        name: "Test Service",
        addresses: ["192.168.1.1"],
        port: 8080,
        type: "_miot-central._tcp.local.",
        server: "test-server",
        did: "987654321",
        group_id: "group456",
        role: 2,
        suite_mqtt: false,
      };

      mdns.addMockService(mockService);

      const found = mdns.findServiceByDid("987654321");
      expect(found).toBeDefined();
      expect(found?.did).toBe("987654321");
    });
  });

  describe("addMockService", () => {
    it("should add service and emit event", async () => {
      await mdns.init();

      const serviceSpy = vi.fn();
      mdns.on("serviceAdded", serviceSpy);

      const mockService: MipsServiceData = {
        profile: "test",
        profile_bin: Buffer.from("test"),
        name: "Test",
        addresses: ["192.168.1.1"],
        port: 80,
        type: "_test._tcp.local.",
        server: "test",
        did: "111",
        group_id: "g1",
        role: 1,
        suite_mqtt: true,
      };

      mdns.addMockService(mockService);

      expect(serviceSpy).toHaveBeenCalledWith(mockService);
    });
  });

  describe("removeMockService", () => {
    it("should remove service and emit event", async () => {
      await mdns.init();

      const mockService: MipsServiceData = {
        profile: "test",
        profile_bin: Buffer.from("test"),
        name: "Test",
        addresses: ["192.168.1.1"],
        port: 80,
        type: "_test._tcp.local.",
        server: "test",
        did: "222",
        group_id: "g2",
        role: 1,
        suite_mqtt: true,
      };

      mdns.addMockService(mockService);

      const removeSpy = vi.fn();
      mdns.on("serviceRemoved", removeSpy);

      mdns.removeMockService("222");

      expect(removeSpy).toHaveBeenCalledWith(mockService);
      expect(mdns.findServiceByDid("222")).toBeUndefined();
    });

    it("should not emit event for non-existent service", async () => {
      await mdns.init();

      const removeSpy = vi.fn();
      mdns.on("serviceRemoved", removeSpy);

      mdns.removeMockService("non-existent");

      expect(removeSpy).not.toHaveBeenCalled();
    });
  });
});
