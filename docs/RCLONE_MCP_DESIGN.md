# 🚀 Rclone MCP Server 架构设计与重构方案指南

本文档基于 **[Rclone 官方命令规范](https://rclone.org/commands/) (v1.75.0)** 以及对开源项目 **`rclone-mcp`** 的深入剖析，制定了针对现有开源项目进行轻量重构的完整落地方案，并包含了全量工具映射与参考资料。

---

## 📌 目录
1. [参考资料与官方文档对齐](#1-参考资料与官方文档对齐)
2. [重构决策：为什么选择重构而非重写](#2-重构决策为什么选择重构而非重写)
3. [核心重构点说明](#3-核心重构点说明)
4. [系统整体架构](#4-系统整体架构)
5. [全量工具集 (Tools) 映射详解](#5-全量工具集-tools-映射详解)
   - [5.1 常用高频工具集 (默认开启 `default: true`)](#51-常用高频工具集-默认开启-default-true)
   - [5.2 可选扩展工具集 (默认关闭 `default: false`)](#52-可选扩展工具集-默认关闭-default-false)
6. [官方 CLI 命令 vs MCP 工具 1:1 对照表](#6-官方-cli-命令-vs-mcp-工具-11-对照表)
7. [可查询资源 (MCP Resources) 清单设计](#7-可查询资源-mcp-resources-清单设计)
8. [安全防护与风险控制](#8-安全防护与风险控制)
9. [本地开发与部署实践](#9-本地开发与部署实践)

---

## 1. 参考资料与官方文档对齐

* **Rclone 官方命令索引文档**：[https://rclone.org/commands/](https://rclone.org/commands/)
* **Rclone 远程控制 (RC API) 规范**：[https://rclone.org/rc/](https://rclone.org/rc/)
* **OpenAPI 规范规范包**：`rclone-openapi` (v1.73+)
* **MCP 官方协议规范**：[Model Context Protocol Specification](https://modelcontextprotocol.io/)

> **说明**：Rclone 官方 CLI 命令（用于终端手敲）与 RC API（用于 `rclone-mcp` 服务）在底层逻辑上是 100% 完全等价且功能一致的，本架构文档将两者建立了完整的 1:1 映射规则。

---

## 2. 重构决策：为什么选择重构而非重写？

在评价“从零编写”与“基于 `rclone-mcp` 开源项目重构”时，重构方案具备压倒性的工程优势：

| 评价维度 | 从零重新手写一套 | **重构现有的 `rclone-mcp` (推荐)** |
| :--- | :--- | :--- |
| **开发工作量** | 需手写 50+ 个工具的 Zod Schema，几千行样板代码，需数周 | **仅需修改 `src/tools/toolsets.ts` 几十行配置代码（10分钟）** |
| **API 跟随能力** | Rclone 新增功能或参数修改时，需手动重写 Schema | **自动基于 `rclone-openapi` 解析，随官方升级自动适配** |
| **基础架构成熟度** | 需从头搭建 `stdio` / `http` 传输、命令行解析、错误捕获 | **基础设施完全现成且经过社区验证** |
| **LLM 工具精准度** | 需不断调优描述 | **精简重构后，默认工具由 55 个降至 12 个，完美消除幻觉** |

---

## 3. 核心重构点说明

针对原开源项目“工具曝光过多（~55个默认工具）、敏感功能未隔离”的缺陷，本次重构实施了以下 **3 大核心改进**：

### 🎯 重构点 1：拆分并精简“常用默认工具集”
* **旧版痛点**：默认将整个 `/operations/` 下近 30 个 API 全部注册，占用大量 Prompt Context 额度。
* **重构方案**：将常用高频工具（`list`, `stat`, `size`, `copyfile`, `movefile`, `mkdir`, `deletefile`）提炼为默认集，工具数量缩减约 70%，大幅提高 LLM 工具选择的准确率。

### 🔒 重构点 2：剥离外链分享命令 (`sharing` 独立隔离)
* **旧版痛点**：生成公网外链的 `operations/publiclink`（`rclone link`）默认处于开启状态，存在隐秘文件误外泄的安全风险。
* **重构方案**：在路由匹配的前端拦截 `/operations/publiclink`，将其独立为 `sharing` 工具集，并标记为 `default: false`（默认关闭）。只有用户在环境变量中显式配置 `RCLONE_TOOLSETS=default,sharing` 时才开启。

### 🧩 重构点 3：按场景解耦可选工具集 (`optionals`)
* 划分出 `sync`（大规模目录增量同步）、`jobs`（长时传输异步监控）、`config_admin`（网盘节点创建/删除）、`mount`（本地挂载）等模块，做到真正的“按需引入”。

---

## 4. 系统整体架构

Rclone MCP 服务采用 **MCP Client <-> MCP Server <-> Rclone Daemon (RC)** 架构：

```
+-------------------------------------------------------------------+
|                    AI 客户端 (Claude / Cursor / Antigravity)        |
+-----------------------------------+-------------------------------+
                                    | MCP Protocol (stdio / HTTP)
                                    v
+-------------------------------------------------------------------+
|               rclone-mcp Server (精简重构版)                        |
|  +-------------------+  +-------------------+  +----------------+ |
|  |   Tools Registry  |  | Resources Provider|  | Prompts Engine | |
|  +---------+---------+  +---------+---------+  +-------+--------+ |
+------------|----------------------|-------------------|-----------+
             | (OpenAPI SDK)        |                   |
             +----------------------+-------------------+
                                    v (HTTP REST / JSON-RPC)
+-------------------------------------------------------------------+
|               rclone rcd 守护进程 (v1.75.0 引擎)                   |
|               (读取本地配置 rclone.conf 并建立网络连接)               |
+-----------------------------------+-------------------------------+
                                    v
+-------------------------------------------------------------------+
|      云端/本地存储节点 (Google Drive, S3, OneDrive, SFTP, Alias等) |
+-------------------------------------------------------------------+
```

---

## 5. 全量工具集 (Tools) 映射详解

### 5.1 常用高频工具集 (默认开启 `default: true`)

默认开启的工具控制在 **12 个核心工具**，覆盖日常 90% 以上的查询与单文件操作需求：

| 模块名 | 工具名称 (`Tool Name`) | 对应 Rclone API / 命令 | 功能详细说明 |
| :--- | :--- | :--- | :--- |
| **`operations`** | `rclone_lsjson` | `operations/list` | 以 JSON 格式递归/非递归列出文件与目录属性（包含大小、修改时间、MIME等），**AI 探索网盘最推荐工具**。 |
| | `operations_stat` | `operations/stat` | 查询单文件或单目录的详细元数据信息。 |
| | `operations_size` | `operations/size` | 统计指定 Remote 路径下的总文件数量与总磁盘占用字节数。 |
| | `operations_copyfile` | `operations/copyfile` | 复制单文件或目录到目标位置（自动跳过未修改的文件）。 |
| | `operations_movefile` | `operations/movefile` | 移动单文件或目录（传输完成后自动删除源端文件）。 |
| | `operations_mkdir` | `operations/mkdir` | 在 Remote 上创建新的目录（如果已存在则忽略）。 |
| | `operations_deletefile`| `operations/deletefile`| 删除指定路径下的单文件。 |
| **`config_read`** | `config_listremotes` | `config/listremotes` | 列出当前 `rclone.conf` 配置文件中已存在的所有 Remote 网盘名称。 |
| | `config_get` | `config/get` | 获取指定 Remote 节点的配置参数选项。 |
| **`core`** | `core_about` | `core/about` | 查询云存储账号的可用容量、已用空间与配额总限额。 |
| | `core_version` | `core/version` | 查询当前运行的 Rclone 引擎版本号、GO 版本及操作系统架构。 |
| | `core_stats` | `core/stats` | 查询当前系统全局的实时网络传输速率、已传流量及并发任务数。 |

---

### 5.2 可选扩展工具集 (默认关闭 `default: false`)

可通过环境变量如 `RCLONE_TOOLSETS=default,jobs,sharing` 选择性开启：

#### 🔗 1. 外链分享工具集 (`sharing`)
* **`operations_publiclink`** (`operations/publiclink` / `rclone link`)
  * **功能**：生成指定文件或文件夹的公网分享外链 URL（如 Supported backends）。
  * **安全说明**：为防止 AI 误操作导致隐秘文件公网外泄，默认强行隔离为非默认工具。

#### 🔄 2. 大规模同步与批量传输工具集 (`sync`)
* **`sync_sync`** (`sync/sync`): 单向增量同步（使目标路径与源路径完全一致，**会删除目标端多余文件**，支持异步模式）。
* **`sync_bisync`** (`sync/bisync`): 针对双向同步节点的增量双向同步。
* **`sync_copy`** (`sync/copy`): 大规模目录级的批量递归复制。
* **`sync_move`** (`sync/move`): 大规模目录级的批量递归移动。
  * > **注意**：当前 `rclone-openapi` spec 中不存在独立的 `/sync/resync` 端点（`sync_resync` 不会被注册）。`bisync` 的强制重新基准化通过 `sync_bisync` 的 `resync` 参数实现。

#### ⏱️ 3. 异步任务控制工具集 (`jobs`)
* **`job_status`** (`job/status`): 传入 `jobid` 轮询后台大文件传输/同步任务的实时完成百分比、传输速率及错误日志。
* **`job_stop`** (`job/stop`): 强制中断或取消正在运行的后台传输 Job。
* **`job_stopgroup`** (`job/stopgroup`): 停止指定 `group` 下的所有后台任务。
* **`job_list`** (`job/list`): 获取当前系统中所有活跃和最近完成的 Job ID 列表。
* **`job_batch`** (`job/batch`): 批量执行多个 rc 命令。

#### ⚙️ 4. 配置与节点变更工具集 (`config_admin`)
* **`config_create`** (`config/create`): 动态创建新的云存储 Remote 配置（如新增 S3 或 WebDAV）。
* **`config_update`** (`config/update`): 动态修改现有的 Remote 参数。
* **`config_delete`** (`config/delete`): 物理删除现有的 Remote 配置节点。
* **`config_password`** (`config/password`): 修改存储节点的加密密码。

#### 🛠️ 5. 高阶文件管理工具集 (`operations_advanced`)
* **`operations_purge`** (`operations/purge`): 级联清空并物理删除整个目录及其下的所有子文件与子目录（危险操作）。
* **`operations_delete`** (`operations/delete`): 按条件或过滤器批量删除文件。
* **`operations_rmdir` / `operations_rmdirs`** (`operations/rmdir` / `rmdirs`): 删除空目录 / 批量递归清理空目录。
* **`operations_copyurl`** (`operations/copyurl`): 将 HTTP/HTTPS 远程外链文件直接下载转存至指定 Remote。
* **`operations_check`** (`operations/check`): 校验源与目标的数据 MD5/SHA1 哈希及一致性。
* **`operations_cleanup`** (`operations/cleanup`): 清空云存储网盘的回收站/垃圾桶。
* **`operations_fsinfo`** (`operations/fsinfo`): 查询 Remote 所在文件系统的特性、哈希支持类型及文件名长度限制。
* **`operations_hashsum` / `operations_hashsumfile`** (`operations/hashsum` / `hashsumfile`): 计算并返回文件/目录的哈希值。
* **`operations_settier` / `operations_settierfile`** (`operations/settier` / `settierfile`): 设置存储节点或文件的存储级别（如热/冷存储）。
* **`operations_uploadfile`** (`operations/uploadfile`): 以 multipart 方式上传本地文件到指定 Remote 路径。

#### 💾 6. 本地挂载工具集 (`mount`)
* **`mount_mount`** (`mount/mount`): 调用 FUSE / WinFsp 将远端 Remote 挂载为本地虚拟磁盘。
* **`mount_unmount`** (`mount/unmount`): 卸载已挂载的虚拟磁盘。
* **`mount_unmountall`** (`mount/unmountall`): 卸载当前所有已挂载的虚拟磁盘。
* **`mount_listmounts`** (`mount/listmounts`): 查询当前所有活跃的磁盘挂载点。
* **`mount_types`** (`mount/types`): 列出当前环境下可用的挂载实现类型。

#### 🌐 7. 网络协议服务工具集 (`serve`)
* **`serve_list`** (`serve/list`): 列出当前所有运行中的服务实例。
* **`serve_start`** (`serve/start`): 启动一个服务实例（参数中指定协议，如 `webdav` / `sftp` / `http` 等）。
* **`serve_stop`** (`serve/stop`): 停止指定服务实例。
* **`serve_stopall`** (`serve/stopall`): 停止所有服务实例。
* **`serve_types`** (`serve/types`): 列出可用的服务协议类型。

---

## 6. 官方 CLI 命令 vs MCP 工具 1:1 对照表

| 官方 CLI 命令 ([https://rclone.org/commands/](https://rclone.org/commands/)) | `rclone-mcp` 对应的 Tool 名称 | 所属工具集 |
| :--- | :--- | :--- |
| `rclone lsjson` | `rclone_lsjson` | `operations` (默认) |
| `rclone copy` / `copyto` | `operations_copyfile` / `sync_copy` | `operations` / `sync` |
| `rclone move` / `moveto` | `operations_movefile` / `sync_move` | `operations` / `sync` |
| `rclone sync` | `sync_sync` | `sync` (可选) |
| `rclone bisync` | `sync_bisync` | `sync` (可选) |
| `rclone about` | `core_about` | `core` (默认) |
| `rclone size` | `operations_size` | `operations` (默认) |
| `rclone link` | `operations_publiclink` | `sharing` (可选/隔离) |
| `rclone listremotes` | `config_listremotes` | `config_read` (默认) |
| `rclone delete` / `deletefile` | `operations_deletefile` / `operations_delete` | `operations` (默认) / `operations_advanced` |
| `rclone purge` | `operations_purge` | `operations_advanced` (可选) |
| `rclone mkdir` / `rmdir` | `operations_mkdir` / `operations_rmdir` | `operations` (默认) / `operations_advanced` |
| `rclone mount` | `mount_mount` | `mount` (可选) |
| `rclone serve (webdav/sftp/...)` | `serve_start` / `serve_stop` | `serve` (可选) |

---

## 7. 可查询资源 (MCP Resources) 清单设计

MCP Resources 允许 AI 客户端像访问文件 URL 一样，实时读取云存储系统的上下文：

| Resource URI 语法 | 资源类型 | 返回格式 | 描述与用途 |
| :--- | :--- | :--- | :--- |
| `rclone://remotes` | 节点列表 | `application/json` | 查看当前已配置的所有 Remote 存储节点名称列表 |
| `rclone://config/dump` | 配置文件脱敏镜像 | `application/json` | 读取已脱敏的全量 `rclone.conf` 连接属性（屏蔽 Token/密码） |
| `rclone://core/version` | 系统与引擎版本 | `application/json` | 动态获取当前 Rclone 引擎 (v1.75.0) 及 Golang 环境版本 |
| `rclone://core/stats` | 实时网络与传输监控 | `application/json` | 监控当前传输速率、已传流量、并发数与错误统计 |
| `rclone://<remote-name>/<path>` | 云端文件/目录节点 | `application/json` | 直连映射指定 Remote 路径，供 AI 直接提取文件列表或文本内容 |
| `rclone://jobs/active` | 活动后台任务 | `application/json` | 查询当前后台正在运行的所有传输 Job 状态 |

---

## 8. 安全防护与风险控制

1. **外链敏感隔离**：外链生成工具已从 `default` 中剥离，只有显式指定 `RCLONE_TOOLSETS=default,sharing` 时才加载。
2. **只读模式开关 (`RCLONE_READ_ONLY=1`)**：一键关闭所有写入与删除工具。
3. **网络访问绑定**：`rclone rcd` 默认绑定 `127.0.0.1:5572` 环回地址，杜绝局域网越权调用。

---

## 9. 本地开发与部署实践

### 步骤 1: 启动守护进程 (`rclone rcd`)
在终端运行：
```powershell
& "<你本地的 rclone 二进制路径>/rclone.exe" --config "<你本地的配置文件路径>/test-rclone.conf" rcd --rc-no-auth
```

### 步骤 2: 编译重构后的代码
```bash
cd <你的项目根目录>
npm run build
```

### 步骤 3: 在 AI 客户端中接入场景配置

根据不同的安全要求与应用场景，可以在 Cursor / Claude Desktop / Antigravity 的 `mcpServers` 配置文件中进行差异化接入：

#### 场景 1：标准开发配置（默认推荐）
允许 AI 使用默认基础工具以及异步任务查询。
```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "command": "node",
      "args": ["<你的项目根目录>/dist/index.js"],
      "env": {
        "RCLONE_URL": "http://localhost:5572",
        "RCLONE_TOOLSETS": "default,jobs"
      }
    }
  }
}
```

#### 场景 2：安全只读配置（仅允许浏览）
禁止 AI 执行删除、覆盖、移动等破坏性操作，仅允许查看列表、状态。
通过设置 `RCLONE_READ_ONLY=1` 环境变量，代理服务会在请求拦截层直接拒绝非只读的 API 调用。
```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "command": "node",
      "args": ["<你的项目根目录>/dist/index.js"],
      "env": {
        "RCLONE_URL": "http://localhost:5572",
        "RCLONE_TOOLSETS": "default",
        "RCLONE_READ_ONLY": "1"
      }
    }
  }
}
```

#### 场景 3：带有认证密码的启动配置
生产环境或公用服务器中，`rclone rcd` 启动时通常带有 `--rc-user` 和 `--rc-pass`。此时 MCP 客户端需在环境变量中传入认证信息。
```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "command": "node",
      "args": ["<你的项目根目录>/dist/index.js"],
      "env": {
        "RCLONE_URL": "http://localhost:5572",
        "RCLONE_TOOLSETS": "default,jobs",
        "RCLONE_USER": "admin",
        "RCLONE_PASS": "your_secure_password"
      }
    }
  }
}
```

---

## 10. 向上兼容性与维护策略 (Forward Compatibility)

为了应对未来 `rclone-mcp` 项目升级或 Rclone 官方命令的迭代，本架构设计具备天然的向上兼容性：

1. **底层 Schema 动态生成**：MCP Server 返回的工具 Schema 是启动时通过解析 `rclone-openapi` 的 JSON 定义动态生成的。当 Rclone 官方发布新版本增删参数时，只需升级 `rclone-openapi` 依赖，MCP 工具的参数列表会自动同步，无需修改业务代码。
2. **未知命令的平滑降级**：如果 Rclone 官方废弃了某个 API（如未来的 `/operations/oldapi`），由于 `toolsets.ts` 中配置的是路由前缀或精准匹配，当运行时找不到对应的 OpenAPI 定义，会自动跳过注册，不会导致整个 MCP 服务崩溃。
3. **第三方项目的定制化合并**：由于重构仅修改了 `src/tools/toolsets.ts` 等极少量的核心过滤规则，未来若原开源仓库 `rclone-mcp` 进行了核心架构升级，可以通过 Git 基础 Merge 策略轻松整合，极大降低了维护与冲突成本。

---

## 11. 附录：开发注意事项 (Developer Notes)

针对实际的研发落地过程，开发人员需要重点关注以下几个技术细节：

### 11.1 MCP Resources 的具体实现机制
* **现状**：现有的 `rclone-mcp` 项目侧重于实现 MCP 的 **Tools**（供 AI 调用的主动工具），对 **Resources**（供 AI 订阅或读取的被动上下文）的支持可能不完整。
* **开发要求**：开发者需要在 `index.ts`（或专门的 registry 文件）中，使用 `@modelcontextprotocol/sdk` 提供的 `server.resource(...)` 监听特定 URI。例如，拦截 `rclone://remotes` 的资源请求，并在代理层将其转化为对 `rclone rcd` 的 `config/listremotes` HTTP 调用，最后格式化返回给 MCP 客户端。

### 11.2 超时控制与异步任务对策 (Timeout & Async Jobs)
* **痛点**：MCP 客户端调用 Tool 时通常有强制超时限制（如 60 秒）。大文件同步或海量目录统计极易引发网络级超时，导致 AI 误判任务失败。
* **开发要求**：
  1. **Schema 注入**：在解析 OpenAPI 生成 Zod Schema 时，需确保允许或主动向所有耗时操作的 Tool（如 `sync_sync`、`operations_size`）中注入 Rclone 的全局控制参数 `_async: boolean`。
  2. **Prompt 引导**：在这些 Tool 的 `description` 描述中强烈建议添加提示词，例如：“如果预测操作耗时较长，必须设置 `_async: true` 使其在后台非阻塞运行，并立即返回 `jobid`，随后使用 `job_status` 工具轮询进度。” 通过此机制，可以完美规避 MCP 的同步超时断连问题。

### 11.3 认证信息的传递闭环 (Authentication)
* **痛点**：部署环境支持 `RCLONE_USER` 和 `RCLONE_PASS`，需确保代码逻辑实现了凭证透传。
* **开发要求**：确保 Node.js 层的 HTTP 客户端（负责请求 `localhost:5572` 的模块）能够读取这两个环境变量，并将它们组装成标准的 **HTTP Basic Auth Header**（即 `Authorization: Basic <base64>`），以保证与 Rclone Daemon 的鉴权机制握手成功。

### 11.4 OpenAPI 解析的边界坑点
* **痛点**：通过 `rclone-openapi` 自动推导生成 Zod Schema 时，复杂的复合参数（如过滤规则数组、深层嵌套 JSON 配置）有时会被退化解析为 `unknown` 或单纯的 `string`。
* **开发要求**：开发人员需抽查高频核心工具的生成 Schema。若发现 LLM 调用时参数构造错误率高，可能需要在注册逻辑处进行局部干预（Override），针对特定字段手动硬编码更严格的 Zod Schema，从而提升 AI 调用的精确度。

---

## 12. 开发团队 Git 工作流与最佳实践 (Git Workflow)

因为本方案的核心策略是“在开源项目基础上重构，且修改面极度收敛于配置文件”，为了保证未来能够随时合并上游（Upstream）更新并享受社区红利，强烈建议开发团队遵循以下 Git 工作流：

### 12.1 初始化代码仓库 (Fork & Upstream)
强烈推荐使用 GitHub CLI (`gh`) 进行一键初始化，这会自动在你的账号下创建私有 Fork，克隆到本地，并完美设置好 `origin` (你的仓库) 和 `upstream` (官方仓库)。

```bash
# 推荐方式：一键拉取并自动配置 Upstream
gh repo fork rclone-ui/rclone-mcp --clone
```

如果不使用 `gh` 工具，也可以手动配置：
```bash
# 手动克隆你的代码库后，添加官方源码仓库作为上游
git remote add upstream https://github.com/rclone-ui/rclone-mcp.git
```

### 12.2 开发与合并策略
1. **独立分支开发**：切忌在主分支上直接深度魔改底层引擎代码。应基于本方案建立独立的功能分支，并尽量将修改局限在 `src/tools/toolsets.ts` 等配置文件与代理层路由。
2. **跟进上游更新**：当原项目发布新版本（如优化了网络层或适配了新版 SDK）时，开发人员可通过以下命令无痛吸收更新：
   ```bash
   git fetch upstream
   git merge upstream/main
   ```
3. **极简的冲突解决**：因代码侵入度低，若发生 Git 冲突，99% 会集中在 `src/tools/toolsets.ts` 中。在解决冲突时，**强制保留本文档（第 5 节）制定的工具分组逻辑**即可，整个维护与合并成本趋近于零。
