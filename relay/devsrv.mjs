import http from 'node:http'
import worker from './worker.js'
const store = new Map()
const KV = { async get (k, t) { const v = store.get(k); if (v === undefined) return null; return t === 'json' ? JSON.parse(v) : v }, async put (k, v) { store.set(k, v) }, async delete (k) { store.delete(k) }, async list ({ prefix, limit }) { return { keys: [...store.keys()].filter(k => k.startsWith(prefix)).sort().slice(0, limit).map(name => ({ name })) } } }
http.createServer(async (rq, rs) => {
  const chunks = []; for await (const c of rq) chunks.push(c)
  const res = await worker.fetch(new Request('http://x' + rq.url, { method: rq.method, body: ['GET', 'OPTIONS', 'HEAD'].includes(rq.method) ? undefined : Buffer.concat(chunks) }), { KV })
  rs.writeHead(res.status, Object.fromEntries(res.headers)); rs.end(Buffer.from(await res.arrayBuffer()))
}).listen(8002, '127.0.0.1', () => console.log('relay on 8002'))
