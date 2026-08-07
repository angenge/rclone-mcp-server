export function sanitizeConfig(obj: any): any {
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
