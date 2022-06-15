import { remove, copy } from 'fs-extra'
import { rename } from 'fs'
// import 'dotenv/config'

await remove('build/assets')

// Build defaults to index.html, we'll access at auth.html
rename('build/index.html', 'build/auth.html', () => {
    console.log('index.html renamed to auth.html')
})

// Copy static assets
await copy('static', 'build')
