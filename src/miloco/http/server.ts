// @ts-nocheck

export { startMilocoHttpServer } from "./server-impl";

/*

export async function startMilocoHttpServer(): Promise<{
  server: HttpServer;
  port: number;
}> {
  const enabled =
    (process.env.MILOCO_HTTP_ENABLED || "true").toLowerCase() !== "false";
  const isTest = process.env.NODE_ENV === "test" || !!process.env.VITEST;
  if (!enabled || isTest) {
    return { server: http.createServer(), port: 0 };
  }

  const port = Number(process.env.MILOCO_HTTP_PORT || "8787");
  const ctx = await buildContext();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  const api = express.Router();

  // ... (rest of the code remains the same)

  api.get("/miot/camera_list", requireAuth(ctx), async (_req, res, next) => {
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
      list.push({ ...config, id });
      await ctx.storage.save("mcp", "configs", list);
      ok(res, "MCP configuration created successfully, connection normal", {
        config_id: id,
        connection_success: true,
        connection_error: null,
      });
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
      list[idx] = { ...list[idx], ...req.body, id };
      await ctx.storage.save("mcp", "configs", list);
      ok(res, "MCP configuration updated successfully, connection normal", {
        config_id: id,
        connection_success: true,
        connection_error: null,
      });
    } catch (e) {
      next(e);
    }
  });

  api.delete("/mcp/:config_id", requireAuth(ctx), async (req, res, next) => {
    try {
      const id = req.params.config_id;
      const list = (await ctx.storage.load<any[]>("mcp", "configs")) || [];
      const nextList = list.filter((c) => c.id !== id);
      await ctx.storage.save("mcp", "configs", nextList);
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
        const id = req.params.config_id;
        ok(res, "MCP client reconnected successfully", {
          config_id: id,
          connection_success: true,
          connection_error: null,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  api.get("/mcp/clients/status", requireAuth(ctx), async (_req, res, next) => {
    try {
      ok(res, "MCP client status retrieved successfully", { clients: [] });
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
      ok(
        res,
        `Trigger rules retrieved successfully, total ${filtered.length} records`,
        filtered,
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
        const ruleId = req.params.rule_id;
        const list = (await ctx.storage.load<any[]>("trigger", "rules")) || [];
        const idx = list.findIndex((r) => r.id === ruleId);
        if (idx < 0) throw new HttpError(404, "Trigger rule not found", 404);
        list[idx] = { ...list[idx], ...req.body, id: ruleId };
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
        const nextList = list.filter((r) => r.id !== ruleId);
        await ctx.storage.save("trigger", "rules", nextList);
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
        {
          rule_logs: recent,
          total_items: logs.length,
        },
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
        const actions = Array.isArray(req.body) ? req.body : [];
        ok(
          res,
          `Actions executed, success/total: ${actions.length}/${actions.length}`,
          actions.map(() => true),
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
    async (req, res, next) => {
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

  api.get(
    "/chat/history/:session_id",
    requireAuth(ctx),
    async (req, res, next) => {
      try {
        const sessionId = String(req.params.session_id);
        const map =
          (await ctx.storage.load<Record<string, any>>("chat", "history")) ||
          {};
        ok(res, "Chat history retrieved successfully", map[sessionId] || null);
      } catch (e) {
        next(e);
      }
    },
  );

  api.get("/chat/historys", requireAuth(ctx), async (_req, res, next) => {
    try {
      const map =
        (await ctx.storage.load<Record<string, any>>("chat", "history")) || {};
      const list = Object.entries(map).map(([session_id, value]) => ({
        session_id,
        ...value,
      }));
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
        const map =
          (await ctx.storage.load<Record<string, any>>("chat", "history")) ||
          {};
        delete map[sessionId];
        await ctx.storage.save("chat", "history", map);
        ok(res, "Chat history deleted successfully", null);
      } catch (e) {
        next(e);
      }
    },
  );

  api.get("/chat/history/search", requireAuth(ctx), async (req, res, next) => {
    try {
      const keyword = String(req.query.keyword || "");
      const map =
        (await ctx.storage.load<Record<string, any>>("chat", "history")) || {};
      const list = Object.values(map).filter((v) =>
        JSON.stringify(v).includes(keyword),
      );
      ok(res, "Chat history search completed successfully", list);
    } catch (e) {
      next(e);
    }
  });

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

  wss.on("connection", (ws, request) => {
    const url = new URL(
      request.url || "/",
      `http://${request.headers.host || "localhost"}`,
    );
    const pathname = url.pathname;

    if (pathname === "/api/miot/ws/video_stream") {
      const cameraId = url.searchParams.get("camera_id") || "";
      const channel = Number(url.searchParams.get("channel") || "0");
      ws.send(
        JSON.stringify({ camera_id: cameraId, channel, status: "connected" }),
      );
      const timer = setInterval(() => {
        if (ws.readyState !== ws.OPEN) return;
        ws.send(JSON.stringify({ type: "keepalive", ts: Date.now() }));
      }, 1000);
      ws.on("close", () => clearInterval(timer));
      return;
    }

    if (pathname === "/api/trigger/ws/dynamic_execute_log") {
      const logId = url.searchParams.get("log_id") || "";
      ws.send(JSON.stringify({ log_id: logId, message: "connected" }));
      const timer = setInterval(() => {
        if (ws.readyState !== ws.OPEN) return;
        ws.send(JSON.stringify({ log_id: logId, message: "running" }));
      }, 500);
      ws.on("close", () => clearInterval(timer));
      return;
    }

    if (pathname === "/api/chat/ws/query") {
      const requestId = url.searchParams.get("request_id") || "";
      ws.send(JSON.stringify({ request_id: requestId, event: "connected" }));
      ws.on("message", async (data) => {
        const text = data.toString("utf-8");
        ws.send(JSON.stringify({ request_id: requestId, echo: text }));
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

  await new Promise<void>((resolve) => {
    server.listen(port, () => resolve());
  });

  return { server, port };
}

*/
