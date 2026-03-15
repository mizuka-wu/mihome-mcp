declare module "node-ffi-rs" {
  export enum DataType {
    Void = "void",
    I32 = "i32",
    I64 = "i64",
    U32 = "u32",
    U64 = "u64",
    F32 = "f32",
    F64 = "f64",
    String = "string",
    Boolean = "bool",
    Pointer = "pointer",
    Buffer = "buffer",
    External = "external",
  }

  export interface FunctionDefinition {
    parameters: DataType[];
    returnType: DataType;
  }

  export interface LoadOptions<T> {
    library: string;
    path: string;
    functions: Record<keyof T, FunctionDefinition>;
  }

  export function load<T>(options: LoadOptions<T>): T;
}
