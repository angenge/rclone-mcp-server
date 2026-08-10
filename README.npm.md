# rclone-mcp-server

MCP (Model Context Protocol) server for the [Rclone](https://rclone.org/) RC API.

> **Note:** the README bundled here is a static snapshot taken at publish time.
> It may be out of date. For the most recent documentation, installation
> examples, and changelog, always check the GitHub repository:
>
> **https://github.com/angenge/rclone-mcp-server**

## Quick start

Requires a running rclone daemon:

```bash
rclone rcd --rc-no-auth
```

For Cursor / Claude Desktop (stdio):

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

For **opencode** (`~/.config/opencode/opencode.json`, or a project-level
`opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "rclone-mcp-server": {
      "type": "local",
      "command": ["npx", "-y", "rclone-mcp-server"],
      "environment": {
        "RCLONE_URL": "http://localhost:5572"
      }
    }
  }
}
```

Note: opencode's config differs from other clients — `type: "local"` is required,
`command` must be an array (no separate `args`), and env vars go under
`environment` (not `env`). Restart opencode after editing.

For full docs — transports, toolsets, read-only mode, environment variables, and
usage scenarios — see **https://github.com/angenge/rclone-mcp-server**.

## License

MIT