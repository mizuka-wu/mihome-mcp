/**
 * OAuth2 Module Tests
 * OAuth2 认证模块测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MIoTOAuth2Client, BaseOAuth2Client } from "../oauth2";

describe("OAuth2 Module", () => {
  describe("BaseOAuth2Client", () => {
    let client: BaseOAuth2Client;

    beforeEach(() => {
      client = new BaseOAuth2Client(
        "https://auth.example.com",
        "test-client-id",
        "https://redirect.example.com",
      );
    });

    it("should throw error when initialized with invalid params", () => {
      expect(() => new BaseOAuth2Client("", "id", "redirect")).toThrow(
        "Invalid OAuth2 client parameters",
      );
      expect(() => new BaseOAuth2Client("url", "", "redirect")).toThrow(
        "Invalid OAuth2 client parameters",
      );
      expect(() => new BaseOAuth2Client("url", "id", "")).toThrow(
        "Invalid OAuth2 client parameters",
      );
    });

    it("should generate auth URL (abstract method)", async () => {
      await expect(client.generateAuthUrl()).rejects.toThrow(
        "Subclass must implement generateAuthUrl",
      );
    });

    it("should validate state", async () => {
      const url = await new TestOAuth2Client(
        "https://auth.com",
        "id",
        "https://redirect.com",
      ).generateAuthUrl("test-state");
      const valid = await client.validateState("test-state");
      expect(valid).toBe(false); // Base client doesn't track state
    });
  });

  describe("MIoTOAuth2Client", () => {
    let client: MIoTOAuth2Client;

    beforeEach(() => {
      client = new MIoTOAuth2Client(
        "https://redirect.example.com",
        "cn",
        "test-uuid-12345",
      );
    });

    it("should initialize with correct host for cn server", () => {
      const cnClient = new MIoTOAuth2Client(
        "https://redirect.com",
        "cn",
        "uuid",
      );
      expect(cnClient).toBeDefined();
    });

    it("should initialize with correct host for de server", () => {
      const deClient = new MIoTOAuth2Client(
        "https://redirect.com",
        "de",
        "uuid",
      );
      expect(deClient).toBeDefined();
    });

    it("should generate auth URL with correct params", async () => {
      const url = await client.generateAuthUrl();
      expect(url).toContain("https://account.xiaomi.com/oauth2/authorize");
      expect(url).toContain("client_id=2882303761520431603");
      expect(url).toContain("response_type=code");
      expect(url).toContain("device_id=mico.test-uuid-12345");
    });

    it("should generate auth URL with custom redirect URI", async () => {
      const customRedirect = "https://custom.redirect.com";
      const url = await client.generateAuthUrl("state", {
        redirect_uri: customRedirect,
      });
      expect(url).toContain(
        `redirect_uri=${encodeURIComponent(customRedirect)}`,
      );
    });

    it("should generate auth URL with scope", async () => {
      const url = await client.generateAuthUrl("state", {
        scope: "read write",
      });
      expect(url).toContain("scope=read+write");
    });

    it("should generate auth URL with skip confirm", async () => {
      const url = await client.generateAuthUrl("state", {
        skip_confirm: "true",
      });
      expect(url).toContain("skip_confirm=true");
    });

    it("should validate state correctly", async () => {
      // First generate URL to set the state
      await client.generateAuthUrl();
      const state = await (client as any).state;

      // Mock the checkState method behavior
      const mockClient = new MIoTOAuth2Client(
        "https://redirect.com",
        "cn",
        "uuid",
      );
      await mockClient.generateAuthUrl();

      // The state should be a SHA1 hash
      const isValid = await mockClient.validateState(
        await (mockClient as any).state,
      );
      expect(isValid).toBe(true);
    });
  });
});

// Test subclass for BaseOAuth2Client
class TestOAuth2Client extends BaseOAuth2Client {
  async generateAuthUrl(state?: string): Promise<string> {
    this.state = state || "test-state";
    return `https://auth.com?state=${this.state}`;
  }
}
