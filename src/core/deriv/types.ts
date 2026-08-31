/** Tipos do dominio da Teeds, espelhando o contrato da API da Deriv. */

/**
 * A Deriv usa o nome pip_size para duas coisas: na lista de ativos ele e o
 * passo minimo (0.01), nos ticks e a quantidade de casas decimais (2).
 * Esta funcao normaliza os dois para casas decimais.
 */
export function casasDecimais(valor: unknown): number {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return 2
  if (n >= 1) return Math.round(n)
  return Math.max(0, Math.round(-Math.log10(n)))
}

export interface Tick {
  symbol: string
  quote: number
  bid?: number
  ask?: number
  epoch: number
  pipSize: number
}

export interface Candle {
  epoch: number
  open: number
  high: number
  low: number
  close: number
}

export interface ActiveSymbol {
  symbol: string
  name: string
  market: string
  submarket: string
  isOpen: boolean
  isSuspended: boolean
  pipSize: number
}

export type Granularity =
  | 60 | 120 | 180 | 300 | 600 | 900 | 1800
  | 3600 | 7200 | 14400 | 28800 | 86400

export interface DerivError {
  code: string
  message: string
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'

/** Mensagem generica da API: um envelope com echo_req e msg_type. */
export interface DerivMessage {
  msg_type: string
  echo_req?: Record<string, unknown>
  req_id?: number
  error?: DerivError
  subscription?: { id: string }
  [key: string]: unknown
}
