/**
 * Error Module Tests
 * 错误处理模块测试
 */

import { describe, it, expect } from "vitest";
import {
  MIoTError,
  MIoTErrorCode,
  MIoTOAuth2Error,
  MIoTHttpError,
  MIoTMipsError,
  MIoTDeviceError,
  MIoTCameraError,
  MIoTSpecError,
  MIoTStorageError,
  MIoTCertError,
  MIoTClientError,
  MIoTLanError,
  MIoTMediaDecoderError,
} from "../error";

describe("Error Module", () => {
  describe("MIoTError", () => {
    it("should create base error with default code", () => {
      const error = new MIoTError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(MIoTErrorCode.CODE_UNKNOWN);
      expect(error.name).toBe("MIoTError");
    });

    it("should create error with custom code", () => {
      const error = new MIoTError("Custom error", MIoTErrorCode.CODE_TIMEOUT);
      expect(error.code).toBe(MIoTErrorCode.CODE_TIMEOUT);
    });

    it("should convert to JSON", () => {
      const error = new MIoTError(
        "JSON test",
        MIoTErrorCode.CODE_INVALID_PARAMS,
      );
      const json = error.toJSON();
      expect(json).toContain("-10002");
      expect(json).toContain("JSON test");
    });

    it("should convert to dictionary", () => {
      const error = new MIoTError(
        "Dict test",
        MIoTErrorCode.CODE_RESOURCE_ERROR,
      );
      const dict = error.toDict();
      expect(dict.code).toBe(MIoTErrorCode.CODE_RESOURCE_ERROR);
      expect(dict.message).toBe("Dict test");
    });
  });

  describe("MIoTOAuth2Error", () => {
    it("should create OAuth2 error with default code", () => {
      const error = new MIoTOAuth2Error("OAuth failed");
      expect(error.message).toBe("OAuth failed");
      expect(error.code).toBe(MIoTErrorCode.CODE_OAUTH_UNAUTHORIZED);
      expect(error.name).toBe("MIoTOAuth2Error");
    });

    it("should create OAuth2 error with custom code", () => {
      const error = new MIoTOAuth2Error(
        "Custom OAuth error",
        MIoTErrorCode.CODE_UNKNOWN,
      );
      expect(error.code).toBe(MIoTErrorCode.CODE_UNKNOWN);
    });
  });

  describe("MIoTHttpError", () => {
    it("should create HTTP error with default code", () => {
      const error = new MIoTHttpError("HTTP request failed");
      expect(error.code).toBe(MIoTErrorCode.CODE_HTTP_INVALID_ACCESS_TOKEN);
      expect(error.name).toBe("MIoTHttpError");
    });
  });

  describe("MIoTMipsError", () => {
    it("should create MIPS error with default code", () => {
      const error = new MIoTMipsError("MIPS error");
      expect(error.code).toBe(MIoTErrorCode.CODE_MIPS_INVALID_RESULT);
      expect(error.name).toBe("MIoTMipsError");
    });
  });

  describe("MIoTDeviceError", () => {
    it("should create device error", () => {
      const error = new MIoTDeviceError("Device not found");
      expect(error.code).toBe(MIoTErrorCode.CODE_UNKNOWN);
      expect(error.name).toBe("MIoTDeviceError");
    });
  });

  describe("MIoTCameraError", () => {
    it("should create camera error with default code", () => {
      const error = new MIoTCameraError("Camera connection failed");
      expect(error.code).toBe(MIoTErrorCode.CODE_CAMERA_ERROR);
      expect(error.name).toBe("MIoTCameraError");
    });
  });

  describe("MIoTSpecError", () => {
    it("should create spec error with default code", () => {
      const error = new MIoTSpecError("Invalid spec");
      expect(error.code).toBe(MIoTErrorCode.CODE_SPEC_DEFAULT);
      expect(error.name).toBe("MIoTSpecError");
    });
  });

  describe("MIoTStorageError", () => {
    it("should create storage error with default code", () => {
      const error = new MIoTStorageError("Storage operation failed");
      expect(error.code).toBe(MIoTErrorCode.CODE_RESOURCE_ERROR);
      expect(error.name).toBe("MIoTStorageError");
    });
  });

  describe("MIoTCertError", () => {
    it("should create cert error with default code", () => {
      const error = new MIoTCertError("Invalid certificate");
      expect(error.code).toBe(MIoTErrorCode.CODE_CERT_INVALID_CERT);
      expect(error.name).toBe("MIoTCertError");
    });
  });

  describe("MIoTClientError", () => {
    it("should create client error with default code", () => {
      const error = new MIoTClientError("Client initialization failed");
      expect(error.code).toBe(MIoTErrorCode.CODE_CLIENT_ERROR);
      expect(error.name).toBe("MIoTClientError");
    });
  });

  describe("MIoTLanError", () => {
    it("should create LAN error with default code", () => {
      const error = new MIoTLanError("LAN discovery failed");
      expect(error.code).toBe(MIoTErrorCode.CODE_LAN_UNAVAILABLE);
      expect(error.name).toBe("MIoTLanError");
    });
  });

  describe("MIoTMediaDecoderError", () => {
    it("should create media decoder error with default code", () => {
      const error = new MIoTMediaDecoderError("Decoding failed");
      expect(error.code).toBe(MIoTErrorCode.CODE_MEDIA_DECODER_ERROR);
      expect(error.name).toBe("MIoTMediaDecoderError");
    });
  });

  describe("Error codes", () => {
    it("should have unique error codes", () => {
      const codes = [
        MIoTErrorCode.CODE_UNKNOWN,
        MIoTErrorCode.CODE_UNAVAILABLE,
        MIoTErrorCode.CODE_INVALID_PARAMS,
        MIoTErrorCode.CODE_RESOURCE_ERROR,
        MIoTErrorCode.CODE_INTERNAL_ERROR,
        MIoTErrorCode.CODE_UNAUTHORIZED_ACCESS,
        MIoTErrorCode.CODE_TIMEOUT,
        MIoTErrorCode.CODE_OAUTH_UNAUTHORIZED,
        MIoTErrorCode.CODE_HTTP_INVALID_ACCESS_TOKEN,
        MIoTErrorCode.CODE_MIPS_INVALID_RESULT,
        MIoTErrorCode.CODE_CERT_INVALID_CERT,
        MIoTErrorCode.CODE_SPEC_DEFAULT,
        MIoTErrorCode.CODE_LAN_UNAVAILABLE,
        MIoTErrorCode.CODE_CAMERA_ERROR,
        MIoTErrorCode.CODE_CLIENT_ERROR,
        MIoTErrorCode.CODE_MEDIA_DECODER_ERROR,
      ];

      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it("should have negative error codes", () => {
      Object.values(MIoTErrorCode).forEach((code) => {
        if (typeof code === "number") {
          expect(code).toBeLessThan(0);
        }
      });
    });
  });
});
