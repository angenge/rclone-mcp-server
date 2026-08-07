import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createClient } from './client.js'
import { registerTools } from './tools/registry.js'
import { resolveToolsets } from './tools/toolsets.js'

import pkg from '../package.json' with { type: 'json' }
const PKG_VERSION = pkg.version

async function callRCD(client: any, url: string, params?: Record<string, any>) {
    const apiPath = url.startsWith('/') ? url : `/${url}`
    const response = await (
        client as unknown as {
            POST: (
                url: string,
                init?: { body?: Record<string, unknown> }
            ) => Promise<{ data?: unknown; error?: unknown; response: Response }>
        }
    ).POST(apiPath, {
        body: params,
    })

    if (response.error) {
        const errMsg =
            typeof response.error === 'string' ? response.error : JSON.stringify(response.error)
        throw new Error(errMsg)
    }

    return response.data
}

function sanitizeConfig(obj: any): any {
    if (obj === null || obj === undefined) return obj
    if (Array.isArray(obj)) {
        return obj.map(sanitizeConfig)
    }
    if (typeof obj === 'object') {
        const result: Record<string, any> = {}
        for (const [key, value] of Object.entries(obj)) {
            const lowerKey = key.toLowerCase()
            if (
                lowerKey.includes('pass') ||
                lowerKey.includes('password') ||
                lowerKey.includes('token') ||
                lowerKey.includes('secret') ||
                lowerKey.includes('key') ||
                lowerKey.includes('auth')
            ) {
                result[key] = '<REDACTED>'
            } else {
                result[key] = sanitizeConfig(value)
            }
        }
        return result
    }
    return obj
}

export function createMcpServer(options: {
    toolsets?: string
    readOnly?: boolean
}): McpServer {
    const server = new McpServer({
        name: 'rclone-mcp-server',
        version: PKG_VERSION,
    })

    const client = createClient()
    const enabledToolsets = resolveToolsets(options.toolsets)
    const readOnly = options.readOnly ?? process.env.RCLONE_READ_ONLY === '1'

    const toolCount = registerTools(server, client, enabledToolsets, readOnly)

    const toolsetList = [...enabledToolsets].join(', ')
    console.error(
        `rclone-mcp-server v${PKG_VERSION}: registered ${toolCount} tools [toolsets: ${toolsetList}]${readOnly ? ' (read-only)' : ''}`
    )

    // Register Static MCP Resources
    server.resource('Remotes List', 'rclone://remotes', async (uri) => {
        const data = await callRCD(client, 'config/listremotes')
        return {
            contents: [
                {
                    uri: uri.toString(),
                    mimeType: 'application/json',
                    text: JSON.stringify(data, null, 2),
                },
            ],
        }
    })

    server.resource('Redacted Config Dump', 'rclone://config/dump', async (uri) => {
        const data = await callRCD(client, 'config/dump')
        const sanitized = sanitizeConfig(data)
        return {
            contents: [
                {
                    uri: uri.toString(),
                    mimeType: 'application/json',
                    text: JSON.stringify(sanitized, null, 2),
                },
            ],
        }
    })

    server.resource('Rclone Version Info', 'rclone://core/version', async (uri) => {
        const data = await callRCD(client, 'core/version')
        return {
            contents: [
                {
                    uri: uri.toString(),
                    mimeType: 'application/json',
                    text: JSON.stringify(data, null, 2),
                },
            ],
        }
    })

    server.resource('Real-time Transfer Stats', 'rclone://core/stats', async (uri) => {
        const data = await callRCD(client, 'core/stats')
        return {
            contents: [
                {
                    uri: uri.toString(),
                    mimeType: 'application/json',
                    text: JSON.stringify(data, null, 2),
                },
            ],
        }
    })

    server.resource('Active Background Jobs', 'rclone://jobs/active', async (uri) => {
        const data = await callRCD(client, 'job/list')
        return {
            contents: [
                {
                    uri: uri.toString(),
                    mimeType: 'application/json',
                    text: JSON.stringify(data, null, 2),
                },
            ],
        }
    })

    // Register Dynamic MCP Resource Template
    server.resource(
        'Remote File/Folder Content',
        new ResourceTemplate('rclone://{remote}/{+path}', { list: undefined }),
        async (uri, variables) => {
            const remoteName = String(variables.remote)
            const relativePath = String(variables.path)
            const fsPath = `${remoteName}:`

            try {
                // Check path type with operations/stat
                const statData = (await callRCD(client, 'operations/stat', {
                    fs: fsPath,
                    remote: relativePath,
                })) as any

                if (!statData || !statData.item) {
                    return {
                        contents: [
                            {
                                uri: uri.toString(),
                                mimeType: 'application/json',
                                text: JSON.stringify({
                                    error: `Path "${relativePath}" not found on remote "${remoteName}".`,
                                }),
                            },
                        ],
                    }
                }

                const item = statData.item
                if (item.IsDir) {
                    // Directory: return list of items
                    const listData = await callRCD(client, 'operations/list', {
                        fs: fsPath,
                        remote: relativePath,
                    })
                    return {
                        contents: [
                            {
                                uri: uri.toString(),
                                mimeType: 'application/json',
                                text: JSON.stringify(listData, null, 2),
                            },
                        ],
                    }
                }
                // File: return text content or metadata if binary/too large
                const mimeType = item.MimeType || 'application/octet-stream'
                const size = item.Size || 0

                const isBinary =
                    !mimeType.startsWith('text/') &&
                    !mimeType.includes('json') &&
                    !mimeType.includes('xml') &&
                    !mimeType.includes('javascript') &&
                    !mimeType.includes('markdown')

                if (size > 1024 * 1024 || isBinary) {
                    return {
                        contents: [
                            {
                                uri: uri.toString(),
                                mimeType: 'application/json',
                                text: JSON.stringify(
                                    {
                                        message:
                                            'File content omitted (file is either too large (> 1MB) or is binary).',
                                        metadata: item,
                                    },
                                    null,
                                    2
                                ),
                            },
                        ],
                    }
                }

                // Read content using core/command cat
                let configPath: string | undefined
                try {
                    const pathsData = (await callRCD(client, 'config/paths')) as any
                    configPath = pathsData?.config
                } catch (_e) {
                    // ignore error
                }

                const args = []
                if (configPath) {
                    args.push('--config', configPath)
                }
                args.push(`${remoteName}:${relativePath}`)

                const catRes = (await callRCD(client, 'core/command', {
                    command: 'cat',
                    arg: args,
                })) as any

                return {
                    contents: [
                        {
                            uri: uri.toString(),
                            mimeType: mimeType,
                            text: catRes.result || '',
                        },
                    ],
                }
            } catch (err: any) {
                return {
                    contents: [
                        {
                            uri: uri.toString(),
                            mimeType: 'application/json',
                            text: JSON.stringify({ error: err.message || String(err) }),
                        },
                    ],
                }
            }
        }
    )

    return server
}
