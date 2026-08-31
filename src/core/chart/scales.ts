import type { Candle } from '../deriv/types'

export interface Viewport {
  /** Quantidade de candles visiveis. */
  size: number
  /** Quantos candles a direita foram deslocados para tras (0 = colado no agora). */
  offset: number
}

export interface PriceRange {
  min: number
  max: number
}

/** Recorta a fatia visivel da serie conforme o viewport. */
export function slice<T>(data: T[], vp: Viewport): { items: T[]; start: number } {
  const end = Math.max(1, data.length - vp.offset)
  const start = Math.max(0, end - vp.size)
  return { items: data.slice(start, end), start }
}

/** Faixa de precos da fatia visivel, com uma folga de 8% para respiro. */
export function priceRange(candles: Candle[]): PriceRange {
  if (!candles.length) return { min: 0, max: 1 }
  let min = Infinity
  let max = -Infinity
  for (const c of candles) {
    if (c.low < min) min = c.low
    if (c.high > max) max = c.high
  }
  if (min === max) {
    const pad = Math.abs(min) * 0.001 || 1
    return { min: min - pad, max: max + pad }
  }
  const pad = (max - min) * 0.08
  return { min: min - pad, max: max + pad }
}

/** Escolhe marcacoes de preco "redondas" dentro da faixa. */
export function priceTicks(range: PriceRange, target = 5): number[] {
  const span = range.max - range.min
  if (span <= 0) return [range.min]
  const rough = span / target
  const mag = 10 ** Math.floor(Math.log10(rough))
  const norm = rough / mag
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag
  const first = Math.ceil(range.min / step) * step
  const out: number[] = []
  for (let v = first; v <= range.max; v += step) out.push(Number(v.toFixed(10)))
  return out
}

export function formatPrice(value: number, pipSize = 2): string {
  return value.toFixed(pipSize)
}

export function formatClock(epoch: number): string {
  const d = new Date(epoch * 1000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatDateTime(epoch: number): string {
  const d = new Date(epoch * 1000)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month} ${formatClock(epoch)}`
}
