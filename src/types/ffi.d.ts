declare module "ffi-napi" {
  export interface Library {
    [key: string]: (...args: unknown[]) => unknown;
  }

  export function Library(
    libPath: string,
    functions: Record<string, [string, string[]]>,
  ): Library;
}

declare module "ref-napi" {
  export function alloc(type: string, value?: unknown): Buffer;
  export function refType(type: string): string;
  export const NULL: Buffer;
  export function deref(buffer: Buffer): unknown;
  export function readInt32(buffer: Buffer, offset?: number): number;
  export function readInt64(buffer: Buffer, offset?: number): number;
}
