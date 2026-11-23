import esbuild from 'esbuild'
import fs from 'node:fs'
fs.rmSync('dist', { recursive: true, force: true }); fs.mkdirSync('dist/emoji', { recursive: true })
await esbuild.build({ entryPoints: ['src/app.js'], bundle: true, format: 'esm', splitting: true, outdir: 'dist', minify: true, target: ['es2022'], loader: { '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' }, logLevel: 'info' })
for (const f of ['index.html', 'style.css', 'manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png']) fs.copyFileSync('src/' + f, 'dist/' + f)
fs.copyFileSync('node_modules/leaflet/dist/leaflet.css', 'dist/leaflet.css')
fs.copyFileSync('node_modules/emoji-picker-element-data/en/emojibase/data.json', 'dist/emoji/data.json')
