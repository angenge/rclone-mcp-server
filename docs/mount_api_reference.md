# Rclone RCD 模式 API 挂载参数参考手册

本文件记录了如何将本地 `mount` 挂载命令的调优参数转换为纯 `rcd` 模式下的 API 请求。

> **凭据说明**：RC 账号密码由项目根目录 `.env` 提供（`RCLONE_USER` / `RCLONE_PASS`），下面的 `$RC_USER` / `$RC_PASS` 是占位符，执行前请替换为 `.env` 中的实际值或导出为环境变量。不要将真实密码写入本文档或提交到仓库。

## 1. 发起挂载的 API 请求脚本 (cURL)
每次容器重启后，或者需要重新挂载时，可以在服务器终端执行以下命令：

```bash
curl -X POST "http://127.0.0.1:5572/mount/mount" \
     -u "$RC_USER:$RC_PASS" \
     -H "Content-Type: application/json" \
     -d '{
           "fs": "GD-acct-a:/",
           "mountPoint": "/mnt/gdrive-acct-a",
           "vfsOpt": {
               "CacheMode": 3,
               "CacheMaxSize": 8589934592,
               "CacheMaxAge": 36000000000000,
               "ChunkSize": 16777216,
               "ChunkSizeLimit": -1
           },
           "mountOpt": {
               "AllowOther": true,
               "AllowNonEmpty": true,
               "Umask": 0
           }
         }'
```

## 2. 核心参数换算对照备忘
如果以后想自己修改参数大小，请参考以下单位换算规则：

### VFS 缓存参数 (`vfsOpt`)
* **`CacheMode` (缓存模式)**：`3` 对应 `full`。*(取值范围：0=off, 1=minimal, 2=writes, 3=full)*
* **`CacheMaxSize` (最大缓存大小)**：`8589934592` 对应 `8G`。*(计算方式：字节 Bytes。8 × 1024 × 1024 × 1024)*
* **`CacheMaxAge` (缓存保留时间)**：`36000000000000` 对应 `10h`。*(计算方式：纳秒 ns。10小时 × 3600秒 × 1000 × 1000 × 1000)*
* **`ChunkSize` (分块读取大小)**：`16777216` 对应 `16M`。*(计算方式：字节 Bytes。16 × 1024 × 1024)*
* **`ChunkSizeLimit` (分块大小上限)**：`-1` 对应 `off`。*(-1 代表无限制)*

### 挂载及权限参数 (`mountOpt`)
* **`AllowOther`**：`true` 对应 `--allow-other` (允许非同名用户/系统应用访问文件)。
* **`AllowNonEmpty`**：`true` 对应 `--allow-non-empty` (允许挂载到一个已经有文件的目录里)。
* **`Umask`**：`0` 对应 `--umask=000` (设置权限掩码为 000，即默认最高权限)。

## 3. 常用管理 API 指令

### 3.1 验证全局参数是否生效 (查询底层配置)
用于验证 `docker-compose.yaml` 中配置的 `--retries`, `--timeout` 等参数是否已成功写入 Rclone 的大脑：
```bash
curl -X POST "http://127.0.0.1:5572/options/get" -u "$RC_USER:$RC_PASS"
```
*(在返回的 JSON 中搜索 `"Retries"`, `"Timeout"`，或者你设置的 `"UserAgent"` 即可确认配置已生效)*

### 3.2 查看当前正在运行的挂载任务
```bash
curl -X POST "http://127.0.0.1:5572/mount/listmounts" -u "$RC_USER:$RC_PASS"
```

### 3.3 动态取消某个挂载点
```bash
curl -X POST "http://127.0.0.1:5572/mount/unmount" \
     -u "$RC_USER:$RC_PASS" \
     -H "Content-Type: application/json" \
     -d '{"mountPoint": "/mnt/gdrive-acct-a"}'
```
