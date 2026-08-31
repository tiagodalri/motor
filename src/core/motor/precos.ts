/**
 * Motor de cotação.
 *
 * Uma opção binária é uma aposta com probabilidade conhecida. Se a chance
 * de acertar é p, o pagamento justo seria 1/p vezes a entrada. A casa paga
 * menos que isso, e a diferença é a margem:
 *
 *   pagamento = entrada · (1/p) · (1 − margem)
 *   expectativa da casa = 1 − p · multiplicador = margem
 *
 * Aqui as probabilidades são **exatas**, não estimadas: num índice cujos
 * dígitos são uniformes, "maior que 5" é exatamente 40%. Não há modelo
 * para errar — o que existe é a margem, e ela é uma decisão de negócio.
 */

export type TipoContrato =
  | 'DIGITO_ACIMA' | 'DIGITO_ABAIXO' | 'DIGITO_IGUAL' | 'DIGITO_DIFERENTE'
  | 'DIGITO_PAR' | 'DIGITO_IMPAR'
  | 'SUBIR' | 'DESCER'

export interface PedidoCotacao {
  tipo: TipoContrato
  /** Dígito de referência nos contratos que precisam de um. */
  barreira?: number
  valor: number
  /** Duração em ticks. */
  ticks: number
}

export interface Cotacao {
  tipo: TipoContrato
  barreira: number | null
  valor: number
  ticks: number
  /** Chance real de o cliente ganhar. */
  probabilidade: number
  /** Quanto a casa paga se ele ganhar (inclui a entrada de volta). */
  pagamento: number
  multiplicador: number
  /** Expectativa da casa, em fração do valor apostado. */
  margem: number
  /** Quanto a casa perde se o cliente ganhar. */
  exposicao: number
  /** Cotação válida até este instante. */
  valeAte: number
}

/** Margem da casa, por tipo de contrato. É aqui que mora o negócio. */
export const MARGEM: Record<TipoContrato, number> = {
  DIGITO_ACIMA: 0.11,
  DIGITO_ABAIXO: 0.11,
  DIGITO_IGUAL: 0.13,
  DIGITO_DIFERENTE: 0.09,
  DIGITO_PAR: 0.10,
  DIGITO_IMPAR: 0.10,
  SUBIR: 0.08,
  DESCER: 0.08,
}

/** Quanto tempo uma cotação vale. Cotação que não expira é opção de graça. */
const VALIDADE_MS = 5_000

/**
 * Chance real de ganhar.
 *
 * Dígitos: a distribuição é uniforme por construção do índice, então a
 * conta é combinatória pura. Subir/descer: num passeio sem deriva a chance
 * é 50% menos o empate, que num preço arredondado é desprezível.
 */
export function probabilidade(tipo: TipoContrato, barreira?: number): number {
  const b = barreira ?? 5
  switch (tipo) {
    case 'DIGITO_ACIMA': return Math.max(0, 9 - b) / 10
    case 'DIGITO_ABAIXO': return Math.max(0, b) / 10
    case 'DIGITO_IGUAL': return 0.1
    case 'DIGITO_DIFERENTE': return 0.9
    case 'DIGITO_PAR': return 0.5
    case 'DIGITO_IMPAR': return 0.5
    case 'SUBIR': return 0.5
    case 'DESCER': return 0.5
  }
}

/** Frase em português do que precisa acontecer. */
export function regraEmPalavras(tipo: TipoContrato, barreira?: number): string {
  const b = barreira ?? 5
  switch (tipo) {
    case 'DIGITO_ACIMA': return `maior que ${b}`
    case 'DIGITO_ABAIXO': return `menor que ${b}`
    case 'DIGITO_IGUAL': return `igual a ${b}`
    case 'DIGITO_DIFERENTE': return `diferente de ${b}`
    case 'DIGITO_PAR': return 'par'
    case 'DIGITO_IMPAR': return 'ímpar'
    case 'SUBIR': return 'acima do preço de entrada'
    case 'DESCER': return 'abaixo do preço de entrada'
  }
}

/** Os dígitos que fazem o cliente ganhar — usado para desenhar a regra. */
export function digitosQuePagam(tipo: TipoContrato, barreira?: number): number[] {
  const b = barreira ?? 5
  const todos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  switch (tipo) {
    case 'DIGITO_ACIMA': return todos.filter((d) => d > b)
    case 'DIGITO_ABAIXO': return todos.filter((d) => d < b)
    case 'DIGITO_IGUAL': return [b]
    case 'DIGITO_DIFERENTE': return todos.filter((d) => d !== b)
    case 'DIGITO_PAR': return todos.filter((d) => d % 2 === 0)
    case 'DIGITO_IMPAR': return todos.filter((d) => d % 2 === 1)
    default: return []
  }
}

export function cotar(pedido: PedidoCotacao): Cotacao {
  const p = probabilidade(pedido.tipo, pedido.barreira)
  const margem = MARGEM[pedido.tipo]
  const multiplicador = p > 0 ? (1 / p) * (1 - margem) : 0
  const pagamento = Number((pedido.valor * multiplicador).toFixed(2))
  return {
    tipo: pedido.tipo,
    barreira: pedido.barreira ?? null,
    valor: pedido.valor,
    ticks: pedido.ticks,
    probabilidade: p,
    pagamento,
    multiplicador,
    margem,
    // se o cliente ganhar, a casa devolve o pagamento e fica sem a entrada
    exposicao: Number((pagamento - pedido.valor).toFixed(2)),
    valeAte: Date.now() + VALIDADE_MS,
  }
}

/** O contrato ganhou? */
export function ganhou(tipo: TipoContrato, barreira: number | null, digito: number,
  precoEntrada?: number, precoSaida?: number): boolean {
  const b = barreira ?? 5
  switch (tipo) {
    case 'DIGITO_ACIMA': return digito > b
    case 'DIGITO_ABAIXO': return digito < b
    case 'DIGITO_IGUAL': return digito === b
    case 'DIGITO_DIFERENTE': return digito !== b
    case 'DIGITO_PAR': return digito % 2 === 0
    case 'DIGITO_IMPAR': return digito % 2 === 1
    case 'SUBIR': return (precoSaida ?? 0) > (precoEntrada ?? 0)
    case 'DESCER': return (precoSaida ?? 0) < (precoEntrada ?? 0)
  }
}
