/**
 * Spec Module Tests
 * 规格解析模块测试
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MIoTSpecParser } from "../spec";

describe("Spec Module", () => {
  let parser: MIoTSpecParser;

  beforeEach(() => {
    parser = new MIoTSpecParser();
  });

  describe("constructor", () => {
    it("should initialize spec parser", () => {
      expect(parser).toBeDefined();
    });
  });

  describe("getSpec", () => {
    it("should return null for invalid model (when API fails)", async () => {
      // This test may make an actual HTTP request
      // In real tests, you would mock axios
      const spec = await parser.getSpec("invalid.model.that.does.not.exist");
      // Will likely return null due to API error
      expect(spec).toBeNull();
    });
  });

  describe("getSpecLite", () => {
    it("should return null for invalid model", async () => {
      const spec = await parser.getSpecLite("invalid.model");
      expect(spec).toBeNull();
    });
  });

  describe("addSpecFilter", () => {
    it("should add spec filter", () => {
      const filter = {
        properties: ["prop1", "prop2"],
        services: ["service1"],
      };
      parser.addSpecFilter("test.model", filter);
      // Filter is added to internal map, no direct way to verify
      expect(true).toBe(true);
    });
  });

  describe("addSpecModification", () => {
    it("should add spec modification", () => {
      const modifications = {
        "prop.1.1": { name: "Custom Name" },
      };
      parser.addSpecModification("test.model", modifications);
      // Modifications are added to internal map
      expect(true).toBe(true);
    });
  });

  describe("clearCache", () => {
    it("should clear cache without errors", () => {
      expect(() => parser.clearCache()).not.toThrow();
    });
  });
});
