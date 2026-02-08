import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { createMcpServer } from './server.js'

const sharedOptions = {
    toolsets: {
        type: 'string' as const,
        description:
            'Comma-separated list of toolsets to enable (default, all, or individual names)',
        default: process.env.RCLONE_TOOLSETS,
    },
    'read-only': {
        type: 'boolean' as const,
        description: 'Only expose read-only tools',
        default: process.env.RCLONE_READ_ONLY === '1',
    },
}

async function runStdio(toolsets: string | undefined, readOnly: boolean) {
    const server = createMcpServer({ toolsets, readOnly })
    const transport = new StdioServerTransport()
    await server.connect(transport)
}

async function runHttp(port: number, toolsets: string | undefined, readOnly: boolean) {
    const transports = new Map<string, StreamableHTTPServerTransport>()

    const httpServer = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:${port}`)

        if (url.pathname !== '/mcp') {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('Not Found')
            return
        }

        if (req.method === 'POST') {
            const sessionId = req.headers['mcp-session-id'] as string | undefined

            if (sessionId && transports.has(sessionId)) {
                const transport = transports.get(sessionId)!
                await transport.handleRequest(req, res)
                return
            }

            // Peek at the body to detect initialization
            const body = await readBody(req)
            let parsed: unknown
            try {
                parsed = JSON.parse(body)
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(
                    JSON.stringify({
                        jsonrpc: '2.0',
                        error: { code: -32700, message: 'Parse error' },
                        id: null,
                    })
                )
                return
            }

            const isInit = isInitializeRequest(parsed)

            if (!sessionId && isInit) {
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sid) => {
                        transports.set(sid, transport)
                    },
                })

                transport.onclose = () => {
                    const sid = transport.sessionId
                    if (sid) transports.delete(sid)
                }

                const mcpServer = createMcpServer({ toolsets, readOnly })
                await mcpServer.connect(transport)
                await transport.handleRequest(req, res, parsed)
                return
            }

            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(
                JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
                    id: null,
                })
            )
            return
        }

        if (req.method === 'GET') {
            const sessionId = req.headers['mcp-session-id'] as string | undefined
            if (!sessionId || !transports.has(sessionId)) {
                res.writeHead(400, { 'Content-Type': 'text/plain' })
                res.end('Invalid or missing session ID')
                return
            }
            await transports.get(sessionId)!.handleRequest(req, res)
            return
        }

        if (req.method === 'DELETE') {
            const sessionId = req.headers['mcp-session-id'] as string | undefined
            if (!sessionId || !transports.has(sessionId)) {
                res.writeHead(400, { 'Content-Type': 'text/plain' })
                res.end('Invalid or missing session ID')
                return
            }
            await transports.get(sessionId)!.handleRequest(req, res)
            return
        }

        res.writeHead(405, { 'Content-Type': 'text/plain' })
        res.end('Method Not Allowed')
    })

    httpServer.listen(port, () => {
        console.error(`rclone-mcp Streamable HTTP server listening on port ${port}`)
    })

    process.on('SIGINT', async () => {
        console.error('Shutting down...')
        for (const [sid, transport] of transports) {
            try {
                await transport.close()
            } catch {
                // ignore close errors during shutdown
            }
            transports.delete(sid)
        }
        httpServer.close()
        process.exit(0)
    })
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => resolve(Buffer.concat(chunks).toString()))
        req.on('error', reject)
    })
}

function isInitializeRequest(body: unknown): boolean {
    if (Array.isArray(body)) {
        return body.some(
            (msg) =>
                typeof msg === 'object' &&
                msg !== null &&
                (msg as { method?: string }).method === 'initialize'
        )
    }
    return (
        typeof body === 'object' &&
        body !== null &&
        (body as { method?: string }).method === 'initialize'
    )
}

yargs(hideBin(process.argv))
    .scriptName('rclone-mcp')
    .command(
        ['stdio', '$0'],
        'Run with stdio transport (default)',
        (y) => y.options(sharedOptions),
        async (argv) => {
            await runStdio(argv.toolsets, argv.readOnly)
        }
    )
    .command(
        'http',
        'Run with Streamable HTTP transport',
        (y) =>
            y.options({
                ...sharedOptions,
                port: {
                    type: 'number' as const,
                    description: 'HTTP port to listen on',
                    default: Number(process.env.PORT) || 3000,
                },
            }),
        async (argv) => {
            await runHttp(argv.port, argv.toolsets, argv.readOnly)
        }
    )
    .strict()
    .help()
    .parse()
