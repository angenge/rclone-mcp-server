export const TOOLSET_DEFINITIONS: Record<string, { paths: string[]; default: boolean }> = {
    core: { paths: ['/core/', '/rc/'], default: true },
    config: { paths: ['/config/'], default: true },
    operations: { paths: ['/operations/'], default: true },
    sync: { paths: ['/sync/'], default: true },
    jobs: { paths: ['/job/'], default: false },
    vfs: { paths: ['/vfs/'], default: false },
    mount: { paths: ['/mount/'], default: false },
    serve: { paths: ['/serve/'], default: false },
    cache: { paths: ['/cache/'], default: false },
    debug: { paths: ['/debug/'], default: false },
    backend: { paths: ['/backend/'], default: false },
    options: { paths: ['/options/'], default: false },
    plugins: { paths: ['/pluginsctl/'], default: false },
    fscache: { paths: ['/fscache/'], default: false },
}

const READ_ONLY_OPERATIONS = new Set([
    // rc
    'rcNoop',
    'rcNoopAuth',
    'rcError',
    'rcList',
    // operations
    'operationsFsinfo',
    'operationsHashsum',
    'operationsHashsumfile',
    'operationsSize',
    'operationsList',
    'operationsStat',
    'operationsAbout',
    'operationsCheck',
    'operationsPubliclink',
    // core
    'coreBwlimit',
    'coreDu',
    'coreGroupList',
    'coreMemstats',
    'corePid',
    'coreStats',
    'coreTransferred',
    'coreVersion',
    // config
    'configDump',
    'configGet',
    'configListremotes',
    'configPaths',
    'configProviders',
    // jobs
    'jobList',
    'jobStatus',
    // mount
    'mountListmounts',
    'mountTypes',
    // cache
    'cacheFetch',
    'cacheStats',
    // fscache
    'fscacheEntries',
    // options
    'optionsBlocks',
    'optionsGet',
    'optionsInfo',
    'optionsLocal',
    // serve
    'serveList',
    'serveTypes',
    // vfs
    'vfsList',
    'vfsQueue',
    'vfsStats',
    // plugins
    'pluginsctlGetPluginsForType',
    'pluginsctlListPlugins',
    'pluginsctlListTestPlugins',
])

export function isReadOnly(operationId: string): boolean {
    return READ_ONLY_OPERATIONS.has(operationId)
}

export function getToolsetForPath(apiPath: string): string | undefined {
    for (const [name, def] of Object.entries(TOOLSET_DEFINITIONS)) {
        if (def.paths.some((prefix) => apiPath.startsWith(prefix))) {
            return name
        }
    }
    return undefined
}

export function resolveToolsets(input: string | undefined): Set<string> {
    const raw = input ?? 'default'
    const parts = raw.split(',').map((s) => s.trim().toLowerCase())

    if (parts.includes('all')) {
        return new Set(Object.keys(TOOLSET_DEFINITIONS))
    }

    const result = new Set<string>()

    for (const part of parts) {
        if (part === 'default') {
            for (const [name, def] of Object.entries(TOOLSET_DEFINITIONS)) {
                if (def.default) result.add(name)
            }
        } else if (part in TOOLSET_DEFINITIONS) {
            result.add(part)
        } else {
            console.warn(`Unknown toolset: "${part}", skipping.`)
        }
    }

    return result
}

export function camelToSnake(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}
