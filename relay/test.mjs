import worker from './worker.js'
const store = new Map()
const KV = { async get (k, t) { const v = store.get(k); if (v === undefined) return null; return t === 'json' ? JSON.parse(v) : v }, async put (k, v) { store.set(k, v) }, async delete (k) { store.delete(k) }, async list ({ prefix, limit }) { return { keys: [...store.keys()].filter(k => k.startsWith(prefix)).sort().slice(0, limit).map(name => ({ name })) } } }
const call = (p, b) => worker.fetch(new Request('http://x' + p, { method: 'POST', body: JSON.stringify(b) }), { KV }).then(async r => [r.status, await r.json()])
const ib = 'AAAAAAAAAAAAAAAAAAAA'; const pk = 'secret-pull-key-123456'
console.log(await call('/put', { inbox: ib, blob: 'x' }))
console.log(await call('/register', { inbox: ib, pk }))
console.log(await call('/register', { inbox: ib, pk: 'someone-elses-key-1234' }))
console.log(await call('/put', { inbox: ib, blob: 'hello' })); console.log(await call('/put', { inbox: ib, blob: 'world' }))
console.log(await call('/pull', { inbox: ib, pk: 'wrong-key-wrong-key' }))
const [, r] = await call('/pull', { inbox: ib, pk }); console.log(r.items.map(i => i.blob))
console.log(await call('/pull', { inbox: ib, pk, ack: r.items.map(i => i.k) }))
