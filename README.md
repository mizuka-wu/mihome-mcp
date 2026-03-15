# mihome-mcp

Welcome to your new [Mastra](https://mastra.ai/) project! We're excited to see what you'll build.

## Miloco 兼容服务（实现说明）

本项目在 Mastra Studio（默认端口 `4111`）之外，额外启动了一个 **miloco_server 风格的兼容 HTTP/WS 服务**（默认端口 `8787`），用于对齐 `xiaomi-miloco/miloco_server` 的接口形态（`/api/*` + `NormalResponse{code,message,data}`）并复用本仓库的 `src/miot_kit`。

### 如何运行

- **开发启动**

```shell
pnpm run dev
```

- **访问**

Mastra Studio:

`http://localhost:4111`

Miloco 兼容 API:

`http://localhost:8787/api`

### 环境变量

- `MILOCO_HTTP_ENABLED`
  - 默认 `true`
  - 设为 `false` 则不启动兼容服务
- `MILOCO_HTTP_PORT`
  - 默认 `8787`
- `MILOCO_DATA_PATH`
  - 默认 `./.miloco-data`
  - 用于保存 auth/miot/mcp/trigger/chat/model 等模块的本地数据（json 文件）
- `JWT_EXPIRES_MINUTES`
  - 默认 `1440`

### 接口概览（/api 前缀）

#### Auth

- `POST /auth/register`
- `GET /auth/register-status`
- `POST /auth/login`
- `GET /auth/logout`
- `GET /auth/language`
- `POST /auth/language`

说明：

- 认证方式为 Cookie `access_token`（JWT）。
- `logout` 会更新全局 invalidation 时间戳，使所有旧 token 失效（对齐 miloco_server 行为）。

#### MiOT

- `GET /miot/xiaomi_home_callback?code&state`（HTML）
- `GET /miot/login_status`
- `GET /miot/user_info`
- `GET /miot/device_list`
- `GET /miot/camera_list`
- `GET /miot/refresh_miot_all_info`
- `GET /miot/refresh_miot_cameras`
- `GET /miot/refresh_miot_scenes`
- `GET /miot/refresh_miot_user_info`
- `GET /miot/refresh_miot_devices`
- `GET /miot/miot_scene_actions`
- `GET /miot/send_notify?notify=...`
- `WS /miot/ws/video_stream?camera_id=...&channel=...`

说明：

- `/device_list`、`/camera_list` 已对接 `MIoTClient.getDevices()` 并做了字段适配。
- `/refresh_*` 会将数据缓存到 `MILOCO_DATA_PATH` 下的 json 文件。
- `video_stream` WS 已接入 `miot_kit/camera.ts` 的帧回调，当前直接推送二进制帧数据。

#### MCP

- `POST /mcp`
- `GET /mcp`
- `PUT /mcp/:config_id`
- `DELETE /mcp/:config_id`
- `POST /mcp/reconnect/:config_id`
- `GET /mcp/clients/status`

#### HA

- `POST /ha/set_config`
- `GET /ha/get_config`
- `GET /ha/automations`
- `GET /ha/automation_actions`
- `GET /ha/refresh_ha_automations`

#### Trigger

- `POST /trigger/rule`
- `GET /trigger/rules?enabled_only=`
- `PUT /trigger/rule/:rule_id`
- `DELETE /trigger/rule/:rule_id`
- `GET /trigger/logs?limit=`
- `POST /trigger/execute_actions`
- `WS /trigger/ws/dynamic_execute_log?log_id=...`

#### Model

- `POST /model`
- `GET /model`
- `PUT /model/:model_id`
- `DELETE /model/:model_id`
- `POST /model/get_vendor_models`
- `GET /model/model_purposes`
- `GET /model/set_current_model?purpose=...&model_id=...`
- `POST /model/load`
- `GET /model/get_cuda_info`

#### Chat

- `WS /chat/ws/query?request_id=...&session_id=...`
- `GET /chat/history/:session_id`
- `GET /chat/historys`
- `DELETE /chat/history/:session_id`
- `GET /chat/history/search?keyword=...`

### 目前已实现的功能（概述）

- **HTTP/WS 兼容层**
  - Express + ws
  - `NormalResponse` 返回结构
  - JWT Cookie 鉴权与全局 invalidation
- **MiOT 基础能力**
  - OAuth2 callback 的最小落地
  - devices/scenes/cameras 的拉取与本地缓存
  - notify 发送
  - video_stream WS：已接入 `MIoTCameraManager` 推送帧数据

### 遗留部分（需要继续严格对齐）

以下内容当前为“接口存在但内部尚未完全对齐 miloco_server 的真实业务逻辑/数据来源”，后续会逐步补齐：

- **MiOT 摄像头连接信息来源**
  - `video_stream` 需要 `ip/token/key` 等信息。
  - 当前仅在设备数据中存在这些字段时可用；后续需要补齐 LAN/mDNS 发现与 did 关联，或引入 miloco_server 等价的获取/存储链路。
- **MCP 真连接与 tool 执行链路**
  - 当前 MCP 仅完成配置 CRUD 与状态占位。
  - 需要实现：连接外部 MCP server、列 tools、call tool，并形成 tool executor（对齐 miloco_server `mcp_client_manager`/`tool_executor`）。
- **Trigger execute_actions 真执行与 WS 日志**
  - 当前执行结果为占位。
  - 需要对接 tool executor + 动态日志推送。
- **Chat WS query 的 agent/模型流式输出**
  - 当前为 echo/占位。
  - 需要对接 Mastra Agent stream，并落盘 history。
- **Model vendor models 拉取与目的场景联动**
  - 当前 vendor models 为占位。
  - 需要对接真实 OpenAI-compatible API 并与 chat/trigger 使用同一套模型选择逻辑。

## Getting Started

Start the development server:

```shell
pnpm run dev
```

Open [http://localhost:4111](http://localhost:4111) in your browser to access [Mastra Studio](https://mastra.ai/docs/getting-started/studio). It provides an interactive UI for building and testing your agents, along with a REST API that exposes your Mastra application as a local service. This lets you start building without worrying about integration right away.

You can start editing files inside the `src/mastra` directory. The development server will automatically reload whenever you make changes.

## Learn more

To learn more about Mastra, visit our [documentation](https://mastra.ai/docs/). Your bootstrapped project includes example code for [agents](https://mastra.ai/docs/agents/overview), [tools](https://mastra.ai/docs/agents/using-tools), [workflows](https://mastra.ai/docs/workflows/overview), [scorers](https://mastra.ai/docs/evals/overview), and [observability](https://mastra.ai/docs/observability/overview).

If you're new to AI agents, check out our [course](https://mastra.ai/course) and [YouTube videos](https://youtube.com/@mastra-ai). You can also join our [Discord](https://discord.gg/BTYqqHKUrf) community to get help and share your projects.

## Deploy on Mastra Cloud

[Mastra Cloud](https://cloud.mastra.ai/) gives you a serverless agent environment with atomic deployments. Access your agents from anywhere and monitor performance. Make sure they don't go off the rails with evals and tracing.

Check out the [deployment guide](https://mastra.ai/docs/deployment/overview) for more details.
