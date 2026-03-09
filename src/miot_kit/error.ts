/**
 * MIoT Error Codes and Exceptions
 * 错误码和异常类定义
 */

// ============================================================================
// 错误码枚举
// ============================================================================

export enum MIoTErrorCode {
  // 基础错误码
  CODE_UNKNOWN = -10000,
  CODE_UNAVAILABLE = -10001,
  CODE_INVALID_PARAMS = -10002,
  CODE_RESOURCE_ERROR = -10003,
  CODE_INTERNAL_ERROR = -10004,
  CODE_UNAUTHORIZED_ACCESS = -10005,
  CODE_TIMEOUT = -10006,

  // OAuth 错误码
  CODE_OAUTH_UNAUTHORIZED = -10020,

  // HTTP 错误码
  CODE_HTTP_INVALID_ACCESS_TOKEN = -10030,

  // MIoT mips 错误码
  CODE_MIPS_INVALID_RESULT = -10040,

  // MIoT cert 错误码
  CODE_CERT_INVALID_CERT = -10050,

  // MIoT spec 错误码 [-10060, -10069]
  CODE_SPEC_DEFAULT = -10060,

  // MIoT storage 错误码 [-10070, -10079]

  // MIPS service 错误码 [-10080, -10089]

  // MIoT lan 错误码 [-10090, -10099]
  CODE_LAN_UNAVAILABLE = -10100,

  // 摄像头错误码
  CODE_CAMERA_ERROR = -10200,

  // 客户端错误码
  CODE_CLIENT_ERROR = -10300,

  // 媒体解码错误码
  CODE_MEDIA_DECODER_ERROR = -10400,
}

// ============================================================================
// 基础错误类
// ============================================================================

export class MIoTError extends Error {
  code: MIoTErrorCode;

  constructor(message: string, code: MIoTErrorCode = MIoTErrorCode.CODE_UNKNOWN) {
    super(message);
    this.name = 'MIoTError';
    this.code = code;
    Object.setPrototypeOf(this, MIoTError.prototype);
  }

  toJSON(): string {
    return JSON.stringify({ code: this.code, message: this.message });
  }

  toDict(): { code: number; message: string } {
    return { code: this.code, message: this.message };
  }
}

// ============================================================================
// 特定错误类
// ============================================================================

export class MIoTOAuth2Error extends MIoTError {
  constructor(message: string, code: MIoTErrorCode = MIoTErrorCode.CODE_OAUTH_UNAUTHORIZED) {
    super(message, code);
    this.name = 'MIoTOAuth2Error';
    Object.setPrototypeOf(this, MIoTOAuth2Error.prototype);
  }
}

export class MIoTHttpError extends MIoTError {
  constructor(message: string, code: MIoTErrorCode = MIoTErrorCode.CODE_HTTP_INVALID_ACCESS_TOKEN) {
    super(message, code);
    this.name = 'MIoTHttpError';
    Object.setPrototypeOf(this, MIoTHttpError.prototype);
  }
}

export class MIoTMipsError extends MIoTError {
  constructor(message: string, code: MIoTErrorCode = MIoTErrorCode.CODE_MIPS_INVALID_RESULT) {
    super(message, code);
    this.name = 'MIoTMipsError';
    Object.setPrototypeOf(this, MIoTMipsError.prototype);
  }
}

export class MIoTDeviceError extends MIoTError {
  constructor(message: string, code: MIoTErrorCode = MIoTErrorCode.CODE_UNKNOWN) {
    super(message, code);
    this.name = 'MIoTDeviceError';
    Object.setPrototypeOf(this, MIoTDeviceError.prototype);
  }
}

export class MIoTCameraError extends MIoTError {
  constructor(message: string, code: MIoTErrorCode = MIoTErrorCode.CODE_CAMERA_ERROR) {
    super(message, code);
    this.name = 'MIoTCameraError';
    Object.setPrototypeOf(this, MIoTCameraError.prototype);
  }
}

export class MIoTSpecError extends MIoTError {
  constructor(message: string, code: MIoTErrorCode = MIoTErrorCode.CODE_SPEC_DEFAULT) {
    super(message, code);
    this.name = 'MIoTSpecError';
    Object.setPrototypeOf(this, MIoTSpecError.prototype);
  }
}

export class MIoTStorageError extends MIoTError {
  constructor(message: string, code: MIoTErrorCode = MIoTErrorCode.CODE_RESOURCE_ERROR) {
    super(message, code);
    this.name = 'MIoTStorageError';
    Object.setPrototypeOf(this, MIoTStorageError.prototype);
  }
}

export class MIoTCertError extends MIoTError {
  constructor(message: string, code: MIoTErrorCode = MIoTErrorCode.CODE_CERT_INVALID_CERT) {
    super(message, code);
    this.name = 'MIoTCertError';
    Object.setPrototypeOf(this, MIoTCertError.prototype);
  }
}

export class MIoTClientError extends MIoTError {
  constructor(message: string, code: MIoTErrorCode = MIoTErrorCode.CODE_CLIENT_ERROR) {
    super(message, code);
    this.name = 'MIoTClientError';
    Object.setPrototypeOf(this, MIoTClientError.prototype);
  }
}

export class MIoTLanError extends MIoTError {
  constructor(message: string, code: MIoTErrorCode = MIoTErrorCode.CODE_LAN_UNAVAILABLE) {
    super(message, code);
    this.name = 'MIoTLanError';
    Object.setPrototypeOf(this, MIoTLanError.prototype);
  }
}

export class MIoTMediaDecoderError extends MIoTError {
  constructor(message: string, code: MIoTErrorCode = MIoTErrorCode.CODE_MEDIA_DECODER_ERROR) {
    super(message, code);
    this.name = 'MIoTMediaDecoderError';
    Object.setPrototypeOf(this, MIoTMediaDecoderError.prototype);
  }
}

// ============================================================================
// 导出所有错误
// ============================================================================

export * from './error';
