/**
 * Network Module Tests
 * 网络监控模块测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MIoTNetwork } from "../network";

describe("Network Module", () => {
  let network: MIoTNetwork;

  beforeEach(() => {
    // Use test IPs/URLs to avoid actual network calls
    network = new MIoTNetwork(
      ["127.0.0.1"],
      ["http://localhost"],
      60, // Long refresh interval for testing
    );
  });

  afterEach(async () => {
    await network.destroy();
  });

  describe("init", () => {
    it("should initialize network monitoring", async () => {
      await expect(network.init()).resolves.not.toThrow();
    });

    it("should emit initialized event", async () => {
      const initSpy = vi.fn();
      network.on("initialized", initSpy);
      await network.init();
      expect(initSpy).toHaveBeenCalled();
    });
  });

  describe("destroy", () => {
    it("should destroy without errors", async () => {
      await network.init();
      await expect(network.destroy()).resolves.not.toThrow();
    });
  });

  describe("getNetworkStatus", () => {
    it("should return boolean status", async () => {
      await network.init();
      const status = network.getNetworkStatus();
      expect(typeof status).toBe("boolean");
    });
  });

  describe("getNetworkInfo", () => {
    it("should return network interfaces", async () => {
      await network.init();
      const info = network.getNetworkInfo();
      expect(typeof info).toBe("object");
    });
  });
});
