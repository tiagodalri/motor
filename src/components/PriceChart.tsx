import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Candle } from '../core/motor/tipos'
import { CHART, T } from '../core/chart/theme'
import {
  formatClock,
  formatDateTime,
  formatPrice,
  priceRange,
  priceTicks,
  slice,
  type Viewport,
} from '../core/chart/scales'

export type ChartMode = 'candles' | 'line'

/** Uma operacao aberta, desenhada sobre o grafico. */
export interface ContractMarker {
  id: number
  /** CALL (subir) ou PUT (descer). */
  type: string
  entryEpoch: number
  entryPrice: number | null
  expiryEpoch: number
  profit: number
}

interface Props {
  candles: Candle[]
  mode: ChartMode
  pipSize: number
  symbolName: string
  loading?: boolean
  /** Operacoes abertas neste ativo. */
  markers?: ContractMarker[]
}

interface Cursor {
  x: number
  y: number
  index: number
}

/**
 * Grafico da Teeds - desenhado do zero em canvas.
 * Sem bibliotecas de terceiros: controle total sobre desenho e interacao.
 */
export function PriceChart({ candles, mode, pipSize, symbolName, loading, markers = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [vp, setVp] = useState<Viewport>({ size: CHART.defaultCandles, offset: 0 })
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const drag = useRef<{ x: number; offset: number } | null>(null)

  // ------------------------------------------------------------ dimensoes
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const view = useMemo(() => slice(candles, vp), [candles, vp])
  const range = useMemo(() => priceRange(view.items), [view.items])

  // a faixa da direita cresce conforme o tamanho do numero, para nunca cortar
  const padRight = useMemo(() => {
    const exemplo = formatPrice(range.max, pipSize)
    return Math.max(CHART.padRight, exemplo.length * 6.6 + 22)
  }, [range.max, pipSize])

  const plot = useMemo(() => {
    const w = Math.max(0, size.w - padRight - CHART.padLeft)
    const h = Math.max(0, size.h - CHART.padBottom - CHART.padTop)
    return { x: CHART.padLeft, y: CHART.padTop, w, h }
  }, [size, padRight])

  const toY = useCallback(
    (price: number) => plot.y + ((range.max - price) / (range.max - range.min)) * plot.h,
    [plot, range],
  )

  const stepX = view.items.length ? plot.w / view.items.length : 0
  const toX = useCallback((i: number) => plot.x + i * stepX + stepX / 2, [plot, stepX])

  // ------------------------------------------------------------ desenho
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w || !size.h) return

    // Um unico desenho por quadro: varios ticks no mesmo instante nao
    // multiplicam o trabalho da tela.
    const pintar = () => {
      const dpr = window.devicePixelRatio || 1
      const larg = Math.round(size.w * dpr)
      const alt = Math.round(size.h * dpr)
      // redimensionar o buffer e caro: so quando muda mesmo
      if (canvas.width !== larg || canvas.height !== alt) {
        canvas.width = larg
        canvas.height = alt
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size.w, size.h)

      const items = view.items
      if (!items.length) return

      const yTicks = priceTicks(range)

      // --- grade horizontal + eixo de precos
      ctx.font = '11px ui-sans-serif, -apple-system, system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      for (const price of yTicks) {
        const y = toY(price)
        if (y < plot.y - 1 || y > plot.y + plot.h + 1) continue
        ctx.strokeStyle = T.grid
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(plot.x, Math.round(y) + 0.5)
        ctx.lineTo(plot.x + plot.w, Math.round(y) + 0.5)
        ctx.stroke()
        ctx.fillStyle = T.muted
        ctx.textAlign = 'left'
        ctx.fillText(formatPrice(price, pipSize), plot.x + plot.w + 8, y)
      }

      // --- grade vertical + eixo de tempo
      const labelEvery = Math.max(1, Math.ceil(items.length / 6))
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (let i = 0; i < items.length; i += labelEvery) {
        const x = toX(i)
        ctx.strokeStyle = T.grid
        ctx.beginPath()
        ctx.moveTo(Math.round(x) + 0.5, plot.y)
        ctx.lineTo(Math.round(x) + 0.5, plot.y + plot.h)
        ctx.stroke()
        ctx.fillStyle = T.muted
        ctx.fillText(formatClock(items[i].epoch), x, plot.y + plot.h + 7)
      }

      // --- serie
      if (mode === 'candles') {
        const bodyW = Math.max(1, Math.min(14, stepX * 0.66))
        for (let i = 0; i < items.length; i++) {
          const c = items[i]
          const up = c.close >= c.open
          const color = up ? T.up : T.down
          const x = toX(i)
          ctx.strokeStyle = color
          ctx.fillStyle = color
          ctx.lineWidth = 1
          // pavio
          ctx.beginPath()
          ctx.moveTo(Math.round(x) + 0.5, toY(c.high))
          ctx.lineTo(Math.round(x) + 0.5, toY(c.low))
          ctx.stroke()
          // corpo
          const yOpen = toY(c.open)
          const yClose = toY(c.close)
          const top = Math.min(yOpen, yClose)
          const height = Math.max(1, Math.abs(yClose - yOpen))
          ctx.fillRect(Math.round(x - bodyW / 2), Math.round(top), Math.round(bodyW), Math.round(height))
        }
      } else {
        // area + linha
        const grad = ctx.createLinearGradient(0, plot.y, 0, plot.y + plot.h)
        grad.addColorStop(0, 'rgba(76, 111, 255, 0.18)')
        grad.addColorStop(1, 'rgba(76, 111, 255, 0)')
        ctx.beginPath()
        ctx.moveTo(toX(0), toY(items[0].close))
        for (let i = 1; i < items.length; i++) ctx.lineTo(toX(i), toY(items[i].close))
        const lastX = toX(items.length - 1)
        ctx.lineTo(lastX, plot.y + plot.h)
        ctx.lineTo(toX(0), plot.y + plot.h)
        ctx.closePath()
        ctx.fillStyle = grad
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(toX(0), toY(items[0].close))
        for (let i = 1; i < items.length; i++) ctx.lineTo(toX(i), toY(items[i].close))
        ctx.strokeStyle = T.primary
        ctx.lineWidth = 1.75
        ctx.lineJoin = 'round'
        ctx.stroke()
      }

      // --- linha do preco atual
      const last = items[items.length - 1]
      const lastUp = last.close >= last.open
      const yLast = toY(last.close)
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = mode === 'candles' ? (lastUp ? T.up : T.down) : T.primary
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(plot.x, Math.round(yLast) + 0.5)
      ctx.lineTo(plot.x + plot.w, Math.round(yLast) + 0.5)
      ctx.stroke()
      ctx.restore()

      // etiqueta do preco atual
      const label = formatPrice(last.close, pipSize)
      ctx.font = '600 11px ui-sans-serif, -apple-system, system-ui, sans-serif'
      const tw = ctx.measureText(label).width
      const bx = plot.x + plot.w + 4
      ctx.fillStyle = mode === 'candles' ? (lastUp ? T.up : T.down) : T.primary
      roundRect(ctx, bx, yLast - 9, tw + 10, 18, 4)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, bx + 5, yLast)

      // --- operacoes abertas: entrada, faixa de duracao e expiracao
      if (markers.length && items.length > 1) {
        const passo = items[1].epoch - items[0].epoch || 60
        const inicio = items[0].epoch
        const xPara = (epoch: number) => plot.x + ((epoch - inicio) / passo) * stepX + stepX / 2

        for (const m of markers) {
          const subiu = m.type === 'CALL' || m.type === 'MULTUP' || m.type === 'HIGHER'
          const cor = subiu ? T.up : T.down
          const xEntrada = xPara(m.entryEpoch)
          const xFim = xPara(m.expiryEpoch)
          const dentro = (x: number) => x >= plot.x && x <= plot.x + plot.w

          // faixa da duracao do contrato
          const a = Math.max(plot.x, Math.min(xEntrada, xFim))
          const b = Math.min(plot.x + plot.w, Math.max(xEntrada, xFim))
          if (b > a) {
            ctx.fillStyle = subiu ? 'rgba(18,161,80,0.05)' : 'rgba(229,72,77,0.05)'
            ctx.fillRect(a, plot.y, b - a, plot.h)
          }

          // linha do preco de entrada
          if (m.entryPrice != null) {
            const y = toY(m.entryPrice)
            if (y >= plot.y && y <= plot.y + plot.h) {
              ctx.save()
              ctx.setLineDash([2, 3])
              ctx.strokeStyle = cor
              ctx.lineWidth = 1.25
              ctx.beginPath()
              ctx.moveTo(Math.max(plot.x, a), Math.round(y) + 0.5)
              ctx.lineTo(plot.x + plot.w, Math.round(y) + 0.5)
              ctx.stroke()
              ctx.restore()

              // etiqueta "entrada" a esquerda da linha
              ctx.font = '600 10px ui-sans-serif, -apple-system, system-ui, sans-serif'
              const txt = `entrada ${formatPrice(m.entryPrice, pipSize)}`
              const tw2 = ctx.measureText(txt).width
              const lx = Math.min(Math.max(plot.x + 4, xEntrada + 8), plot.x + plot.w - tw2 - 12)
              ctx.fillStyle = cor
              roundRect(ctx, lx - 4, y - 17, tw2 + 8, 14, 3)
              ctx.fill()
              ctx.fillStyle = '#fff'
              ctx.textAlign = 'left'
              ctx.textBaseline = 'middle'
              ctx.fillText(txt, lx, y - 10)

              // seta no ponto exato de entrada
              if (dentro(xEntrada)) {
                ctx.fillStyle = cor
                ctx.beginPath()
                if (subiu) {
                  ctx.moveTo(xEntrada, y - 7); ctx.lineTo(xEntrada - 5, y + 2); ctx.lineTo(xEntrada + 5, y + 2)
                } else {
                  ctx.moveTo(xEntrada, y + 7); ctx.lineTo(xEntrada - 5, y - 2); ctx.lineTo(xEntrada + 5, y - 2)
                }
                ctx.closePath()
                ctx.fill()
              }
            }
          }

          // linha vertical da expiracao
          if (dentro(xFim)) {
            ctx.save()
            ctx.setLineDash([3, 3])
            ctx.strokeStyle = cor
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(Math.round(xFim) + 0.5, plot.y)
            ctx.lineTo(Math.round(xFim) + 0.5, plot.y + plot.h)
            ctx.stroke()
            ctx.restore()

            ctx.font = '600 9.5px ui-sans-serif, -apple-system, system-ui, sans-serif'
            const ft = 'fim'
            const fw = ctx.measureText(ft).width
            ctx.fillStyle = cor
            roundRect(ctx, xFim - fw / 2 - 4, plot.y + 2, fw + 8, 13, 3)
            ctx.fill()
            ctx.fillStyle = '#fff'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(ft, xFim, plot.y + 8.5)
          }
        }
      }

      // --- crosshair
      if (cursor && cursor.index >= 0 && cursor.index < items.length) {
        const cx = toX(cursor.index)
        ctx.save()
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = T.crosshair
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(Math.round(cx) + 0.5, plot.y)
        ctx.lineTo(Math.round(cx) + 0.5, plot.y + plot.h)
        ctx.moveTo(plot.x, Math.round(cursor.y) + 0.5)
        ctx.lineTo(plot.x + plot.w, Math.round(cursor.y) + 0.5)
        ctx.stroke()
        ctx.restore()

        // etiqueta do preco sob o cursor
        const priceAt = range.max - ((cursor.y - plot.y) / plot.h) * (range.max - range.min)
        const pl = formatPrice(priceAt, pipSize)
        ctx.font = '11px ui-sans-serif, -apple-system, system-ui, sans-serif'
        const pw = ctx.measureText(pl).width
        ctx.fillStyle = T.text
        roundRect(ctx, plot.x + plot.w + 4, cursor.y - 9, pw + 10, 18, 4)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.fillText(pl, plot.x + plot.w + 9, cursor.y)
      }
    }

    const frame = requestAnimationFrame(pintar)
    return () => cancelAnimationFrame(frame)
  }, [size, view.items, range, plot, mode, pipSize, cursor, stepX, toX, toY, markers])

  // ------------------------------------------------------------ interacao
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setVp((prev) => {
      const factor = e.deltaY > 0 ? 1.15 : 0.87
      const next = Math.round(prev.size * factor)
      return { ...prev, size: Math.min(CHART.maxCandles, Math.max(CHART.minCandles, next)) }
    })
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, offset: vp.offset }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (drag.current && stepX > 0) {
      const moved = Math.round((e.clientX - drag.current.x) / stepX)
      const maxOffset = Math.max(0, candles.length - vp.size)
      const next = Math.min(maxOffset, Math.max(0, drag.current.offset + moved))
      setVp((prev) => (prev.offset === next ? prev : { ...prev, offset: next }))
      return
    }

    if (x < plot.x || x > plot.x + plot.w || y < plot.y || y > plot.y + plot.h) {
      setCursor(null)
      return
    }
    const index = stepX > 0 ? Math.floor((x - plot.x) / stepX) : -1
    setCursor({ x, y, index })
  }

  const endDrag = () => {
    drag.current = null
  }

  const hovered = cursor && view.items[cursor.index]

  return (
    <div className="chart" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: drag.current ? 'grabbing' : 'crosshair' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          endDrag()
          setCursor(null)
        }}
      />

      {hovered && (
        <div className="chart-tip" style={{ left: Math.min(cursor!.x + 14, size.w - 190) }}>
          <strong>{symbolName}</strong>
          <span>{formatDateTime(hovered.epoch)}</span>
          {mode === 'candles' ? (
            <div className="ohlc">
              <span>A <b>{formatPrice(hovered.open, pipSize)}</b></span>
              <span>M <b>{formatPrice(hovered.high, pipSize)}</b></span>
              <span>m <b>{formatPrice(hovered.low, pipSize)}</b></span>
              <span>F <b>{formatPrice(hovered.close, pipSize)}</b></span>
            </div>
          ) : (
            <div className="ohlc"><span>Preço <b>{formatPrice(hovered.close, pipSize)}</b></span></div>
          )}
        </div>
      )}

      {loading && <div className="chart-loading">carregando mercado…</div>}
      {!loading && !candles.length && <div className="chart-loading">sem dados para este ativo</div>}
    </div>
  )
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
