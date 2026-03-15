import cookieParser from "cookie-parser";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import http, { type Server as HttpServer } from "http";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";
import { MIoTClient, type MIoTClientOptions } from "../../miot_kit/client";
import { MIoTStorage } from "../../miot_kit/storage";
import { MIoTCameraManager } from "../../miot_kit/camera";
import { Agent } from "@mastra/core/agent";
import type {
  MIoTDeviceInfo,
  MIoTCameraInfo,
  MIoTManualSceneInfo,
} from "../../miot_kit/types";
import { MIoTMcpServer } from "../../miot_kit/mcp";
import { McpClientManager, type McpConfig } from "../mcp/client-manager";

type NormalResponse<T = unknown> = {
  code: number;
  message: string;
  data?: T | null;
};

type ChatHeader = {
  type: "event" | "instruction";
  namespace: string;
  name: string;
  timestamp: number;
  request_id: string;
  session_id: string | null;
};

type ChatEvent = {
  header: ChatHeader;
  payload: string;
};

type ChatInstruction = {
  header: ChatHeader;
  payload: string;
};

type ChatHistorySession = {
  data: Array<ChatEvent | ChatInstruction>;
};

type ChatHistoryResponse = {
  session_id: string;
  title: string;
  timestamp: number;
  session: ChatHistorySession;
};

type ChatHistorySimpleInfo = {
  session_id: string;
  title: string;
  timestamp: number;
};

const chatAgent = new Agent({
  id: "miloco-chat-agent",
  name: "Miloco Chat Agent",
  instructions: "You are a helpful smart home assistant.",
  model: process.env.MILOCO_CHAT_MODEL || "openai/gpt-5-mini",
});

function buildChatHeader(params: {
  type: "event" | "instruction";
  namespace: string;
  name: string;
  requestId: string;
  sessionId: string;
}): ChatHeader {
  return {
    type: params.type,
    namespace: params.namespace,
    name: params.name,
    timestamp: Date.now(),
    request_id: params.requestId,
    session_id: params.sessionId,
  };
}

function buildToastStreamInstruction(params: {
  requestId: string;
  sessionId: string;
  chunk: string;
}): ChatInstruction {
  return {
    header: buildChatHeader({
      type: "instruction",
      namespace: "Template",
      name: "ToastStream",
      requestId: params.requestId,
      sessionId: params.sessionId,
    }),
    payload: JSON.stringify({ stream: params.chunk }),
  };
}

function buildDialogFinishInstruction(params: {
  requestId: string;
  sessionId: string;
  success: boolean;
}): ChatInstruction {
  return {
    header: buildChatHeader({
      type: "instruction",
      namespace: "Dialog",
      name: "Finish",
      requestId: params.requestId,
      sessionId: params.sessionId,
    }),
    payload: JSON.stringify({ success: params.success }),
  };
}

function buildDialogExceptionInstruction(params: {
  requestId: string;
  sessionId: string;
  message: string;
}): ChatInstruction {
  return {
    header: buildChatHeader({
      type: "instruction",
      namespace: "Dialog",
      name: "Exception",
      requestId: params.requestId,
      sessionId: params.sessionId,
    }),
    payload: JSON.stringify({ message: params.message }),
  };
}

async function loadChatHistoryMap(
  ctx: MilocoContext,
): Promise<Record<string, ChatHistoryResponse>> {
  return (
    (await ctx.storage.load<Record<string, ChatHistoryResponse>>(
      "chat",
      "history",
    )) || {}
  );
}

async function saveChatHistoryMap(
  ctx: MilocoContext,
  map: Record<string, ChatHistoryResponse>,
): Promise<void> {
  await ctx.storage.save("chat", "history", map);
}

function ensureChatHistoryResponse(params: {
  sessionId: string;
  existing?: ChatHistoryResponse | null;
  titleSeed?: string;
}): ChatHistoryResponse {
  if (params.existing) return params.existing;
  return {
    session_id: params.sessionId,
    title: params.titleSeed || "",
    timestamp: Date.now(),
    session: { data: [] },
  };
}

function tryExtractNlpQuery(event: ChatEvent): string | null {
  try {
    if (event.header.type !== "event") return null;
    if (event.header.namespace !== "Nlp" || event.header.name !== "Request")
      return null;
    const payload = JSON.parse(event.payload || "{}") as any;
    const q = typeof payload?.query === "string" ? payload.query : "";
    return q || null;
  } catch {
    return null;
  }
}

async function streamAgentText(params: {
  prompt: string;
}): Promise<AsyncIterable<string>> {
  const isTest =
    process.env.NODE_ENV === "test" ||
    !!process.env.VITEST ||
    process.env.MILOCO_HTTP_TEST_ENABLED === "true";

  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  if (isTest || !hasOpenAIKey) {
    async function* gen() {
      const text = params.prompt ? `OK: ${params.prompt}` : "OK";
      for (let i = 0; i < text.length; i += 5) {
        yield text.slice(i, i + 5);
        await new Promise((r) => setTimeout(r, 1));
      }
    }
    return gen();
  }

  const stream = await chatAgent.stream(params.prompt);
  return stream.textStream;
}

class HttpError extends Error {
  status: number;
  code: number;

  constructor(status: number, message: string, code = -1) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function getValidCameraDidSet(
  ctx: MilocoContext,
): Promise<Set<string> | null> {
  try {
    const client = await ctx.loadMiotClient();
    if (!client) return null;
    const devices = client.getDevices();
    const dids = devices.filter(guessIsCamera).map((d) => d.did);
    return new Set(dids);
  } catch {
    return null;
  }
}

async function validateTriggerRule(
  ctx: MilocoContext,
  input: any,
  existingRuleId: string | null,
): Promise<void> {
  const name = String(input?.name || "");
  if (!name) throw new HttpError(400, "name is required", 400);

  if (!Array.isArray(input?.cameras))
    throw new HttpError(400, "cameras is required", 400);
  if (typeof input?.condition !== "string")
    throw new HttpError(400, "condition is required", 400);
  if (!input?.execute_info || typeof input.execute_info !== "object")
    throw new HttpError(400, "execute_info is required", 400);

  const allRules = (await ctx.storage.load<any[]>("trigger", "rules")) || [];
  const duplicate = allRules.find(
    (r) => r && r.name === name && (!existingRuleId || r.id !== existingRuleId),
  );
  if (duplicate)
    throw new HttpError(409, `Trigger rule name '${name}' already exists`, 409);

  const cameras: string[] = input.cameras;
  const validCameraDids = await getValidCameraDidSet(ctx);
  if (validCameraDids) {
    const invalid = cameras.filter((did) => !validCameraDids.has(String(did)));
    if (invalid.length) {
      throw new HttpError(
        400,
        `Invalid camera device IDs: ${invalid.join(", ")}`,
        400,
      );
    }
  }

  const notify = input?.execute_info?.notify;
  if (notify && typeof notify === "object") {
    const content = String((notify as any).content || "");
    if (!content)
      throw new HttpError(400, "Notification content is required", 400);
  }
}

function pushTriggerDynamicLog(ctx: MilocoContext, logId: string, msg: string) {
  const buf = ctx.triggerDynamicLogBuffers.get(logId) || [];
  buf.push(msg);
  if (buf.length > 2000) buf.splice(0, buf.length - 2000);
  ctx.triggerDynamicLogBuffers.set(logId, buf);
  const subs = ctx.triggerDynamicLogSubscribers.get(logId);
  if (!subs) return;
  for (const ws of subs) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    } catch {}
  }
}

const ok = <T>(res: Response, message: string, data?: T): void => {
  const body: NormalResponse<T> = { code: 0, message, data: data ?? null };
  res.json(body);
};

const fail = (
  res: Response,
  status: number,
  message: string,
  code = -1,
): void => {
  const body: NormalResponse = { code, message, data: null };
  res.status(status).json(body);
};

const sha256 = (s: string): string =>
  crypto.createHash("sha256").update(s).digest("hex");

class MilocoContext {
  storage: MIoTStorage;
  jwtSecret: string;
  tokenInvalidAfter: number;
  miotClient: MIoTClient | null;
  cameraManager: MIoTCameraManager | null;
  cameraStreams: Map<string, { stop: () => void }>;
  localMcp: MIoTMcpServer | null;
  localMcpInited: boolean;
  mcpClientManager: McpClientManager;
  triggerDynamicLogBuffers: Map<string, string[]>;
  triggerDynamicLogSubscribers: Map<string, Set<any>>;

  constructor(
    storage: MIoTStorage,
    jwtSecret: string,
    tokenInvalidAfter: number,
  ) {
    this.storage = storage;
    this.jwtSecret = jwtSecret;
    this.tokenInvalidAfter = tokenInvalidAfter;
    this.miotClient = null;
    this.cameraManager = null;
    this.cameraStreams = new Map();
    this.localMcp = null;
    this.localMcpInited = false;
    this.mcpClientManager = new McpClientManager();
    this.triggerDynamicLogBuffers = new Map();
    this.triggerDynamicLogSubscribers = new Map();
  }

  async loadMiotClient(): Promise<MIoTClient | null> {
    if (this.miotClient) return this.miotClient;

    const config = await this.storage.load<MIoTClientOptions>(
      "config",
      "client",
    );
    if (!config) return null;

    const client = new MIoTClient(config);
    await client.init();
    this.miotClient = client;
    return client;
  }

  async ensureMiotClient(): Promise<MIoTClient> {
    const client = await this.loadMiotClient();
    if (!client)
      throw new HttpError(400, "MiOT client not initialized", -10001);
    return client;
  }

  async ensureCameraManager(
    frameInterval?: number,
  ): Promise<MIoTCameraManager> {
    if (this.cameraManager) return this.cameraManager;
    const manager = new MIoTCameraManager(frameInterval);
    await manager.init();
    this.cameraManager = manager;
    return manager;
  }

  async ensureLocalMcp(): Promise<MIoTMcpServer> {
    if (this.localMcp && this.localMcpInited) return this.localMcp;
    const server = new MIoTMcpServer(
      process.env.MILOCO_DATA_PATH || "./.miloco-data",
    );
    await server.init();
    this.localMcp = server;
    this.localMcpInited = true;
    return server;
  }
}

type McpToolInfo = {
  client_id: string;
  tool_name: string;
  description: string;
  parameters?: Record<string, unknown> | null;
  tool_info: unknown;
};

type CallToolResult = {
  success: boolean;
  error_message: string | null;
  response: Record<string, unknown> | null;
};

function normalizeMcpAccessType(input: unknown): string {
  const t = String(input || "").toLowerCase();
  if (t === "stdio") return "stdio";
  if (t === "http_sse" || t === "http-sse" || t === "sse") return "http_sse";
  if (t === "streamable_http" || t === "streamable-http" || t === "http")
    return "streamable_http";
  return t;
}

const LocalMcpClientId = {
  LOCAL_DEFAULT: "local_default",
  MIOT_MANUAL_SCENES: "miot_manual_scenes",
  MIOT_DEVICES: "miot_devices",
  HA_AUTOMATIONS: "ha_automations",
} as const;

type MilocoDeviceInfo = {
  did: string;
  name: string;
  online: boolean;
  model?: string | null;
  icon?: string | null;
  home_name?: string | null;
  room_name?: string | null;
  is_set_pincode?: number | null;
  order_time?: number | null;
};

type MilocoCameraInfo = MilocoDeviceInfo & {
  channel_count?: number | null;
  camera_status?: string | null;
};

function chooseCameraList(
  cameraIds: string[],
  cameraInfoDict: Record<string, MilocoCameraInfo>,
): MilocoCameraInfo[] {
  const list: MilocoCameraInfo[] = [];
  for (const cameraId of cameraIds) {
    const info = cameraInfoDict[cameraId];
    if (info) {
      list.push(info);
      continue;
    }
    list.push({
      did: cameraId,
      name: "Unknown Camera",
      online: false,
      model: null,
      icon: null,
      home_name: "Unknown Home",
      room_name: "Unknown Room",
      is_set_pincode: 0,
      order_time: null,
      channel_count: 0,
      camera_status: null,
    });
  }
  return list;
}

function chooseMcpList(
  mcpIds: string[] | null | undefined,
  allMcpList: Array<{
    client_id: string;
    server_name: string;
    connected: boolean;
  }>,
): Array<{ client_id: string; server_name: string; connected: boolean }> {
  if (!mcpIds || !Array.isArray(mcpIds) || mcpIds.length === 0) return [];
  const dict = new Map(allMcpList.map((c) => [c.client_id, c] as const));
  return mcpIds.map((id) => {
    const v = dict.get(id);
    if (v) return v;
    return { client_id: id, server_name: "Unknown MCP", connected: false };
  });
}

function toMilocoDeviceInfo(device: MIoTDeviceInfo): MilocoDeviceInfo {
  return {
    did: device.did,
    name: device.name,
    online: device.online,
    model: device.model ?? null,
    icon: (device as any).icon ?? null,
    home_name: (device as any).home_name ?? null,
    room_name: (device as any).room_name ?? null,
    is_set_pincode: (device as any).is_set_pincode ?? 0,
    order_time: (device as any).order_time ?? null,
  };
}

function guessIsCamera(device: MIoTDeviceInfo): boolean {
  const model = (device.model || "").toLowerCase();
  const urn = ((device as any).urn || "").toLowerCase();
  return model.includes("camera") || urn.includes("camera");
}

function toCameraInfo(device: MIoTDeviceInfo): MIoTCameraInfo {
  return {
    did: device.did,
    model: device.model,
    name: device.name,
    status: device.online ? "CONNECTED" : "DISCONNECTED",
    channel_count: 1,
    lan_status: !!(device as any).lan_status,
    local_ip: (device as any).local_ip,
    token: (device as any).token || undefined,
    key: (device as any).key || undefined,
    ip: (device as any).local_ip || (device as any).ip || undefined,
  };
}

async function buildContext(): Promise<MilocoContext> {
  const dataPath = process.env.MILOCO_DATA_PATH || "./.miloco-data";
  const storage = new MIoTStorage(dataPath);

  const storedJwtSecret = await storage.load<string>("auth", "jwt_secret");
  const jwtSecret = storedJwtSecret || crypto.randomBytes(32).toString("hex");
  if (!storedJwtSecret) await storage.save("auth", "jwt_secret", jwtSecret);

  const tokenInvalidAfterStored = await storage.load<number>(
    "auth",
    "token_invalid_after",
  );
  const tokenInvalidAfter = tokenInvalidAfterStored || 0;

  const ctx = new MilocoContext(storage, jwtSecret, tokenInvalidAfter);

  const mcpConfigs = (await storage.load<McpConfig[]>("mcp", "configs")) || [];
  for (const c of mcpConfigs) {
    if (!c?.id) continue;
    await ctx.mcpClientManager.upsertAndConnect(c);
  }

  return ctx;
}

function readTokenFromCookie(req: Request): string | null {
  const token = (req.cookies?.access_token as string | undefined) || null;
  return token;
}

function verifyToken(ctx: MilocoContext, req: Request): string {
  const token = readTokenFromCookie(req);
  if (!token)
    throw new HttpError(
      401,
      "Authentication token not found, please login first",
      401,
    );

  let payload: unknown;
  try {
    payload = jwt.verify(token, ctx.jwtSecret);
  } catch {
    throw new HttpError(401, "Invalid authentication token", 401);
  }

  if (!payload || typeof payload !== "object")
    throw new HttpError(401, "Invalid authentication token", 401);

  const sub = (payload as Record<string, unknown>).sub;
  const iat = (payload as Record<string, unknown>).iat;

  if (sub !== "admin" || typeof iat !== "number")
    throw new HttpError(401, "Invalid authentication token", 401);
  if (iat <= ctx.tokenInvalidAfter)
    throw new HttpError(
      401,
      "Authentication token has been invalidated, please login again",
      401,
    );

  return "admin";
}

function requireAuth(ctx: MilocoContext) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      (req as Request & { user?: string }).user = verifyToken(ctx, req);
      next();
    } catch (e) {
      next(e);
    }
  };
}

function setAuthCookie(
  res: Response,
  token: string,
  maxAgeSeconds: number,
): void {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: maxAgeSeconds * 1000,
  });
}

export async function startMilocoHttpServer(): Promise<{
  server: HttpServer;
  port: number;
}> {
  const enabled =
    (process.env.MILOCO_HTTP_ENABLED || "true").toLowerCase() !== "false";
  const isTest = process.env.NODE_ENV === "test" || !!process.env.VITEST;
  const testEnabled =
    (process.env.MILOCO_HTTP_TEST_ENABLED || "false").toLowerCase() === "true";
  if (!enabled || (isTest && !testEnabled))
    return { server: http.createServer(), port: 0 };

  const port = Number(process.env.MILOCO_HTTP_PORT || "8787");
  const ctx = await buildContext();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  const api = express.Router();

  api.post("/auth/register", async (req, res, next) => {
    try {
      const password = String(req.body?.password || "");
      if (!password) throw new HttpError(400, "password is required", 400);

      const existing = await ctx.storage.load<{ salt: string; hash: string }>(
        "auth",
        "admin",
      );
      if (existing) throw new HttpError(400, "Admin already registered", 400);

      const salt = crypto.randomBytes(16).toString("hex");
      const hash = sha256(`${salt}:${password}`);
      await ctx.storage.save("auth", "admin", { salt, hash });

      ok(res, "Admin registration successful", { username: "admin" });
    } catch (e) {
      next(e);
    }
  });

  api.get("/auth/register-status", async (_req, res, next) => {
    try {
      const existing = await ctx.storage.load<{ salt: string; hash: string }>(
        "auth",
        "admin",
      );
      ok(res, existing ? "Admin registered" : "Admin not registered", {
        is_registered: !!existing,
      });
    } catch (e) {
      next(e);
    }
  });

  api.post("/auth/login", async (req, res, next) => {
    try {
      const username = String(req.body?.username || "");
      const password = String(req.body?.password || "");
      if (username !== "admin")
        throw new HttpError(401, "Invalid username or password", 401);

      const existing = await ctx.storage.load<{ salt: string; hash: string }>(
        "auth",
        "admin",
      );
      if (!existing) throw new HttpError(400, "Admin not registered", 400);

      const hash = sha256(`${existing.salt}:${password}`);
      if (hash !== existing.hash)
        throw new HttpError(401, "Invalid username or password", 401);

      const expireMinutes = Number(process.env.JWT_EXPIRES_MINUTES || "1440");
      const iat = Math.floor(Date.now() / 1000);
      const token = jwt.sign({ sub: "admin", iat }, ctx.jwtSecret, {
        expiresIn: `${expireMinutes}m`,
      });
      setAuthCookie(res, token, expireMinutes * 60);
      ok(res, "Login successful", { username: "admin" });
    } catch (e) {
      next(e);
    }
  });

  api.get("/auth/logout", async (_req, res, next) => {
    try {
      const now = Math.floor(Date.now() / 1000);
      ctx.tokenInvalidAfter = now;
      await ctx.storage.save("auth", "token_invalid_after", now);
      res.clearCookie("access_token");
      ok(res, "Logout successful", null);
    } catch (e) {
      next(e);
    }
  });

  api.get("/auth/language", async (_req, res, next) => {
    try {
      const lang = (await ctx.storage.load<string>("auth", "language")) || "zh";
      ok(res, "User language settings retrieved successfully", {
        language: lang,
      });
    } catch (e) {
      next(e);
    }
  });

  api.post("/auth/language", async (req, res, next) => {
    try {
      const language = String(req.body?.language || "");
      if (!["zh", "en"].includes(language))
        throw new HttpError(400, "Invalid language", 400);
      await ctx.storage.save("auth", "language", language);
      ok(res, "User language settings updated successfully", { language });
    } catch (e) {
      next(e);
    }
  });

  api.get("/miot/xiaomi_home_callback", async (req, res, next) => {
    try {
      const code = String(req.query.code || "");
      const state = String(req.query.state || "");

      const config = await ctx.storage.load<MIoTClientOptions>(
        "config",
        "client",
      );
      if (!config) {
        res
          .status(200)
          .type("html")
          .send("<html><body>MiOT client not initialized</body></html>");
        return;
      }

      const client = new MIoTClient(config);
      await client.init();
      await client.getAccessToken(code, state);

      const oauthInfo = await ctx.storage.load("oauth", "info");
      await ctx.storage.save("config", "client", {
        ...config,
        oauthInfo: oauthInfo || config.oauthInfo,
      });

      if (ctx.miotClient) {
        await ctx.miotClient.destroy();
        ctx.miotClient = null;
      }

      res
        .status(200)
        .type("html")
        .send("<html><body>Authorization Successful</body></html>");
    } catch (e) {
      next(e);
    }
  });

  api.get("/miot/login_status", requireAuth(ctx), async (_req, res, next) => {
    try {
      const client = await ctx.loadMiotClient();
      if (!client) {
        ok(res, "Login status checked successfully", {
          is_logged_in: false,
          login_url: null,
        });
        return;
      }

      const oauthInfo = await ctx.storage.load<{ expires_ts?: number }>(
        "oauth",
        "info",
      );
      const expiresTs = oauthInfo?.expires_ts;
      const now = Math.floor(Date.now() / 1000);
      const isLoggedIn = !!expiresTs && expiresTs > now;

      if (!isLoggedIn) {
        const loginUrl = await client.generateAuthUrl();
        ok(res, "Login status checked successfully", {
          is_logged_in: false,
          login_url: loginUrl,
        });
        return;
      }

      ok(res, "Login status checked successfully", { is_logged_in: true });
    } catch (e) {
      next(e);
    }
  });

  api.get("/miot/user_info", requireAuth(ctx), async (_req, res, next) => {
    try {
      const client = await ctx.ensureMiotClient();
      const cloud = (
        client as unknown as {
          cloudClient?: { getUserInfo: () => Promise<unknown> };
        }
      ).cloudClient;
      const user = cloud ? await cloud.getUserInfo() : null;
      ok(res, "MiOT user information retrieved successfully", user);
    } catch (e) {
      next(e);
    }
  });

  api.get("/miot/device_list", requireAuth(ctx), async (_req, res, next) => {
    try {
      const client = await ctx.ensureMiotClient();
      ok(
        res,
        "MiOT device list retrieved successfully",
        client.getDevices().map(toMilocoDeviceInfo),
      );
    } catch (e) {
      next(e);
    }
  });

  api.get("/miot/camera_list", requireAuth(ctx), async (_req, res, next) => {
    try {
      const client = await ctx.ensureMiotClient();
      const devices = client.getDevices();
      const cameras: MilocoCameraInfo[] = devices
        .filter(guessIsCamera)
        .map((d) => ({
          ...toMilocoDeviceInfo(d),
          channel_count: 1,
          camera_status: d.online ? "ONLINE" : "OFFLINE",
        }));

      await ctx.storage.save("miot", "cameras", cameras);

      ok(res, "MiOT camera list retrieved successfully", cameras);
    } catch (e) {
      next(e);
    }
  });

  api.get(
    "/miot/refresh_miot_all_info",
    requireAuth(ctx),
    async (_req, res, next) => {
      try {
        const client = await ctx.ensureMiotClient();

        const devices = client.getDevices();
        await ctx.storage.save(
          "miot",
          "devices",
          devices.map(toMilocoDeviceInfo),
        );

        const scenes = await client.getManualScenes();
        await ctx.storage.save("miot", "scenes", scenes);

        const cameras: MilocoCameraInfo[] = devices
          .filter(guessIsCamera)
          .map((d) => ({
            ...toMilocoDeviceInfo(d),
            channel_count: 1,
            camera_status: d.online ? "ONLINE" : "OFFLINE",
          }));
        await ctx.storage.save("miot", "cameras", cameras);

        ok(res, "MiOT information refresh completed", {
          cameras: true,
          scenes: true,
          user_info: true,
          devices: true,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  api.get(
    "/miot/refresh_miot_cameras",
    requireAuth(ctx),
    async (_req, res, next) => {
      try {
        const client = await ctx.ensureMiotClient();
        const devices = client.getDevices();
        const cameras: MilocoCameraInfo[] = devices
          .filter(guessIsCamera)
          .map((d) => ({
            ...toMilocoDeviceInfo(d),
            channel_count: 1,
            camera_status: d.online ? "ONLINE" : "OFFLINE",
          }));
        await ctx.storage.save("miot", "cameras", cameras);
        ok(res, "MiOT camera information refreshed successfully", {
          count: cameras.length,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  api.get(
    "/miot/refresh_miot_scenes",
    requireAuth(ctx),
    async (_req, res, next) => {
      try {
        const client = await ctx.ensureMiotClient();
        const scenes = await client.getManualScenes();
        await ctx.storage.save("miot", "scenes", scenes);
        ok(res, "MiOT scene information refreshed successfully", {
          count: scenes.length,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  api.get(
    "/miot/refresh_miot_user_info",
    requireAuth(ctx),
    async (_req, res, next) => {
      try {
        const client = await ctx.ensureMiotClient();
        const cloud = (
          client as unknown as {
            cloudClient?: { getUserInfo: () => Promise<unknown> };
          }
        ).cloudClient;
        const user = cloud ? await cloud.getUserInfo() : null;
        await ctx.storage.save("miot", "user_info", user);
        ok(res, "MiOT user information refreshed successfully", user);
      } catch (e) {
        next(e);
      }
    },
  );

  api.get(
    "/miot/refresh_miot_devices",
    requireAuth(ctx),
    async (_req, res, next) => {
      try {
        const client = await ctx.ensureMiotClient();
        const devices = client.getDevices().map(toMilocoDeviceInfo);
        await ctx.storage.save("miot", "devices", devices);
        ok(res, "MiOT device information refreshed successfully", {
          count: devices.length,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  api.get(
    "/miot/miot_scene_actions",
    requireAuth(ctx),
    async (_req, res, next) => {
      try {
        // Strict alignment requires a preset action catalog. For now, expose manual scenes as runnable actions.
        const scenes =
          (await ctx.storage.load<MIoTManualSceneInfo[]>("miot", "scenes")) ||
          [];
        const actions = scenes.map((s) => ({
          mcp_client_id: "miot",
          mcp_tool_name: "miot_run_manual_scene",
          mcp_tool_input: { sceneId: s.scene_id },
          mcp_server_name: "MIoT",
          introduction: `Run scene: ${s.scene_name}`,
        }));
        ok(res, "MiOT scene actions list retrieved successfully", actions);
      } catch (e) {
        next(e);
      }
    },
  );

  api.get("/miot/send_notify", requireAuth(ctx), async (req, res, next) => {
    try {
      const notify = String(req.query.notify || "");
      const client = await ctx.ensureMiotClient();
      await client.sendAppNotify(notify);
      ok(res, "Notification sent successfully", null);
    } catch (e) {
      next(e);
    }
  });

  api.post("/mcp", requireAuth(ctx), async (req, res, next) => {
    try {
      const config = req.body;
      const id = crypto.randomUUID();
      const list = (await ctx.storage.load<any[]>("mcp", "configs")) || [];

      const name = String((config as any)?.name || "");
      if (!name) throw new HttpError(400, "name is required", 400);
      if (list.some((c) => String(c?.name || "") === name)) {
        throw new HttpError(409, "MCP configuration name already exists", 409);
      }

      const accessType = normalizeMcpAccessType((config as any)?.access_type);
      if (accessType === "stdio") {
        if (!String((config as any)?.command || "")) {
          throw new HttpError(
            400,
            "Stdio type must provide command parameter",
            400,
          );
        }
      }
      if (accessType === "http_sse" || accessType === "streamable_http") {
        if (!String((config as any)?.url || "")) {
          throw new HttpError(400, "HTTP type must provide url parameter", 400);
        }
      }

      const nextConfig: McpConfig = {
        ...config,
        id,
        name,
        access_type: accessType as any,
      };
      list.push(nextConfig);
      await ctx.storage.save("mcp", "configs", list);

      const conn = await ctx.mcpClientManager.upsertAndConnect(nextConfig);
      ok(
        res,
        conn.success
          ? "MCP configuration created successfully, connection normal"
          : `MCP configuration created successfully, but connection failed: ${conn.error}`,
        {
          config_id: id,
          connection_success: conn.success,
          connection_error: conn.error,
        },
      );
    } catch (e) {
      next(e);
    }
  });

  api.get("/mcp", requireAuth(ctx), async (_req, res, next) => {
    try {
      const list = (await ctx.storage.load<any[]>("mcp", "configs")) || [];
      ok(res, "MCP configuration list retrieved successfully", {
        configs: list,
        count: list.length,
      });
    } catch (e) {
      next(e);
    }
  });

  api.put("/mcp/:config_id", requireAuth(ctx), async (req, res, next) => {
    try {
      const id = req.params.config_id;
      const list = (await ctx.storage.load<any[]>("mcp", "configs")) || [];
      const idx = list.findIndex((c) => c.id === id);
      if (idx < 0) throw new HttpError(404, "MCP config not found", 404);

      const requestedName = (req.body as any)?.name;
      const name = String((requestedName ?? (list[idx] as any)?.name) || "");
      if (!name) throw new HttpError(400, "name is required", 400);
      if (list.some((c, i) => i !== idx && String(c?.name || "") === name)) {
        throw new HttpError(409, "MCP configuration name already exists", 409);
      }

      const accessType = normalizeMcpAccessType(
        (req.body as any)?.access_type ?? (list[idx] as any)?.access_type,
      );
      const mergedCandidate = {
        ...(list[idx] as any),
        ...(req.body as any),
        id,
        name,
        access_type: accessType,
      };
      if (accessType === "stdio") {
        if (!String((mergedCandidate as any)?.command || "")) {
          throw new HttpError(
            400,
            "Stdio type must provide command parameter",
            400,
          );
        }
      }
      if (accessType === "http_sse" || accessType === "streamable_http") {
        if (!String((mergedCandidate as any)?.url || "")) {
          throw new HttpError(400, "HTTP type must provide url parameter", 400);
        }
      }

      const merged: McpConfig = {
        ...(list[idx] as any),
        ...(req.body as any),
        id,
        name,
        access_type: accessType as any,
      };
      list[idx] = merged;
      await ctx.storage.save("mcp", "configs", list);

      const conn = await ctx.mcpClientManager.upsertAndConnect(merged);
      ok(
        res,
        conn.success
          ? "MCP configuration updated successfully, connection normal"
          : `MCP configuration updated successfully, but connection failed: ${conn.error}`,
        {
          config_id: id,
          connection_success: conn.success,
          connection_error: conn.error,
        },
      );
    } catch (e) {
      next(e);
    }
  });

  api.delete("/mcp/:config_id", requireAuth(ctx), async (req, res, next) => {
    try {
      const id = String(req.params.config_id);
      const list = (await ctx.storage.load<any[]>("mcp", "configs")) || [];
      const idx = list.findIndex((c) => c.id === id);
      if (idx < 0)
        throw new HttpError(404, "MCP configuration does not exist", 404);

      await ctx.storage.save(
        "mcp",
        "configs",
        list.filter((c) => c.id !== id),
      );
      await ctx.mcpClientManager.remove(id);
      ok(res, "MCP configuration deleted successfully", null);
    } catch (e) {
      next(e);
    }
  });

  api.post(
    "/mcp/reconnect/:config_id",
    requireAuth(ctx),
    async (req, res, next) => {
      try {
        const id = String(req.params.config_id);
        const conn = await ctx.mcpClientManager.reconnect(id);
        if (!conn.success && conn.error === "config not found") {
          throw new HttpError(404, "MCP configuration does not exist", 404);
        }
        ok(
          res,
          conn.success
            ? "MCP client reconnected successfully"
            : `MCP client reconnect failed: ${conn.error || "unknown"}`,
          {
            config_id: id,
            connection_success: conn.success,
            connection_error: conn.error,
          },
        );
      } catch (e) {
        next(e);
      }
    },
  );

  api.get("/mcp/clients/status", requireAuth(ctx), async (_req, res, next) => {
    try {
      const local = await ctx.ensureLocalMcp();
      const remote = ctx.mcpClientManager.getStatus();
      const clients = [
        {
          client_id: LocalMcpClientId.LOCAL_DEFAULT,
          server_name: "Local MIoT MCP",
          connected: !!local,
        },
        {
          client_id: LocalMcpClientId.MIOT_MANUAL_SCENES,
          server_name: "Unknown MCP",
          connected: false,
        },
        {
          client_id: LocalMcpClientId.MIOT_DEVICES,
          server_name: "Unknown MCP",
          connected: false,
        },
        {
          client_id: LocalMcpClientId.HA_AUTOMATIONS,
          server_name: "Unknown MCP",
          connected: false,
        },
        ...remote.map((r) => ({
          client_id: r.client_id,
          server_name: r.server_name,
          connected: r.connected,
        })),
      ];
      ok(res, "MCP client status retrieved successfully", {
        count: clients.length,
        clients,
      });
    } catch (e) {
      next(e);
    }
  });

  api.get("/mcp/tools", requireAuth(ctx), async (req, res, next) => {
    try {
      const clientIdsParam =
        typeof req.query.client_ids === "string" ? req.query.client_ids : null;
      const clientIds = clientIdsParam
        ? clientIdsParam
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null;

      const allowLocal =
        clientIds === null ||
        clientIds.includes(LocalMcpClientId.LOCAL_DEFAULT);

      const local = await ctx.ensureLocalMcp();
      const localTools = allowLocal
        ? local.getTools().map((t) => ({
            client_id: LocalMcpClientId.LOCAL_DEFAULT,
            tool_name: t.name,
            description: t.description,
            parameters: ((t as any).parameters ?? null) as any,
            tool_info: {
              name: t.name,
              description: t.description,
              inputSchema: ((t as any).parameters ?? null) as any,
            },
          }))
        : [];

      const remoteTools = await ctx.mcpClientManager.listTools(clientIds);
      const result: McpToolInfo[] = [...localTools, ...(remoteTools as any)];

      ok(
        res,
        `MCP tools retrieved successfully, total ${result.length} tools`,
        {
          tools: result,
          count: result.length,
        },
      );
    } catch (e) {
      next(e);
    }
  });

  api.post("/mcp/call_tool", requireAuth(ctx), async (req, res, next) => {
    try {
      const clientId = String(req.body?.client_id || "");
      const toolName = String(req.body?.tool_name || "");
      const argumentsObj = (req.body?.arguments || {}) as Record<
        string,
        unknown
      >;

      if (!clientId) throw new HttpError(400, "client_id is required", 400);
      if (!toolName) throw new HttpError(400, "tool_name is required", 400);

      if (clientId === LocalMcpClientId.LOCAL_DEFAULT) {
        const local = await ctx.ensureLocalMcp();
        const tool = local.getTools().find((t) => t.name === toolName);
        if (!tool) {
          throw new HttpError(400, "Tool not found", 400);
        }

        try {
          const response = (await tool.handler(argumentsObj)) as any;
          const data: CallToolResult = {
            success: true,
            error_message: null,
            response: (response && typeof response === "object"
              ? response
              : { result: response }) as Record<string, unknown>,
          };
          ok(res, "Tool call completed", data);
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new HttpError(400, msg, 400);
        }
      }

      const result = await ctx.mcpClientManager.callTool({
        client_id: clientId,
        tool_name: toolName,
        arguments: argumentsObj,
      });

      if (!result.success) {
        throw new HttpError(
          400,
          result.error_message || "Tool execution failed",
          400,
        );
      }

      ok(res, "Tool call completed", result);
    } catch (e) {
      next(e);
    }
  });

  api.post("/ha/set_config", requireAuth(ctx), async (req, res, next) => {
    try {
      await ctx.storage.save("ha", "config", req.body);
      ok(res, "Home Assistant configuration set successfully", null);
    } catch (e) {
      next(e);
    }
  });

  api.get("/ha/get_config", requireAuth(ctx), async (_req, res, next) => {
    try {
      const config = await ctx.storage.load<any>("ha", "config");
      ok(
        res,
        config
          ? "Home Assistant configuration retrieved successfully"
          : "Home Assistant configuration not set",
        config,
      );
    } catch (e) {
      next(e);
    }
  });

  api.get("/ha/automations", requireAuth(ctx), async (_req, res, next) => {
    try {
      ok(res, "Home Assistant automation list retrieved successfully", []);
    } catch (e) {
      next(e);
    }
  });

  api.get(
    "/ha/automation_actions",
    requireAuth(ctx),
    async (_req, res, next) => {
      try {
        ok(
          res,
          "Home Assistant automation actions list retrieved successfully",
          [],
        );
      } catch (e) {
        next(e);
      }
    },
  );

  api.get(
    "/ha/refresh_ha_automations",
    requireAuth(ctx),
    async (_req, res, next) => {
      try {
        ok(
          res,
          "Home Assistant automation information refreshed successfully",
          null,
        );
      } catch (e) {
        next(e);
      }
    },
  );

  api.post("/trigger/rule", requireAuth(ctx), async (req, res, next) => {
    try {
      await validateTriggerRule(ctx, req.body, null);
      const ruleId = crypto.randomUUID();
      const list = (await ctx.storage.load<any[]>("trigger", "rules")) || [];
      list.push({ ...req.body, id: ruleId });
      await ctx.storage.save("trigger", "rules", list);
      ok(res, "Trigger rule created successfully", { rule_id: ruleId });
    } catch (e) {
      next(e);
    }
  });

  api.get("/trigger/rules", requireAuth(ctx), async (req, res, next) => {
    try {
      const enabledOnly = String(req.query.enabled_only || "false") === "true";
      const list = (await ctx.storage.load<any[]>("trigger", "rules")) || [];

      const filtered = enabledOnly
        ? list.filter((r) => r.enabled !== false)
        : list;

      let cameraInfoDict: Record<string, MilocoCameraInfo> = {};
      try {
        const client = await ctx.loadMiotClient();
        if (client) {
          const devices = client.getDevices();
          const cameras: MilocoCameraInfo[] = devices
            .filter(guessIsCamera)
            .map((d) => ({
              ...toMilocoDeviceInfo(d),
              channel_count: 1,
              camera_status: d.online ? "CONNECTED" : "DISCONNECTED",
            }));
          cameraInfoDict = Object.fromEntries(cameras.map((c) => [c.did, c]));
        }
      } catch {
        cameraInfoDict = {};
      }

      const remote = ctx.mcpClientManager.getStatus();
      const allMcpList = [
        {
          client_id: LocalMcpClientId.LOCAL_DEFAULT,
          server_name: "Local MIoT MCP",
          connected: true,
        },
        {
          client_id: LocalMcpClientId.MIOT_MANUAL_SCENES,
          server_name: "Unknown MCP",
          connected: false,
        },
        {
          client_id: LocalMcpClientId.MIOT_DEVICES,
          server_name: "Unknown MCP",
          connected: false,
        },
        {
          client_id: LocalMcpClientId.HA_AUTOMATIONS,
          server_name: "Unknown MCP",
          connected: false,
        },
        ...remote.map((r) => ({
          client_id: r.client_id,
          server_name: r.server_name,
          connected: r.connected,
        })),
      ];

      const details = filtered.map((rule) => {
        const cameraIds: string[] = Array.isArray(rule.cameras)
          ? rule.cameras
          : [];
        const executeInfo =
          rule.execute_info && typeof rule.execute_info === "object"
            ? { ...rule.execute_info }
            : {};

        const mcpIds = Array.isArray((executeInfo as any).mcp_list)
          ? ((executeInfo as any).mcp_list as string[])
          : null;
        (executeInfo as any).mcp_list = chooseMcpList(mcpIds, allMcpList);

        return {
          ...rule,
          cameras: chooseCameraList(cameraIds, cameraInfoDict),
          execute_info: executeInfo,
        };
      });

      ok(
        res,
        `Trigger rules retrieved successfully, total ${details.length} records`,
        details,
      );
    } catch (e) {
      next(e);
    }
  });

  api.put(
    "/trigger/rule/:rule_id",
    requireAuth(ctx),
    async (req, res, next) => {
      try {
        const ruleId = String(req.params.rule_id);
        await validateTriggerRule(ctx, { ...req.body, id: ruleId }, ruleId);
        const list = (await ctx.storage.load<any[]>("trigger", "rules")) || [];
        const idx = list.findIndex((r) => r.id === ruleId);
        if (idx < 0) throw new HttpError(404, "Trigger rule not found", 404);
        list[idx] = { ...req.body, id: ruleId };
        await ctx.storage.save("trigger", "rules", list);
        ok(res, "Trigger rule updated successfully", null);
      } catch (e) {
        next(e);
      }
    },
  );

  api.delete(
    "/trigger/rule/:rule_id",
    requireAuth(ctx),
    async (req, res, next) => {
      try {
        const ruleId = req.params.rule_id;
        const list = (await ctx.storage.load<any[]>("trigger", "rules")) || [];
        const idx = list.findIndex((r) => r.id === ruleId);
        if (idx < 0) throw new HttpError(404, "Trigger rule not found", 404);
        await ctx.storage.save(
          "trigger",
          "rules",
          list.filter((r) => r.id !== ruleId),
        );
        ok(res, "Trigger rule deleted successfully", null);
      } catch (e) {
        next(e);
      }
    },
  );

  api.get("/trigger/logs", requireAuth(ctx), async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit || "10"), 1), 500);
      const logs = (await ctx.storage.load<any[]>("trigger", "logs")) || [];
      const recent = logs.slice(-limit).reverse();
      ok(
        res,
        `Trigger rule logs retrieved successfully, total ${logs.length} records`,
        { rule_logs: recent, total_items: logs.length },
      );
    } catch (e) {
      next(e);
    }
  });

  api.post(
    "/trigger/execute_actions",
    requireAuth(ctx),
    async (req, res, next) => {
      try {
        if (!Array.isArray(req.body)) {
          throw new HttpError(400, "Request body must be an array", 400);
        }
        const actions: any[] = req.body;
        const results: boolean[] = [];

        const logId = crypto.randomUUID();
        const startTime = Date.now();

        pushTriggerDynamicLog(
          ctx,
          logId,
          JSON.stringify({ log_id: logId, event: "start", ts: startTime }),
        );

        for (let i = 0; i < actions.length; i++) {
          const action = actions[i] || {};
          const mcpClientId = String(action.mcp_client_id || "");
          const mcpToolName = String(action.mcp_tool_name || "");
          const mcpToolInput =
            action.mcp_tool_input && typeof action.mcp_tool_input === "object"
              ? action.mcp_tool_input
              : {};

          pushTriggerDynamicLog(
            ctx,
            logId,
            JSON.stringify({
              log_id: logId,
              event: "action_start",
              index: i,
              mcp_client_id: mcpClientId,
              mcp_tool_name: mcpToolName,
              ts: Date.now(),
            }),
          );

          try {
            const r = await ctx.mcpClientManager.callTool({
              client_id: mcpClientId,
              tool_name: mcpToolName,
              arguments: mcpToolInput,
            });
            results.push(!!r.success);
            pushTriggerDynamicLog(
              ctx,
              logId,
              JSON.stringify({
                log_id: logId,
                event: "action_end",
                index: i,
                success: !!r.success,
                error_message: r.error_message,
                ts: Date.now(),
              }),
            );
          } catch (e) {
            results.push(false);
            pushTriggerDynamicLog(
              ctx,
              logId,
              JSON.stringify({
                log_id: logId,
                event: "action_end",
                index: i,
                success: false,
                error_message: e instanceof Error ? e.message : String(e),
                ts: Date.now(),
              }),
            );
          }
        }

        pushTriggerDynamicLog(
          ctx,
          logId,
          JSON.stringify({
            log_id: logId,
            event: "finish",
            ts: Date.now(),
          }),
        );

        const logs = (await ctx.storage.load<any[]>("trigger", "logs")) || [];
        logs.push({
          id: logId,
          created_at: Math.floor(startTime / 1000),
          duration_ms: Date.now() - startTime,
          actions,
          results,
        });
        await ctx.storage.save("trigger", "logs", logs);

        ok(
          res,
          `Actions executed, success/total: ${results.filter(Boolean).length}/${results.length}`,
          results,
        );
      } catch (e) {
        next(e);
      }
    },
  );

  api.post("/model", requireAuth(ctx), async (req, res, next) => {
    try {
      const list = (await ctx.storage.load<any[]>("model", "models")) || [];
      const baseUrl = String(req.body?.base_url || "");
      const apiKey = String(req.body?.api_key || "");
      const modelNames: string[] = Array.isArray(req.body?.model_names)
        ? req.body.model_names
        : [];
      const createdIds: string[] = [];
      for (const modelName of modelNames) {
        const id = crypto.randomUUID();
        list.push({
          id,
          base_url: baseUrl,
          api_key: apiKey,
          model_name: modelName,
        });
        createdIds.push(id);
      }
      await ctx.storage.save("model", "models", list);
      ok(res, "Third-party model created successfully", {
        model_id: createdIds[0] || null,
      });
    } catch (e) {
      next(e);
    }
  });

  api.get("/model", requireAuth(ctx), async (_req, res, next) => {
    try {
      const list = (await ctx.storage.load<any[]>("model", "models")) || [];
      const currentModel =
        (await ctx.storage.load<Record<string, string>>(
          "model",
          "current_model",
        )) || {};
      ok(
        res,
        `Third-party models retrieved successfully, total ${list.length} records`,
        {
          models: list.map((m) => ({
            ...m,
            local: false,
            loaded: true,
            estimate_vram_usage: -1,
          })),
          current_model: currentModel,
        },
      );
    } catch (e) {
      next(e);
    }
  });

  api.put("/model/:model_id", requireAuth(ctx), async (req, res, next) => {
    try {
      const id = req.params.model_id;
      const list = (await ctx.storage.load<any[]>("model", "models")) || [];
      const idx = list.findIndex((m) => m.id === id);
      if (idx < 0) throw new HttpError(404, "Model not found", 404);
      list[idx] = { ...list[idx], ...req.body, id };
      await ctx.storage.save("model", "models", list);
      ok(res, "Third-party model updated successfully", null);
    } catch (e) {
      next(e);
    }
  });

  api.delete("/model/:model_id", requireAuth(ctx), async (req, res, next) => {
    try {
      const id = req.params.model_id;
      const list = (await ctx.storage.load<any[]>("model", "models")) || [];
      await ctx.storage.save(
        "model",
        "models",
        list.filter((m) => m.id !== id),
      );
      ok(res, "Third-party model deleted successfully", null);
    } catch (e) {
      next(e);
    }
  });

  api.post(
    "/model/get_vendor_models",
    requireAuth(ctx),
    async (_req, res, next) => {
      try {
        ok(res, "Vendor models retrieved successfully, total 0 models", {
          count: 0,
          models: [],
        });
      } catch (e) {
        next(e);
      }
    },
  );

  api.get(
    "/model/model_purposes",
    requireAuth(ctx),
    async (_req, res, next) => {
      try {
        ok(res, "Model purpose types retrieved successfully", [
          { type: "chat" },
          { type: "vision" },
        ]);
      } catch (e) {
        next(e);
      }
    },
  );

  api.get(
    "/model/set_current_model",
    requireAuth(ctx),
    async (req, res, next) => {
      try {
        const purpose = String(req.query.purpose || "");
        const modelId =
          typeof req.query.model_id === "string" ? req.query.model_id : null;
        const currentModel =
          (await ctx.storage.load<Record<string, string>>(
            "model",
            "current_model",
          )) || {};
        if (modelId) currentModel[purpose] = modelId;
        else delete currentModel[purpose];
        await ctx.storage.save("model", "current_model", currentModel);
        ok(res, "Current model set successfully", null);
      } catch (e) {
        next(e);
      }
    },
  );

  api.post("/model/load", requireAuth(ctx), async (_req, res, next) => {
    try {
      ok(res, "Load/Unload local model successfully", null);
    } catch (e) {
      next(e);
    }
  });

  api.get("/model/get_cuda_info", requireAuth(ctx), async (_req, res, next) => {
    try {
      ok(res, "Get CUDA info successfully", { available: false });
    } catch (e) {
      next(e);
    }
  });

  api.get("/chat/history/search", requireAuth(ctx), async (req, res, next) => {
    try {
      const keyword = String(req.query.keyword || "");
      const map = await loadChatHistoryMap(ctx);
      const list: ChatHistorySimpleInfo[] = Object.values(map)
        .filter((v) => {
          if (!keyword) return true;
          return (
            String(v.title || "").includes(keyword) ||
            JSON.stringify(v.session).includes(keyword)
          );
        })
        .map((h) => ({
          session_id: h.session_id,
          title: h.title,
          timestamp: h.timestamp,
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
      ok(res, "Chat history search completed successfully", list);
    } catch (e) {
      next(e);
    }
  });

  api.get(
    "/chat/history/:session_id",
    requireAuth(ctx),
    async (req, res, next) => {
      try {
        const sessionId = String(req.params.session_id);
        const map = await loadChatHistoryMap(ctx);
        const item = map[sessionId];
        if (!item) throw new HttpError(404, "Chat history does not exist", 404);
        ok(res, "Chat history retrieved successfully", item);
      } catch (e) {
        next(e);
      }
    },
  );

  api.get("/chat/historys", requireAuth(ctx), async (_req, res, next) => {
    try {
      const map = await loadChatHistoryMap(ctx);
      const list: ChatHistorySimpleInfo[] = Object.values(map)
        .map((h) => ({
          session_id: h.session_id,
          title: h.title,
          timestamp: h.timestamp,
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
      ok(res, "Chat history list retrieved successfully", list);
    } catch (e) {
      next(e);
    }
  });

  api.delete(
    "/chat/history/:session_id",
    requireAuth(ctx),
    async (req, res, next) => {
      try {
        const sessionId = String(req.params.session_id);
        const map = await loadChatHistoryMap(ctx);
        if (!map[sessionId])
          throw new HttpError(404, "Chat history does not exist", 404);
        delete map[sessionId];
        await saveChatHistoryMap(ctx, map);
        ok(res, "Chat history deleted successfully", null);
      } catch (e) {
        next(e);
      }
    },
  );

  app.use("/api", api);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      fail(res, err.status, err.message, err.code);
      return;
    }

    const msg = err instanceof Error ? err.message : String(err);
    fail(res, 500, msg, 500);
  });

  const server = http.createServer(app);

  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (ws, request) => {
    const url = new URL(
      request.url || "/",
      `http://${request.headers.host || "localhost"}`,
    );
    const pathname = url.pathname;

    if (pathname === "/api/miot/ws/video_stream") {
      const cameraId = url.searchParams.get("camera_id") || "";
      const channel = Number(url.searchParams.get("channel") || "0");

      const start = async () => {
        const client = await ctx.ensureMiotClient();
        const device = client.getDevice(cameraId);
        if (!device)
          throw new HttpError(404, `Camera not found: ${cameraId}`, 404);

        const cameraInfo = toCameraInfo(device as MIoTDeviceInfo);
        if (!cameraInfo.ip || !cameraInfo.token) {
          throw new HttpError(
            400,
            "Camera missing ip/token; LAN discovery not available",
            400,
          );
        }

        const manager = await ctx.ensureCameraManager();
        const instance = manager.createInstance(cameraInfo);

        await instance.connect();
        instance.startStreaming();

        const onFrame = (frame: {
          data: Buffer;
          timestamp: number;
          isKeyframe: boolean;
          width: number;
          height: number;
        }) => {
          if (ws.readyState !== ws.OPEN) return;
          // Send raw bytes for strict WS stream; client is expected to parse.
          ws.send(frame.data);
        };

        (instance as any).onFrame(onFrame);

        const streamKey = `${cameraId}:${channel}:${Date.now()}`;
        ctx.cameraStreams.set(streamKey, {
          stop: () => {
            try {
              (instance as any).offFrame?.(onFrame);
              instance.stopStreaming();
              instance.disconnect();
            } catch {
              // ignore
            }
            try {
              manager.removeInstance?.(
                (instance as any).getInstanceId?.() || "",
              );
            } catch {
              // ignore
            }
          },
        });

        ws.on("close", () => {
          const s = ctx.cameraStreams.get(streamKey);
          s?.stop();
          ctx.cameraStreams.delete(streamKey);
        });

        if (ws.readyState === ws.OPEN) {
          ws.send(
            JSON.stringify({
              camera_id: cameraId,
              channel,
              status: "connected",
            }),
          );
        }
      };

      start().catch((err) => {
        try {
          ws.send(
            JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        } catch {
          // ignore
        }
        ws.close();
      });
      return;
    }

    if (pathname === "/api/trigger/ws/dynamic_execute_log") {
      const logId = url.searchParams.get("log_id") || "";
      try {
        const stored =
          (await ctx.storage.load<Record<string, any>>(
            "trigger",
            "dynamic_execute_logs",
          )) || {};
        const list = stored[logId];
        if (Array.isArray(list)) {
          for (const item of list) {
            try {
              if (ws.readyState !== WebSocket.OPEN) break;
              ws.send(typeof item === "string" ? item : JSON.stringify(item));
            } catch {}
          }
        }
      } catch {}

      const existing = ctx.triggerDynamicLogBuffers.get(logId) || [];
      for (const msg of existing) {
        try {
          if (ws.readyState !== WebSocket.OPEN) break;
          ws.send(msg);
        } catch {}
      }

      const subs = ctx.triggerDynamicLogSubscribers.get(logId) || new Set();
      subs.add(ws);
      ctx.triggerDynamicLogSubscribers.set(logId, subs);

      ws.on("message", async () => {
        // align with python: accept client messages but ignore
        await new Promise((r) => setTimeout(r, 100));
      });

      ws.on("close", () => {
        const s = ctx.triggerDynamicLogSubscribers.get(logId);
        s?.delete(ws);
        if (s && s.size === 0) ctx.triggerDynamicLogSubscribers.delete(logId);
      });
      return;
    }

    if (pathname === "/api/chat/ws/query") {
      const requestId =
        url.searchParams.get("request_id") || crypto.randomUUID();
      const sessionId =
        url.searchParams.get("session_id") || crypto.randomUUID();

      // Do not block WS setup on storage I/O; persist after handling messages.
      let history = ensureChatHistoryResponse({ sessionId, existing: null });

      ws.on("message", async (data) => {
        const raw = (() => {
          try {
            if (typeof data === "string") return data;
            if (Buffer.isBuffer(data)) return data.toString("utf-8");
            if (Array.isArray(data))
              return Buffer.concat(data).toString("utf-8");
            if (data instanceof ArrayBuffer)
              return Buffer.from(data).toString("utf-8");
            // Fallback for unexpected RawData
            return String(data);
          } catch {
            return "";
          }
        })();
        let event: ChatEvent;
        try {
          const obj = JSON.parse(raw) as any;
          if (!obj || typeof obj !== "object") throw new Error("invalid");
          if (!obj.header || typeof obj.header !== "object")
            throw new Error("header missing");
          if (obj.header.type !== "event") throw new Error("event required");
          if (typeof obj.payload !== "string")
            throw new Error("payload missing");
          event = obj as ChatEvent;
        } catch (e) {
          const ins = buildDialogExceptionInstruction({
            requestId,
            sessionId,
            message: e instanceof Error ? e.message : String(e),
          });
          try {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ins));
          } catch {}
          return;
        }

        // Normalize request_id/session_id to align with URL params, like Python dispatcher.
        event = {
          header: {
            ...event.header,
            request_id: requestId,
            session_id: sessionId,
            timestamp:
              typeof event.header.timestamp === "number"
                ? event.header.timestamp
                : Date.now(),
          },
          payload: event.payload,
        };

        const query = tryExtractNlpQuery(event);
        if (query && !history.title) history.title = query;
        history.session.data.push(event);

        try {
          const iterable = await streamAgentText({ prompt: query || "" });
          for await (const chunk of iterable) {
            const ins = buildToastStreamInstruction({
              requestId,
              sessionId,
              chunk,
            });
            history.session.data.push(ins);
            if (ws.readyState !== WebSocket.OPEN) break;
            ws.send(JSON.stringify(ins));
          }

          const finish = buildDialogFinishInstruction({
            requestId,
            sessionId,
            success: true,
          });
          history.session.data.push(finish);
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(finish));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const ins = buildDialogExceptionInstruction({
            requestId,
            sessionId,
            message: msg,
          });
          const finish = buildDialogFinishInstruction({
            requestId,
            sessionId,
            success: false,
          });
          history.session.data.push(ins);
          history.session.data.push(finish);
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(ins));
              ws.send(JSON.stringify(finish));
            }
          } catch {}
        } finally {
          try {
            const latest = await loadChatHistoryMap(ctx);
            latest[sessionId] = history;
            await saveChatHistoryMap(ctx, latest);
          } catch {}
        }
      });

      return;
    }

    ws.close();
  });

  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "localhost"}`,
      );
      const pathname = url.pathname;
      const isWsPath =
        pathname === "/api/miot/ws/video_stream" ||
        pathname === "/api/trigger/ws/dynamic_execute_log" ||
        pathname === "/api/chat/ws/query";

      if (!isWsPath) {
        socket.destroy();
        return;
      }

      try {
        const cookies = req.headers.cookie || "";
        const tokenMatch = cookies
          .split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("access_token="));
        const token = tokenMatch
          ? decodeURIComponent(tokenMatch.split("=")[1] || "")
          : null;
        if (!token) throw new Error("missing");
        const payload = jwt.verify(token, ctx.jwtSecret) as any;
        if (!payload?.iat || payload.iat <= ctx.tokenInvalidAfter)
          throw new Error("invalidated");
      } catch {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  const actualPort = await new Promise<number>((resolve) => {
    server.listen(port, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") resolve(addr.port);
      else resolve(port);
    });
  });

  return { server, port: actualPort };
}
