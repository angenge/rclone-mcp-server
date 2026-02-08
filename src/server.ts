import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createClient } from './client.js'
import { registerTools } from './tools/registry.js'
import { resolveToolsets } from './tools/toolsets.js'

const PKG_VERSION = '0.1.0'

export function createMcpServer(options: {
    toolsets?: string
    readOnly?: boolean
}): McpServer {
    const server = new McpServer({
        name: 'rclone-mcp',
        version: PKG_VERSION,
    })

    const client = createClient()
    const enabledToolsets = resolveToolsets(options.toolsets)
    const readOnly = options.readOnly ?? process.env.RCLONE_READ_ONLY === '1'

    const toolCount = registerTools(server, client, enabledToolsets, readOnly)

    const toolsetList = [...enabledToolsets].join(', ')
    console.error(
        `rclone-mcp v${PKG_VERSION}: registered ${toolCount} tools [toolsets: ${toolsetList}]${readOnly ? ' (read-only)' : ''}`
    )

    return server
}
