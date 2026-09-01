import { ganhou, type TipoContrato } from './precos'

/**
 * Cobertura: o que a mesa consegue pagar.
 *
 * Em opção binária de dígito o futuro tem **dez saídas**, não infinitas.
 * Isso muda tudo: a casa não precisa estimar risco, ela consegue calcular
 * o resultado exato de cada saída possível antes de aceitar a ordem. Se o
 * pior dos dez já deixaria a casa no vermelho, a ordem não entra.
 *
 * É o mecanismo do rateio, dito de outro jeito: o dinheiro que os
 * perdedores põem na mesa é o que paga os ganhadores. Enquanto a casa só
 * aceitar apostas que a mesa cobre, ela não pode perder — não porque deu
 * sorte, mas porque a aposta que a quebraria nunca foi aceita.
 *
 * O preço disso é honesto e não tem como fugir dele: **algumas ordens são
 * recusadas**. Não existe "aceita tudo e nunca perde". O que existe é
 * escolher onde fica a régua, e é isso que a torre deixa ajustar.
 *
 * Um detalhe que quase todo mundo erra: não basta olhar um bucket por vez.
 * Buckets diferentes liquidam em ticks diferentes e podem dar errado todos
 * seguidos, então o que precisa caber no caixa é a **soma dos piores casos
 * de todos os buckets abertos**, de todos os instrumentos.
 */

export interface Posicao {
  tipo: TipoContrato
  barreira: number | null
  /** Entrada, já no caixa da casa enquanto o contrato está aberto. */
  valor: number
  /** O que a casa devolve se o cliente ganhar (inclui a entrada). */
  pagamento: number
}

export interface Cenario {
  digito: number
  /** Só importa para contratos de direção; nos de dígito é indiferente. */
  subiu: boolean
  /** Resultado da casa neste cenário. Positivo = a casa ganha. */
  resultado: number
}

const DIGITOS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

const dependeDaDirecao = (p: Posicao) => p.tipo === 'SUBIR' || p.tipo === 'DESCER'

/**
 * O resultado da casa em cada saída possível deste bucket.
 *
 * Dez cenários quando só há contratos de dígito; vinte quando há também
 * contratos de direção. Vinte é conservador — dígito e direção não são
 * independentes de verdade — e conservador é o lado certo de errar aqui.
 */
export function cenarios(posicoes: Posicao[]): Cenario[] {
  const direcoes = posicoes.some(dependeDaDirecao) ? [true, false] : [true]
  const saida: Cenario[] = []
  for (const digito of DIGITOS) {
    for (const subiu of direcoes) {
      let resultado = 0
      for (const p of posicoes) {
        const clienteGanhou = ganhou(p.tipo, p.barreira, digito, 0, subiu ? 1 : -1)
        // cliente ganhou: a casa devolve a entrada e paga a diferença
        // cliente perdeu: a entrada que estava na mesa vira receita
        resultado += clienteGanhou ? -(p.pagamento - p.valor) : p.valor
      }
      saida.push({ digito, subiu, resultado: Number(resultado.toFixed(2)) })
    }
  }
  return saida
}

/** O cenário que mais dói. É por ele que a admissão decide. */
export function piorCaso(posicoes: Posicao[]): Cenario | null {
  if (posicoes.length === 0) return null
  return cenarios(posicoes).reduce((a, b) => (b.resultado < a.resultado ? b : a))
}

export function melhorCaso(posicoes: Posicao[]): Cenario | null {
  if (posicoes.length === 0) return null
  return cenarios(posicoes).reduce((a, b) => (b.resultado > a.resultado ? b : a))
}

/**
 * Quanto do bucket já está coberto pela própria mesa.
 *
 * 1 = a casa não perde neste bucket em cenário nenhum. Abaixo de 1, a
 * fração do pior caso que as entradas dos outros já pagam.
 */
export function grauDeCobertura(posicoes: Posicao[]): number {
  const pior = piorCaso(posicoes)
  if (!pior) return 1
  if (pior.resultado >= 0) return 1
  const entradas = posicoes.reduce((t, p) => t + p.valor, 0)
  const exposicaoBruta = entradas + Math.abs(pior.resultado)
  return exposicaoBruta > 0 ? entradas / exposicaoBruta : 0
}

/* ------------------------------------------------------------- política */

export type ModoCobertura = 'desligada' | 'estrita' | 'caixa'

export interface Cobertura {
  /**
   * `desligada` — a casa aceita tudo e torce. É o comportamento antigo.
   * `estrita`   — nenhum bucket pode ficar negativo em cenário nenhum.
   *               Garantia absoluta, e a mais restritiva: sem alguém do
   *               outro lado, quase nada entra.
   * `caixa`     — a casa aceita perder, no pior caso somado de tudo que
   *               está aberto, até uma fração do que ela tem.
   */
  modo: ModoCobertura
  /** No modo `caixa`: fração do caixa que a casa aceita pôr em risco. */
  fracaoDoCaixa: number
  /** Banca declarada. Somada ao lucro realizado, forma o caixa. */
  banca: number
}

export const COBERTURA_PADRAO: Cobertura = {
  modo: 'caixa',
  fracaoDoCaixa: 0.25,
  banca: 1_000,
}

/**
 * O piso: o pior caso somado nunca pode ficar abaixo disto.
 *
 * A conta do modo `caixa` fecha sozinha. Se o piso é −f·caixa e o pior
 * caso acontece, o caixa novo é (1−f) do anterior — positivo enquanto
 * f < 1. Ou seja: **o caixa nunca chega a zero, então o resultado da casa
 * nunca cai abaixo de −banca**. A casa pode perder a banca que declarou
 * arriscar, e nada além dela. Com f = 1 o piso vira zero junto com o
 * caixa e a casa para de aceitar antes de quebrar.
 */
export function pisoDoCaixa(c: Cobertura, caixa: number): number {
  if (c.modo === 'desligada') return -Infinity
  if (c.modo === 'estrita') return 0
  return -Math.max(0, caixa) * Math.max(0, Math.min(1, c.fracaoDoCaixa))
}
