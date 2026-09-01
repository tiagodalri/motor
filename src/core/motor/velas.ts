import type { Candle } from './tipos'
import type { Tick } from './ticks'

/**
 * Velas a partir dos ticks.
 *
 * Contrato de dígito olha tick a tick — a linha basta. Contrato de alta e
 * baixa olha um período inteiro, e aí a vela é a leitura certa: ela diz o
 * que aconteceu **dentro** da janela, não só onde ela terminou. Uma vela
 * de cinco minutos que abriu embaixo, subiu, e fechou onde abriu conta uma
 * história que a linha esconde.
 *
 * O período é fechado pelo relógio do próprio tick, não pela contagem:
 * assim as velas caem sempre nos mesmos minutos cheios e duas telas
 * abertas ao mesmo tempo desenham a mesma coisa.
 */

export interface Periodo {
  id: string
  nome: string
  segundos: number
}

export const PERIODOS: Periodo[] = [
  { id: 's5', nome: '5s', segundos: 5 },
  { id: 's15', nome: '15s', segundos: 15 },
  { id: 's30', nome: '30s', segundos: 30 },
  { id: 'm1', nome: '1 min', segundos: 60 },
  { id: 'm5', nome: '5 min', segundos: 300 },
]

export function agregar(ticks: Tick[], segundos: number): Candle[] {
  if (segundos <= 1) {
    return ticks.map((t) => ({
      epoch: t.epoch, open: t.preco, high: t.preco, low: t.preco, close: t.preco,
    }))
  }
  const velas: Candle[] = []
  let atual: Candle | null = null
  let janela = -1

  for (const t of ticks) {
    const inicio = Math.floor(t.epoch / segundos) * segundos
    if (!atual || inicio !== janela) {
      if (atual) velas.push(atual)
      janela = inicio
      atual = { epoch: inicio, open: t.preco, high: t.preco, low: t.preco, close: t.preco }
      continue
    }
    atual.high = Math.max(atual.high, t.preco)
    atual.low = Math.min(atual.low, t.preco)
    atual.close = t.preco
  }
  if (atual) velas.push(atual)
  return velas
}
