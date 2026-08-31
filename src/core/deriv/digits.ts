/**
 * Contratos de digito da Deriv.
 *
 * A operação e sempre sobre o ULTIMO digito da cotacao, considerando a
 * precisao do ativo (pip size). Ex.: cotacao 724.86 com 2 casas -> digito 6.
 * Duracao e contada em ticks (1 a 10), nao em minutos.
 */

export type DigitContract =
  | 'DIGITOVER' | 'DIGITUNDER' | 'DIGITMATCH'
  | 'DIGITDIFF' | 'DIGITEVEN' | 'DIGITODD'

export interface DigitKind {
  tipo: DigitContract
  nome: string
  /** Explicacao curta, ja com o digito escolhido. */
  descricao: (d: number) => string
  /** Precisa que o usuario escolha um digito? */
  usaDigito: boolean
  /** Digitos que podem ser escolhidos para este tipo. */
  digitosValidos: number[]
  /** Quantos dos 10 digitos fazem o contrato ganhar (para a chance teorica). */
  quantosGanham: (d: number) => number
}

const TODOS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export const TIPOS_DIGITO: DigitKind[] = [
  {
    tipo: 'DIGITOVER', nome: 'Acima de', usaDigito: true,
    digitosValidos: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    descricao: (d) => `o último dígito é maior que ${d}`,
    quantosGanham: (d) => 9 - d,
  },
  {
    tipo: 'DIGITUNDER', nome: 'Abaixo de', usaDigito: true,
    digitosValidos: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    descricao: (d) => `o último dígito é menor que ${d}`,
    quantosGanham: (d) => d,
  },
  {
    tipo: 'DIGITMATCH', nome: 'Igual a', usaDigito: true,
    digitosValidos: TODOS,
    descricao: (d) => `o último dígito é exatamente ${d}`,
    quantosGanham: () => 1,
  },
  {
    tipo: 'DIGITDIFF', nome: 'Diferente de', usaDigito: true,
    digitosValidos: TODOS,
    descricao: (d) => `o último dígito é qualquer um menos ${d}`,
    quantosGanham: () => 9,
  },
  {
    tipo: 'DIGITEVEN', nome: 'Par', usaDigito: false,
    digitosValidos: [],
    descricao: () => 'o último dígito é par (0, 2, 4, 6, 8)',
    quantosGanham: () => 5,
  },
  {
    tipo: 'DIGITODD', nome: 'Ímpar', usaDigito: false,
    digitosValidos: [],
    descricao: () => 'o último dígito é ímpar (1, 3, 5, 7, 9)',
    quantosGanham: () => 5,
  },
]

/** Extrai o ultimo digito de uma cotacao, respeitando a precisao do ativo. */
export function ultimoDigito(quote: number, pipSize: number): number {
  const texto = quote.toFixed(pipSize)
  return Number(texto[texto.length - 1])
}

/** Quantas vezes cada digito (0-9) apareceu, em quantidade e percentual. */
export function distribuicao(digitos: number[]): { conta: number[]; pct: number[] } {
  const conta = new Array(10).fill(0)
  for (const d of digitos) if (d >= 0 && d <= 9) conta[d] += 1
  const total = digitos.length || 1
  return { conta, pct: conta.map((c) => (c / total) * 100) }
}

/** Chance teorica de ganhar (cada digito tem 10% de chance, a longo prazo). */
export function chanceTeorica(kind: DigitKind, digito: number): number {
  return kind.quantosGanham(digito) * 10
}
