import { load } from 'nsfwjs/core'
import { MobileNetV2Model } from 'nsfwjs/models/mobilenet_v2'

let model
export async function classify (blob) {
  if (!model) model = await load('MobileNetV2', { modelDefinitions: [MobileNetV2Model] })
  const bmp = await createImageBitmap(blob)
  const c = document.createElement('canvas')
  const max = 299; const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k))
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close && bmp.close()
  const preds = await model.classify(c)
  const p = {}; preds.forEach(x => { p[x.className] = x.probability })
  const explicit = (p.Porn || 0) + (p.Hentai || 0)
  return { sensitive: explicit >= 0.5 || (p.Sexy || 0) >= 0.8, explicit, probs: p }
}
