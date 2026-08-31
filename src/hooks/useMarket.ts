import { useCallback, useEffect, useRef, useState } from 'react'
import { publicSocket, TeedsSocket } from '../core/deriv/client'
import { fetchActiveSymbols, subscribeCandles, subscribeTicks } from '../core/deriv/market'
import type { ActiveSymbol, Candle, ConnectionState, Granularity, Tick } from '../core/deriv/types'

/** Estado da conexao com a Deriv. */
export function useConnection(): ConnectionState {
  const [state, setState] = useState<ConnectionState>('idle')
  useEffect(() => {
    publicSocket.connect()
    return publicSocket.onStateChange(setState)
  }, [])
  return state
}

/** Lista de ativos negociaveis. */
export function useSymbols() {
  const [symbols, setSymbols] = useState<ActiveSymbol[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetchActiveSymbols()
      .then((list) => {
        if (!alive) return
        setSymbols(list)
        setLoading(false)
      })
      .catch((e: Error) => {
        if (!alive) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return { symbols, loading, error }
}

/**
 * Serie de candles de um ativo, mantida viva:
 * a primeira mensagem traz o historico, as seguintes atualizam o candle corrente.
 */
export function useCandleSeries(symbol: string | null, granularity: Granularity) {
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    setError(null)
    setCandles([])

    const stop = subscribeCandles(
      symbol,
      granularity,
      (history) => {
        setCandles(history)
        setLoading(false)
      },
      (update) => {
        setCandles((prev) => {
          if (!prev.length) return [update]
          const last = prev[prev.length - 1]
          if (update.epoch === last.epoch) {
            const next = prev.slice()
            next[next.length - 1] = update
            return next
          }
          if (update.epoch > last.epoch) {
            const next = prev.slice(-999)
            next.push(update)
            return next
          }
          return prev
        })
      },
    )

    const timeout = setTimeout(() => setLoading(false), 12_000)
    return () => {
      clearTimeout(timeout)
      stop()
    }
  }, [symbol, granularity])

  return { candles, loading, error }
}

/** Ultimo preco ao vivo, com a direcao do ultimo movimento. */
export function useLiveTick(symbol: string | null) {
  const [tick, setTick] = useState<Tick | null>(null)
  const [direction, setDirection] = useState<'up' | 'down' | null>(null)
  const prev = useRef<number | null>(null)

  useEffect(() => {
    if (!symbol) return
    setTick(null)
    prev.current = null
    return subscribeTicks(symbol, (t) => {
      if (prev.current !== null) {
        if (t.quote > prev.current) setDirection('up')
        else if (t.quote < prev.current) setDirection('down')
      }
      prev.current = t.quote
      setTick(t)
    })
  }, [symbol])

  return { tick, direction }
}

/** Cotacao de um contrato (proposal) - funciona na conexao publica. */
export function useProposal(params: {
  symbol: string | null
  contractType: 'CALL' | 'PUT'
  amount: number
  duration: number
  durationUnit: 'm' | 't' | 's' | 'h'
  currency?: string
  enabled?: boolean
  /** Conexao a usar. Logado: a da conta, que ja inclui o markup do app. */
  socket?: TeedsSocket | null
}) {
  const {
    symbol, contractType, amount, duration, durationUnit,
    currency = 'USD', enabled = true, socket,
  } = params
  const [payout, setPayout] = useState<number | null>(null)
  const [askPrice, setAskPrice] = useState<number | null>(null)
  const [markup, setMarkup] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const request = useCallback(async () => {
    if (!symbol || !enabled) return
    setLoading(true)
    setError(null)
    try {
      const conexao = socket ?? publicSocket
      const res = await conexao.send({
        proposal: 1,
        amount,
        basis: 'stake',
        contract_type: contractType,
        currency,
        duration,
        duration_unit: durationUnit,
        underlying_symbol: symbol,
      })
      const p = res.proposal as Record<string, any> | undefined
      setPayout(p ? Number(p.payout) : null)
      setAskPrice(p ? Number(p.ask_price) : null)
      const mk = p?.contract_details?.app_markup_amount
      setMarkup(mk !== undefined && mk !== null ? Number(mk) : null)
    } catch (e) {
      setError((e as Error).message)
      setPayout(null)
      setAskPrice(null)
    } finally {
      setLoading(false)
    }
  }, [symbol, contractType, amount, duration, durationUnit, currency, enabled, socket])

  useEffect(() => {
    const id = setTimeout(request, 350)
    return () => clearTimeout(id)
  }, [request])

  return { payout, askPrice, markup, error, loading, refresh: request }
}
