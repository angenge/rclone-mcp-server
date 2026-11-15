# AGENTS.md

## 部署信息

| 项目 | 说明 |
|------|------|
| 组件/角色 | 远端 rclone rcd（RC API）+ 本仓库 rclone-mcp-server（MCP 代理） |
| 服务器 | `vps` = deploy@<RCD_HOST_IP>:10022（rcd 所在）；`onecloud` = deploy@<AUX_HOST_IP>:22 |
| 部署路径 | `/home/<DEPLOY_USER>/APPs/rclone`（docker compose 项目 `rclone`，compose 文件位于该目录） |
| 部署方式 | `docker compose up -d`（容器 `rclone-rcd`，镜像 `rclone/rclone:1.69.3`，restart=always，healthcheck healthy） |
| 容器名 | `rclone-rcd` |
| 日志路径 | `docker logs -f rclone-rcd` |
| 数据/配置 | 配置文件 `/home/<DEPLOY_USER>/APPs/rclone/config/rclone.conf`（挂载为 `/config/rclone.conf`）；缓存 `/home/<DEPLOY_USER>/APPs/rclone/cache`；数据盘挂载 `/DATA/gdrive-acct-a`（`gd-acct-a:`）、`/DATA/gdrive-acct-b`（`gd-acct-b:`），均 fuse.rclone、`allow_other`；RC 访问凭据只存于反向代理配置，不落盘 |
| 部署时间 | 2026-08-04 09:06 UTC（容器启动时间） |
| 运行参数 | `rcd --config=/config/rclone.conf --rc-web-gui --rc-addr=0.0.0.0:5572 --log-level=INFO --retries=10 --retries-sleep=60s --timeout=10m --buffer-size=64M --use-mmap --tpslimit=10 --tpslimit-burst=10 --user-agent=Mozilla/5.0 ...` |

公开入口：`https://<RCD_DOMAIN>`（反向代理至容器 5572，Basic Auth `<RC_USER>`，密码存于代理配置）。

## rcd 访问验证

```bash
curl.exe -sk -u "$RC_USER:$RC_PASS" -X POST "https://<RCD_DOMAIN>/core/version" -H "Content-Type: application/json" -d "{}"
```

## 已知问题

- 默认工具集不含 `local:`，对远端 rcd 调用 `operations/stat fs=local:` 会报 500 `didn't find section in config file ("local")`，须使用 rcd 已配置的远端名（如 `gd-acct-b:`）。

## Git 提交约定

- **未经用户明确要求，不主动 commit / push / 创建 PR**。
- 提交作者信息： 使用 git 登录（全局配置）的作者信息（`user.name`）和邮箱（`user.email`）；如本地配置不符，主动询问用户如何选择。
- 提交前先检查 `git status`、`git diff` 与 `git log --oneline -10`，只暂存本次改动相关文件，绝不提交凭据/密钥（.env、*.pem 等）。
- 提交信息使用英文，格式：`<type>: <concise description>`（type 可选 `feat` / `fix` / `docs` / `refactor` / `chore` / `style` / `test` 等等），如 `docs: Update the deployment documentation`；简单改动可只用简洁描述，不必强行加前缀。
- 提交信息概括「做了什么 + 为什么」，不堆砌无关细节；一次提交对应一个逻辑改动，避免把不相关修改混在一起。
- 若一次改动同时包含多种类型（如既有 `feat` 也有 `fix`），能拆则拆成多个提交分别提交（分别 `git add` 相关文件）；若改动交织在同一处无法拆分，则以影响最大的类型为前缀并在信息中说明。
- 提交失败或 hook 拒绝时，修复后新建提交，不 amend、不 force push。
