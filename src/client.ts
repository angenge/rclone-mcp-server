import createRCDClient, { type RCDClient } from 'rclone-sdk'

const DEFAULT_URL = 'http://localhost:5572'

export function createClient(): RCDClient {
    const baseUrl = process.env.RCLONE_URL || DEFAULT_URL
    const user = process.env.RCLONE_USER
    const pass = process.env.RCLONE_PASS

    const headers: Record<string, string> = {}

    if (user && pass) {
        const encoded = Buffer.from(user + ':' + pass).toString('base64')
        headers.Authorization = 'Basic ' + encoded
    }

    return createRCDClient({
        baseUrl,
        headers,
    })
}
