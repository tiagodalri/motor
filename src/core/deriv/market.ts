import { publicSocket, TeedsSocket } from './client'
import { ATIVOS_PERMITIDOS } from './config'
import { casasDecimais } from './types'
import type { ActiveSymbol, Candle, Granularity, Tick } from './types'

/** Lista os ativos negociaveis, ja normalizados para o dominio da Teeds. */
export async function fetchActiveSymbols(
  socket: TeedsSocket = publicSocket,
): Promise<ActiveSymbol[]> {
  const res = await socket.send({ active_symbols: 'brief' })
  const list = (res.active_symbols ?? []) as Array<Record<string, any>>
  const ordem = new Map(ATIVOS_PERMITIDOS.map((c, i) => [c as string, i]))
  return list
    .filter((s) => ordem.has(s.underlying_symbol ?? s.symbol))
    .sort((a, b) =>
      (ordem.get(a.underlying_symbol) ?? 99) - (ordem.get(b.underlying_symbol) ?? 99))
    .map((s) => ({
    symbol: s.underlying_symbol ?? s.symbol,
    name: s.underlying_symbol_name ?? s.display_name ?? s.underlying_symbol,
    market: s.market ?? '',
    submarket: s.submarket ?? '',
    isOpen: s.exchange_is_open === 1,
    isSuspended: s.is_trading_suspended === 1,
    pipSize: casasDecimais(s.pip_size),
  }))
}

/** Busca o historico em candles (OHLC). */
export async function fetchCandles(
  symbol: string,
  granularity: Granularity = 60,
  count = 200,
  socket: TeedsSocket = publicSocket,
): Promise<Candle[]> {
  const res = await socket.send({
    ticks_history: symbol,
    end: 'latest',
    count,
    style: 'candles',
    granularity,
  })
  const raw = (res.candles ?? []) as Array<Record<string, any>>
  return raw.map((c) => ({
    epoch: c.epoch,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
  }))
}

/** Busca o historico em ticks (linha). */
export async function fetchTickHistory(
  symbol: string,
  count = 500,
  socket: TeedsSocket = publicSocket,
): Promise<Tick[]> {
  const res = await socket.send({
    ticks_history: symbol,
    end: 'latest',
    count,
    style: 'ticks',
  })
  const history = res.history as { times: number[]; prices: number[] } | undefined
  const pipSize = casasDecimais(res.pip_size)
  if (!history) return []
  return history.times.map((t, i) => ({
    symbol,
    epoch: t,
    quote: Number(history.prices[i]),
    pipSize,
  }))
}

/**
 * Central de precos ao vivo.
 *
 * O grafico, o painel de digitos e cada robo querem o mesmo ativo ao mesmo
 * tempo. Sem isso, cada um abriria a sua propria assinatura na Deriv — mais
 * trafego, mais limite consumido e ticks chegando em momentos diferentes.
 * Aqui uma unica assinatura por ativo alimenta todos os interessados, e quem
 * chega depois recebe o ultimo preco na hora, sem esperar o proximo tick.
 */
type Ouvinte = (tick: Tick) => void

interface Canal {
  ouvintes: Set<Ouvinte>
  parar: (() => void) | null
  ultimo: Tick | null
  encerrar: ReturnType<typeof setTimeout> | null
}

const centrais = new WeakMap<TeedsSocket, Map<string, Canal>>()

/** Carencia antes de fechar um canal sem ouvintes (evita liga-desliga ao trocar de aba). */
const CARENCIA_MS = 5_000

function canalDe(socket: TeedsSocket, symbol: string): Canal {
  let mapa = centrais.get(socket)
  if (!mapa) {
    mapa = new Map()
    centrais.set(socket, mapa)
  }
  let canal = mapa.get(symbol)
  if (!canal) {
    canal = { ouvintes: new Set(), parar: null, ultimo: null, encerrar: null }
    mapa.set(symbol, canal)
  }
  return canal
}

/** Assina o preco ao vivo de um ativo. Retorna a funcao de cancelamento. */
export function subscribeTicks(
  symbol: string,
  onTick: Ouvinte,
  socket: TeedsSocket = publicSocket,
): () => void {
  const canal = canalDe(socket, symbol)
  canal.ouvintes.add(onTick)

  if (canal.encerrar) {
    clearTimeout(canal.encerrar)
    canal.encerrar = null
  }

  // Quem chega no meio do caminho ja comeca com o ultimo preco conhecido.
  if (canal.ultimo) {
    const ultimo = canal.ultimo
    queueMicrotask(() => {
      if (canal.ouvintes.has(onTick)) onTick(ultimo)
    })
  }

  if (!canal.parar) {
    canal.parar = socket.subscribe({ ticks: symbol }, (msg) => {
      if (msg.error || !msg.tick) return
      const t = msg.tick as Record<string, any>
      const tick: Tick = {
        symbol: t.symbol ?? symbol,
        quote: Number(t.quote),
        bid: t.bid !== undefined ? Number(t.bid) : undefined,
        ask: t.ask !== undefined ? Number(t.ask) : undefined,
        epoch: t.epoch,
        pipSize: casasDecimais(t.pip_size),
      }
      canal.ultimo = tick
      canal.ouvintes.forEach((fn) => {
        try {
          fn(tick)
        } catch {
          // um ouvinte quebrado nao pode derrubar os outros
        }
      })
    })
  }

  return () => {
    canal.ouvintes.delete(onTick)
    if (canal.ouvintes.size > 0 || canal.encerrar) return
    canal.encerrar = setTimeout(() => {
      canal.encerrar = null
      if (canal.ouvintes.size > 0) return
      canal.parar?.()
      canal.parar = null
      canal.ultimo = null
      centrais.get(socket)?.delete(symbol)
    }, CARENCIA_MS)
  }
}

/** Ultimo preco ja recebido de um ativo, se houver. */
export function ultimoPreco(symbol: string, socket: TeedsSocket = publicSocket): Tick | null {
  return centrais.get(socket)?.get(symbol)?.ultimo ?? null
}

/**
 * Assina candles ao vivo. A primeira mensagem traz o historico completo;
 * as seguintes atualizam apenas o candle corrente (msg_type "ohlc").
 */
export function subscribeCandles(
  symbol: string,
  granularity: Granularity,
  onHistory: (candles: Candle[]) => void,
  onUpdate: (candle: Candle) => void,
  count = 200,
  socket: TeedsSocket = publicSocket,
): () => void {
  return socket.subscribe(
    { ticks_history: symbol, end: 'latest', count, style: 'candles', granularity },
    (msg) => {
      if (msg.error) return
      if (msg.msg_type === 'candles') {
        const raw = (msg.candles ?? []) as Array<Record<string, any>>
        onHistory(
          raw.map((c) => ({
            epoch: c.epoch,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
          })),
        )
      } else if (msg.msg_type === 'ohlc') {
        const o = msg.ohlc as Record<string, any>
        onUpdate({
          epoch: Number(o.open_time ?? o.epoch),
          open: Number(o.open),
          high: Number(o.high),
          low: Number(o.low),
          close: Number(o.close),
        })
      }
    },
  )
}

/** Hora do servidor da Deriv (util para alinhar o relogio do grafico). */
export async function fetchServerTime(socket: TeedsSocket = publicSocket): Promise<number> {
  const res = await socket.send({ time: 1 })
  return res.time as number
}
