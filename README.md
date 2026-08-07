# rclone-mcp-server

MCP (Model Context Protocol) server for the [Rclone](https://rclone.org/) RC API. Gives AI assistants the ability to manage cloud storage remotes, copy/sync files, list directories, and more — all through natural language.

Tools are auto-generated from the [rclone-openapi](https://github.com/rclone-ui/rclone-openapi) spec using the [rclone-sdk](https://github.com/rclone-ui/rclone-sdk) client. 98 endpoints, organized into selectable toolsets.

## Prerequisites

A running rclone remote control daemon:

```bash
rclone rcd --rc-no-auth
# or with auth:
rclone rcd --rc-user=admin --rc-pass=secret
```

## Installation

### Cursor / Claude Desktop (stdio)

Add to your `.cursor/mcp.json` or `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "command": "npx",
      "args": ["-y", "rclone-mcp-server"],
      "env": {
        "RCLONE_URL": "http://localhost:5572"
      }
    }
  }
}
```

### With authentication

```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "command": "npx",
      "args": ["-y", "rclone-mcp-server"],
      "env": {
        "RCLONE_URL": "http://localhost:5572",
        "RCLONE_USER": "admin",
        "RCLONE_PASS": "secret"
      }
    }
  }
}
```

### Docker

```bash
docker build -t rclone-mcp-server .

docker run -i --rm \
  -e RCLONE_URL=http://host.docker.internal:5572 \
  rclone-mcp-server
```

### Streamable HTTP transport

For remote hosting or web-based MCP clients:

```bash
npx rclone-mcp-server http --port 3000
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `RCLONE_URL` | rclone RC daemon URL | `http://localhost:5572` |
| `RCLONE_USER` | HTTP Basic Auth username | — |
| `RCLONE_PASS` | HTTP Basic Auth password | — |
| `RCLONE_TOOLSETS` | Comma-separated toolset list | `default` |
| `RCLONE_READ_ONLY` | Set to `1` to disable write tools | — |
| `PORT` | HTTP listen port for the `http` command | `3000` |

### CLI Arguments

```
rclone-mcp-server [command]

Commands:
  rclone-mcp-server stdio  Run with stdio transport (default)
  rclone-mcp-server http   Run with Streamable HTTP transport

Options:
  --toolsets   Comma-separated list of toolsets
  --read-only  Only expose read-only tools
  --port       HTTP port (http command only, default: 3000)
```

## Toolsets

Tools are grouped by API path prefix. Enable only what you need to keep the tool list focused.

| Toolset | Paths | Default |
|---|---|---|
| `core` | `/core/version`, `/core/stats`, `/operations/about` | Yes |
| `config_read` | `/config/listremotes`, `/config/get` | Yes |
| `operations` | `/operations/list`, `/operations/stat`, `/operations/size`, `/operations/copyfile`, `/operations/movefile`, `/operations/mkdir`, `/operations/deletefile` | Yes |
| `sharing` | `/operations/publiclink` | No |
| `sync` | `/sync/*` | No |
| `jobs` | `/job/*` | No |
| `config_admin` | `/config/*` (rest) | No |
| `operations_advanced` | `/operations/*` (rest) | No |
| `mount` | `/mount/*` | No |
| `serve` | `/serve/*` | No |
| `core_advanced` | `/core/*`, `/rc/*` (rest) | No |
| `vfs` | `/vfs/*` | No |
| `cache` | `/cache/*` | No |
| `debug` | `/debug/*` | No |
| `backend` | `/backend/*` | No |
| `options` | `/options/*` | No |
| `plugins` | `/pluginsctl/*` | No |
| `fscache` | `/fscache/*` | No |

Special values:
- `default` — the three default toolsets (core, config_read, operations)
- `all` — every toolset

### Examples

```bash
# Default toolsets (12 tools)
npx rclone-mcp-server

# Everything (98 tools)
RCLONE_TOOLSETS=all npx rclone-mcp-server

# Just file operations and config
npx rclone-mcp-server --toolsets operations,config_read

# Default + mount
npx rclone-mcp-server --toolsets default,mount

# Read-only mode (no copy, delete, sync, etc.)
npx rclone-mcp-server --read-only
```

## MCP Resources

Beyond the call-based tools, the server exposes read-only **resources** so clients
can pull context like a file URL. They are always registered (regardless of
toolset) and are safe to enable in read-only mode.

| Resource URI | Description |
|---|---|
| `rclone://remotes` | List of configured remote names |
| `rclone://config/dump` | Full config dump with secrets redacted (pass, token, key, auth, …) |
| `rclone://core/version` | Running Rclone engine / Go version |
| `rclone://core/stats` | Real-time transfer & job stats |
| `rclone://jobs/active` | Active background jobs |
| `rclone://{remote}/{+path}` | Directory listing or file content for a remote path (stat → list / cat; binary or >1MB files return metadata only) |

Examples:
- `rclone://remotes`
- `rclone://core/version`
- `rclone://my-remote/` — list the root of remote `my-remote`
- `rclone://my-remote/Books/guide.pdf` — try to read a file

## Read-Only Mode

When `--read-only` or `RCLONE_READ_ONLY=1` is set, only non-mutating tools are registered. This excludes operations like file copy/move/delete, sync, directory creation, mount/unmount, etc. Useful for giving AI assistants safe, read-only access.

## Usage Scenarios

The scenarios below build on the base installs from [Installation](#installation):
use the stdio `command`/`args` block you picked there and only swap the `env`
fields. For the `stdio` examples below we use the published package via `npx`;
if you built locally, replace `"command": "npx", "args": ["-y", "rclone-mcp-server"]`
with `"command": "node", "args": ["/path/to/rclone-mcp-server/dist/index.js"]`.

### Scenario 1 — Standard developer config (default tools + job monitoring)

```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "command": "npx",
      "args": ["-y", "rclone-mcp-server"],
      "env": {
        "RCLONE_URL": "http://localhost:5572",
        "RCLONE_TOOLSETS": "default,jobs"
      }
    }
  }
}
```

For a remote daemon behind a reverse proxy with HTTP Basic Auth:

```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "command": "npx",
      "args": ["-y", "rclone-mcp-server"],
      "env": {
        "RCLONE_URL": "https://rclone.example.com",
        "RCLONE_USER": "your_user",
        "RCLONE_PASS": "your_password",
        "RCLONE_TOOLSETS": "default,jobs"
      }
    }
  }
}
```

### 2 — Read-only (viewing only)

```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "command": "npx",
      "args": ["-y", "rclone-mcp-server"],
      "env": {
        "RCLONE_URL": "http://localhost:5572",
        "RCLONE_TOOLSETS": "default",
        "RCLONE_READ_ONLY": "1"
      }
    }
  }
}
```

### 3 — Enable bulk sync + share links

```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "command": "npx",
      "args": ["-y", "rclone-mcp-server"],
      "env": {
        "RCLONE_URL": "http://localhost:5572",
        "RCLONE_TOOLSETS": "default,jobs,sync,sharing"
      }
    }
  }
}
```

### 4 — Everything (98 tools)

```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "command": "npx",
      "args": ["-y", "rclone-mcp-server"],
      "env": {
        "RCLONE_TOOLSETS": "all"
      }
    }
  }
}
```

## Common Tool Examples

The registered tool names are `snake_case` versions of each RC endpoint, e.g. `/operations/copyfile` → `operations_copyfile`. Since this is often an MCP bridge
to a remote `rcd` daemon, **remote names must carry a trailing colon** and there is
**no `local:` remote** on the daemon — use a real configured remote (e.g. `my-remote:`).

### Discover (always list first, never guess a path)

```json
{ "fs": "my-remote:", "remote": "" }                 // `rclone_lsjson` — root
{ "fs": "my-remote:", "remote": "Books", "recurse": true }  // recursive
{ "fs": "my-remote:", "remote": "Books/x.pdf" }       // `operations_stat` — one file
{ "fs": "my-remote:" }                                // `operations_size` — totals
{ "fs": "my-remote:" }                                // `core_about` — quota/capacity
```

### Single-file operations

```bash
# copy one file
{ "srcFs": "my-remote:", "srcRemote": "backup/a.txt",
  "dstFs": "other-remote:", "dstRemote": "incoming/a.txt" }   // operations_copyfile

# move one file (source removed on success)
{ "srcFs": "my-remote:", "srcRemote": "a.txt",
  "dstFs": "my-remote:", "dstRemote": "archive/a.txt" }              // operations_movefile

# create / delete a directory or file
{ "fs": "my-remote:", "remote": "new-folder" }        // operations_mkdir
{ "fs": "my-remote:", "remote": "tmp/a.txt" }         // operations_deletefile
```

> **Deleting a directory needs the `operations_advanced` toolset.** The default
> tools only include `operations_deletefile`, which removes a *single file* — it
> cannot delete directories. Removing empty directories / a directory tree is
> done by `operations_rmdir` / `operations_rmdirs` / `operations_purge`, which are
> grouped under `operations_advanced` (`default: false`). To enable directory
> deletion, set `RCLONE_TOOLSETS=default,jobs,operations_advanced`. (`mkdir` is
> in the default `operations` toolset, so creating directories works out of the
> box; only deleting them requires the extra toolset.)

### Bulk tree operations — always use `_async: true`

Whole-tree copies and syncs can exceed the request timeout. Set `_async: true`
so the daemon returns a `jobid` immediately, then poll `job_status`.

```bash
# copy tree src -> dst (additive, no deletes)
{ "srcFs": "source-remote:", "dstFs": "my-remote:", "_async": true }  // sync_copy

# mirror dst to src (DESTRUCTIVE — deletes extra dst files)
{ "srcFs": "my-remote:", "dstFs": "source-remote:", "_async": true }  // sync_sync

# poll the job
{ "jobid": 17 }   // job_status -> until `finished` is true
```

Long-running tools that accept `_async`: `sync_copy`, `sync_move`, `sync_sync`,
`operations_copyfile`, `operations_movefile`, `operations_size`, `operations_purge`,
`operations_delete`, `operations_copyurl`, `operations_check`.

### Share links (`sharing` toolset only)

```bash
{ "fs": "my-remote:", "remote": "share/folder" }       // operations_publiclink
{ "fs": "my-remote:", "remote": "share/folder", "unlink": true }  // remove
```

## License

MIT

<div align="center">
<sub>Made with ☁️ for the rclone community</sub>
</div>

---

This project is a secondary refactor based on [rclone-ui/rclone-mcp](https://github.com/rclone-ui/rclone-mcp).

