export const TOOLSET_DEFINITIONS: Record<string, { default: boolean }> = {
    core: { default: true },
    config_read: { default: true },
    operations: { default: true },
    sharing: { default: false },
    sync: { default: false },
    jobs: { default: false },
    config_admin: { default: false },
    operations_advanced: { default: false },
    mount: { default: false },
    serve: { default: false },
    core_advanced: { default: false },
    vfs: { default: false },
    cache: { default: false },
    debug: { default: false },
    backend: { default: false },
    options: { default: false },
    plugins: { default: false },
    fscache: { default: false },
}

const EXACT_PATH_TOOLSETS: Record<string, string> = {
    '/operations/list': 'operations',
    '/operations/stat': 'operations',
    '/operations/size': 'operations',
    '/operations/copyfile': 'operations',
    '/operations/movefile': 'operations',
    '/operations/mkdir': 'operations',
    '/operations/deletefile': 'operations',
    '/config/listremotes': 'config_read',
    '/config/get': 'config_read',
    '/core/version': 'core',
    '/core/stats': 'core',
    '/operations/about': 'core',
    '/operations/publiclink': 'sharing',
    '/config/create': 'config_admin',
    '/config/update': 'config_admin',
    '/config/delete': 'config_admin',
    '/config/password': 'config_admin',
}

const PREFIX_TOOLSETS: Record<string, string> = {
    '/operations/': 'operations_advanced',
    '/config/': 'config_admin',
    '/core/': 'core_advanced',
    '/rc/': 'core_advanced',
    '/sync/': 'sync',
    '/job/': 'jobs',
    '/vfs/': 'vfs',
    '/mount/': 'mount',
    '/serve/': 'serve',
    '/cache/': 'cache',
    '/debug/': 'debug',
    '/backend/': 'backend',
    '/options/': 'options',
    '/pluginsctl/': 'plugins',
    '/fscache/': 'fscache',
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
    if (apiPath in EXACT_PATH_TOOLSETS) {
        return EXACT_PATH_TOOLSETS[apiPath]
    }
    for (const [prefix, toolset] of Object.entries(PREFIX_TOOLSETS)) {
        if (apiPath.startsWith(prefix)) {
            return toolset
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
