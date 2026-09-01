/**
 * Duração de um contrato.
 *
 * Por dentro a unidade é sempre o **tick**, nunca o relógio: o contrato
 * vence no tick N, e é o próprio evento de tick que liquida. Se fosse por
 * relógio, uma queda do processo perderia dinheiro — e uma pausa no motor
 * liquidaria contrato sem preço para liquidar.
 *
 * O que muda aqui é só como a duração é **apresentada**. "5 minutos" é uma
 * forma de dizer 300 ticks num instrumento de 1 tick por segundo, e a
 * conversão acontece na hora de montar a ordem.
 */

export interface Duracao {
  id: string
  nome: string
  /** Duração em segundos. */
  segundos: number
}

/** Para contratos de dígito, onde o tick é a unidade natural. */
export const DURACOES_TICK = [1, 2, 3, 5, 10]

/** Para alta e baixa, onde o que importa é o período. */
export const DURACOES_TEMPO: Duracao[] = [
  { id: 'm1', nome: '1 min', segundos: 60 },
  { id: 'm5', nome: '5 min', segundos: 300 },
  { id: 'm10', nome: '10 min', segundos: 600 },
  { id: 'm15', nome: '15 min', segundos: 900 },
  { id: 'm30', nome: '30 min', segundos: 1_800 },
  { id: 'h1', nome: '1 hora', segundos: 3_600 },
]

/** Quantos ticks cabem numa duração, neste instrumento. */
export function ticksDe(segundos: number, intervaloDoInstrumento: number): number {
  return Math.max(1, Math.round(segundos / Math.max(1, intervaloDoInstrumento)))
}

/** Contagem regressiva legível: 4:07, 1:02:30. */
export function relogio(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const dois = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${dois(m)}:${dois(r)}` : `${m}:${dois(r)}`
}
