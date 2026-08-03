import { createRequire } from 'node:module'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RCDClient } from 'rclone-sdk'
import { z } from 'zod'
import { camelToSnake, getToolsetForPath, isReadOnly } from './toolsets.js'

// Use createRequire to load the bundled JSON spec from rclone-openapi
const require = createRequire(import.meta.url)

type OpenApiParam = {
    name: string
    in: string
    description?: string
    required?: boolean
    schema?: {
        type?: string
        items?: Record<string, unknown>
        [key: string]: unknown
    }
    [key: string]: unknown
}

type OpenApiOperation = {
    operationId: string
    summary?: string
    description?: string
    parameters?: (OpenApiParam | { $ref: string })[]
}

type OpenApiSpec = {
    paths: Record<string, { post?: OpenApiOperation }>
    components?: {
        parameters?: Record<string, OpenApiParam>
    }
}

function resolveRef(spec: OpenApiSpec, ref: string): OpenApiParam | undefined {
    // refs look like "#/components/parameters/SomeName"
    const parts = ref.replace('#/', '').split('/')
    let current: unknown = spec
    for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
            current = (current as Record<string, unknown>)[part]
        } else {
            return undefined
        }
    }
    return current as OpenApiParam
}

function resolveParam(
    spec: OpenApiSpec,
    param: OpenApiParam | { $ref: string }
): OpenApiParam | undefined {
    if ('$ref' in param && typeof param.$ref === 'string') {
        return resolveRef(spec, param.$ref)
    }
    return param as OpenApiParam
}

function openApiTypeToZod(schema: OpenApiParam['schema']): z.ZodTypeAny {
    if (!schema) return z.unknown()

    switch (schema.type) {
        case 'string':
            return z.string()
        case 'boolean':
            return z.boolean()
        case 'integer':
            return z.number().int()
        case 'number':
            return z.number()
        case 'array':
            return z.array(z.unknown())
        case 'object':
            return z.record(z.unknown())
        default:
            return z.unknown()
    }
}

const LONG_RUNNING_TOOLS = new Set([
    'sync_sync',
    'sync_bisync',
    'sync_copy',
    'sync_move',
    'sync_resync',
    'operations_size',
    'operations_copyfile',
    'operations_movefile',
    'operations_copyurl',
    'operations_check',
    'operations_purge',
    'operations_delete',
])

function buildInputSchema(
    spec: OpenApiSpec,
    parameters: (OpenApiParam | { $ref: string })[] | undefined,
    toolName: string
): Record<string, z.ZodTypeAny> | undefined {
    const shape: Record<string, z.ZodTypeAny> = {}
    let hasParams = false

    if (parameters) {
        for (const rawParam of parameters) {
            const param = resolveParam(spec, rawParam)
            if (!param || param.in !== 'query') continue

            let zodType = openApiTypeToZod(param.schema)

            if (param.description) {
                zodType = zodType.describe(param.description)
            }

            if (!param.required) {
                zodType = zodType.optional()
            }

            shape[param.name] = zodType
            hasParams = true
        }
    }

    if (LONG_RUNNING_TOOLS.has(toolName)) {
        shape._async = z
            .boolean()
            .optional()
            .describe(
                'Run this operation asynchronously in the background. Highly recommended to set to true for long-running operations to avoid timeout.'
            )
        hasParams = true
    }

    return hasParams ? shape : undefined
}

export function registerTools(
    server: McpServer,
    client: RCDClient,
    enabledToolsets: Set<string>,
    readOnly: boolean
): number {
    const spec: OpenApiSpec = require('rclone-openapi')
    let count = 0

    for (const [apiPath, pathItem] of Object.entries(spec.paths)) {
        const operation = pathItem.post
        if (!operation?.operationId) continue

        const toolset = getToolsetForPath(apiPath)
        if (!toolset || !enabledToolsets.has(toolset)) continue

        if (readOnly && !isReadOnly(operation.operationId)) continue

        let toolName = camelToSnake(operation.operationId)
        if (apiPath === '/operations/list') {
            toolName = 'rclone_lsjson'
        } else if (apiPath === '/operations/about') {
            toolName = 'core_about'
        }

        let description = [operation.summary, operation.description].filter(Boolean).join(' — ')
        if (LONG_RUNNING_TOOLS.has(toolName)) {
            description +=
                '\n\nIMPORTANT: If this operation is expected to take a long time (more than a few seconds), you MUST set `_async: true` to run it in the background. It will return a `jobid` immediately, which you can poll using the `job_status` tool.'
        }

        const inputSchema = buildInputSchema(spec, operation.parameters, toolName)

        const cb = async (args: Record<string, unknown>) => {
            try {
                const queryParams: Record<string, unknown> = {}
                for (const [key, value] of Object.entries(args)) {
                    if (value !== undefined) {
                        queryParams[key] = value
                    }
                }

                const response = await (
                    client as unknown as {
                        POST: (
                            url: string,
                            init?: { params?: { query?: Record<string, unknown> } }
                        ) => Promise<{ data?: unknown; error?: unknown; response: Response }>
                    }
                ).POST(apiPath, {
                    params:
                        Object.keys(queryParams).length > 0 ? { query: queryParams } : undefined,
                })

                if (response.error) {
                    const errMsg =
                        typeof response.error === 'string'
                            ? response.error
                            : JSON.stringify(response.error, null, 2)
                    return {
                        isError: true as const,
                        content: [{ type: 'text' as const, text: 'Error: ' + errMsg }],
                    }
                }

                const text =
                    response.data !== undefined
                        ? JSON.stringify(response.data, null, 2)
                        : `OK (${response.response.status})`

                return {
                    content: [{ type: 'text' as const, text }],
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                return {
                    isError: true as const,
                    content: [{ type: 'text' as const, text: 'Request failed: ' + message }],
                }
            }
        }

        if (inputSchema) {
            server.tool(toolName, description, inputSchema, cb)
        } else {
            server.tool(toolName, description, cb)
        }

        count++
    }

    return count
}
