# rclone-mcp-server

[![Discord](https://img.shields.io/badge/Discord-%235865F2.svg?&logo=discord&logoColor=white)](https://discord.gg/rclone)

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
    "rclone": {
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
    "rclone": {
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

## Read-Only Mode

When `--read-only` or `RCLONE_READ_ONLY=1` is set, only non-mutating tools are registered. This excludes operations like file copy/move/delete, sync, config creation, mount/unmount, etc. Useful for giving AI assistants safe, read-only access.

## License

MIT

<div align="center">
<a href="https://discord.gg/rclone">
<img src="https://img.shields.io/badge/Discord-%235865F2.svg?&logo=discord&logoColor=white&style=for-the-badge">
</a>
</div>

<div align="center">
<sub>Made with ☁️ for the rclone community</sub>
</div>

