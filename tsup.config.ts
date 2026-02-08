import { defineConfig } from 'tsup'

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
    platform: 'node',
    treeshake: true,
    minify: false,
    banner: {
        js: '#!/usr/bin/env node',
    },
})
