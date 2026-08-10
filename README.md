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

All configurations below assume a running rclone daemon (see
[Prerequisites](#prerequisites)). Pick one **transport** — it decides the shape of
your client config:

- **stdio** — the MCP client spawns a local server process itself (`npx`/`node`, or
  wrapped in a Docker container) and talks to it over the process's stdin/stdout.
  This is what Cursor, Claude Desktop, and opencode use locally.
- **Streamable HTTP** — a standalone server runs somewhere and clients connect over
  HTTP to its `/mcp` endpoint. No client-side process is spawned.

### Stdio transport (local processes)

#### Directly with npx (requires Node.js)

**Cursor / Claude Desktop** (`.cursor/mcp.json` or `claude_desktop_config.json`):

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

**opencode** (`~/.config/opencode/opencode.json`, or a project-level `opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "rclone-mcp-server": {
      "type": "local",
      "command": ["npx", "-y", "rclone-mcp-server"],
      "environment": {
        "RCLONE_URL": "https://rclone.example.com"
      }
    }
  }
}
```

opencode's MCP config differs from other clients — do not copy the `mcpServers`
block above verbatim:

- `type: "local"` is **required**; opencode uses it to decide how to spawn the server.
- `command` must be an **array** of strings; there is no separate `args` key.
- Environment variables go under `environment`, not `env`.
- Use `"enabled": false` to disable a server.
- Restart opencode after editing — config is only loaded at startup. Its tools
  then appear under the `mcp__rclone-mcp-server__` prefix.

**With HTTP Basic Auth** (rcd behind a reverse proxy). The same shape works for any
stdio launch — put the auth variables under `env` for Cursor/Claude Desktop as shown,
under `environment` for opencode, or as `-e` flags for Docker:

```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "command": "npx",
      "args": ["-y", "rclone-mcp-server"],
      "env": {
        "RCLONE_URL": "https://rclone.example.com",
        "RCLONE_USER": "your_user",
        "RCLONE_PASS": "your_password"
      }
    }
  }
}
```

#### Via Docker (container over stdio)

Still **stdio** — the container just runs the same server
(`ENTRYPOINT node dist/index.js`, default `stdio` command) and the client starts it
with `docker run`. Use this when the client machine has Docker but you don't want
Node.js/npm installed there.

**Step 1 — build the image** (once, on the machine that runs Docker):

```bash
cd rclone-mcp-server
docker build -t rclone-mcp-server .
```

**Step 2 — configure the client to spawn `docker run -i --rm ... rclone-mcp-server`**
instead of `npx`.

opencode:

```json
{
  "mcp": {
    "rclone-mcp-server": {
      "type": "local",
      "command": [
        "docker", "run", "-i", "--rm",
        "-e", "RCLONE_URL=http://host.docker.internal:5572",
        "-e", "RCLONE_USER=your_user",
        "-e", "RCLONE_PASS=your_password",
        "rclone-mcp-server"
      ]
    }
  }
}
```

Cursor / Claude Desktop:

```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "RCLONE_URL=http://host.docker.internal:5572",
        "-e", "RCLONE_USER=your_user",
        "-e", "RCLONE_PASS=your_password",
        "rclone-mcp-server"
      ]
    }
  }
}
```

Notes:

- `-i` is mandatory: it pipes the client's stdin/stdout into the container, which is
  how stdio MCP works.
- `host.docker.internal` resolves to the machine running Docker. Use it when `rcd`
  runs on that same machine; otherwise set `RCLONE_URL` to the real daemon address.
  Note: Docker Desktop (Windows/macOS) adds this host automatically, but plain
  Docker Engine on Linux does **not** — there you must also pass
  `--add-host=host.docker.internal:host-gateway`. On Linux you can instead just set
  `RCLONE_URL` to the host's LAN IP and skip the flag.
- Environment variables must be passed with `-e` (or `--env-file`) — a client's own
  `environment`/`env` block does **not** reach inside the container.
- Tune toolsets/read-only with e.g. `-e RCLONE_TOOLSETS=default,jobs` or
  `-e RCLONE_READ_ONLY=1` (see [Environment Variables](#environment-variables)).

### Streamable HTTP transport (standalone server)

The server runs on its own and clients connect over HTTP — no client-side spawn.
Use for remote hosting or web-based MCP clients that can't spawn local processes, or
when you want one server shared by many clients.

**Step 1 — start the server** on a machine that can reach the rcd daemon. The rclone
connection settings come from that machine's environment:

```bash
RCLONE_URL=https://rclone.example.com \
RCLONE_USER=your_user \
RCLONE_PASS=your_password \
npx rclone-mcp-server http --port 3000
```

(`KEY=value` prefixes are bash/POSIX syntax — on Windows cmd use `set "RCLONE_URL=..."`,
on PowerShell `$env:RCLONE_URL="..."`.)

It listens on `http://0.0.0.0:3000/mcp` (the `/mcp` path only).

**Step 2 — point clients at the endpoint** instead of a local command.

opencode (`~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "rclone-mcp-server": {
      "type": "remote",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Cursor (`.cursor/mcp.json`, UI: Type = streamableHttp):

```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Claude Desktop (`claude_desktop_config.json`) does not accept `url` entries (they are
silently dropped), so bridge over stdio with `mcp-remote`:

```json
{
  "mcpServers": {
    "rclone-mcp-server": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3000/mcp"]
    }
  }
}
```

Note: replace `localhost` with the server's hostname/IP when clients run on other
machines. The server binds all interfaces by default — put it behind a reverse proxy
with authentication (HTTPS) before exposing it publicly, and point clients at
`https://your-host.example.com/mcp`.

Also note that `RCLONE_USER`/`RCLONE_PASS` only protect the link between *this server
and rcd* — the MCP `/mcp` endpoint itself has **no** authentication, and the default
toolset includes write operations (copy/mkdir/delete). Do not expose it to untrusted
networks without the reverse-proxy auth above.

## Configuration

These settings configure the server **process itself**. They work identically no
matter which of the two ways the process gets started:

- **spawned by your MCP client** — the client launches the server for you using one
  of the configs from [Installation](#installation) (`npx`/`docker`, stdio mode). You
  don't run anything by hand; the settings live in the client's own
  `env`/`environment` block (or in `-e` flags for Docker).
- **started manually in a terminal** — required for the standalone `http` mode and
  for direct testing. You type the command yourself and pass the settings as shell
  environment variables or CLI flags.

Both channels feed settings into the same process. The two sections below document
those inputs (environment variables and CLI flags) once.

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

The server's own command-line interface, used when you **start it manually**:

- `stdio` is the default command — it is exactly the process a client spawns for you
  in stdio mode ([Stdio transport](#stdio-transport-local-processes)), so you rarely
  type it yourself.
- `http` is the standalone mode that **must** be started manually — the `Step 1` of
  [Streamable HTTP transport](#streamable-http-transport-standalone-server).

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

Manual terminal invocations of the flags above (the manual channel — run the server
directly, e.g. for testing, instead of having a client spawn it). The same settings,
when the server is spawned by a client, go under `RCLONE_TOOLSETS` / `RCLONE_READ_ONLY`
in the client's `env`/`environment` block (or as `-e` flags for Docker):

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

The examples use the Cursor / Claude Desktop `mcpServers` form. For **opencode**,
keep the server entry as an opencode `local` config and move every `env` key under
`environment` — see the opencode variant of Scenario 1 below.

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

Same scenario in **opencode** form (`~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "rclone-mcp-server": {
      "type": "local",
      "command": ["npx", "-y", "rclone-mcp-server"],
      "environment": {
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