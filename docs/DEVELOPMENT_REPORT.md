# 🚀 Rclone MCP Server 重构开发报告

本报告详细记录了针对 `rclone-mcp` 服务进行的轻量重构开发工作与落地成果。

---

## 📅 项目概述

依据 **[RCLONE_MCP_DESIGN.md](./RCLONE_MCP_DESIGN.md)** 的设计要求，我们对 `rclone-mcp` 进行了重构，通过精简默认工具、隔离敏感操作、加入异步参数支持及补充 MCP Resources，大幅缩减了 AI 上下文开销，并提升了安全防护水平。

---

## 🛠️ 重构核心改动说明

### 1. 工具集精简与敏感隔离
- **目标文件**：[`src/tools/toolsets.ts`](../src/tools/toolsets.ts)
- **改动详情**：
  - **默认开启工具集** 仅限制为：`core`、`config_read` 与 `operations`。
  - **路径映射精细化**：
    - `/operations/list` -> `operations` (映射为 `rclone_lsjson`)
    - `/operations/stat` -> `operations` (映射为 `operations_stat`)
    - `/operations/size` -> `operations` (映射为 `operations_size`)
    - `/operations/copyfile` -> `operations` (映射为 `operations_copyfile`)
    - `/operations/movefile` -> `operations` (映射为 `operations_movefile`)
    - `/operations/mkdir` -> `operations` (映射为 `operations_mkdir`)
    - `/operations/deletefile` -> `operations` (映射为 `operations_deletefile`)
    - `/config/listremotes` -> `config_read`
    - `/config/get` -> `config_read`
    - `/core/version` -> `core`
    - `/core/stats` -> `core`
    - `/operations/about` -> `core` (映射为 `core_about`)
  - **独立隔离公网外链**：单独提取 `/operations/publiclink` 并置于 `sharing` 分组，默认关闭 (`default: false`)，避免 AI 误操作导致文件泄露。
  - **其他扩展工具集归类**：`sync`、`jobs`、`config_admin`、`operations_advanced`、`mount`、`serve`、`core_advanced` 等均被归为非默认工具，默认关闭，降低模型幻觉。

### 2. 工具命名定制与异步参数注入
- **目标文件**：[`src/tools/registry.ts`](../src/tools/registry.ts)
- **改动详情**：
  - 重写了工具命名机制，对核心操作执行名称重写（如 `/operations/list` 重写为 `rclone_lsjson`，`/operations/about` 重写为 `core_about`）。
  - 对耗时操作（`sync_sync`、`operations_size` 等）动态注入了 `_async: z.boolean().optional()` 参数，并在 description 提示词中明确提醒模型在预估大文件传输时开启 `_async: true` 并在后台异步轮询，规避 MCP 连接超时导致的断连问题。

### 3. MCP Resources 完整支持
- **目标文件**：[`src/server.ts`](../src/server.ts)
- **改动详情**：
  - **静态资源注册**：
    - `rclone://remotes`：查看节点列表。
    - `rclone://config/dump`：全量配置脱敏镜像（自动剔除/混淆 `pass`、`password`、`token`、`secret`、`key`、`auth` 等敏感字段）。
    - `rclone://core/version`：系统版本与引擎版本。
    - `rclone://core/stats`：实时网络传输监控。
    - `rclone://jobs/active`：活动后台任务列表。
  - **动态资源模板注册**：
    - `rclone://{remote}/{+path}`：
      - 利用 `/operations/stat` 自适应判断路径类型。
      - 如果是目录，直接调用 `/operations/list` 并以 JSON 格式返回子节点信息。
      - 如果是文件，通过 `/config/paths` 动态寻找守护进程当前引用的配置文件，利用 `core/command cat` 附带 `--config` 参数读取内容。当检测为二进制文件或大小超过 1MB 时，仅返回文件元数据。

---

## 🔍 验证结果汇总

我们启动了本地的 `rclone rcd` 守护进程进行了全链路测试，验证指标完全合格：
1. **项目构建与编译**：`npm run build` 和 `npm run check` 均一次性通过。
2. **代码规范检测**：`npm run lint` 经 Biome 调整后无任何格式及代码异味错误。
3. **工具精简验证**：默认情况下工具总数由 **55 个** 缩减到了 **12 个**，完美实现了“轻量化”暴露，消除了冗余上下文。
4. **资源订阅验证**：
   - 静态资源调用正常，成功获取脱敏配置信息并屏蔽了敏感字段。
   - 动态资源路径测试读取 `RCLONE_MCP_DESIGN.md` 文本内容获取成功。

---

## 📝 Git 提交信息

- **提交分支**：`main`
- **提交账号**：`angenge`
- **匿名邮箱**：`noreply@users.noreply.github.com`
- **提交哈希**：`2914f1837cba4f29b94dc044c80d0346dca5165c`
- **提交信息**：`Refactor toolsets, restrict default tools, support _async query param, and implement MCP Resources`
