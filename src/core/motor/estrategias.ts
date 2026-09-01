import type { Estrategia } from './robo'

/**
 * O catálogo de estratégias do copy trade.
 *
 * Duas coisas moram aqui e é importante não confundi-las:
 *
 *  1. **A regra que roda de verdade** (`regra`). Quando alguém copia, é
 *     ela que opera contra o livro da casa, ao vivo, com contrato,
 *     liquidação e razão como qualquer outra ordem.
 *
 *  2. **O histórico de seis meses** (`historico`). Esse é **gerado**. Não
 *     aconteceu. Existe para a tela ter conteúdo enquanto o produto não
 *     tem traders de verdade operando por seis meses.
 *
 * O item 2 precisa continuar berrando que é simulado em qualquer tela que
 * o mostre. Um histórico de rentabilidade inventado, apresentado como se
 * fosse real, é a peça central de praticamente toda fraude de investimento
 * que já existiu — e, mostrado a cliente, deixa de ser um detalhe de
 * layout e vira um problema com a CVM. Enquanto for maquete, tem de estar
 * escrito na cara.
 */

export type NivelDeRisco = 'baixo' | 'médio' | 'alto'

export interface Perfil {
  id: string
  nome: string
  autor: string
  /** Código do instrumento onde ela opera. */
  instrumento: string
  modalidade: string
  descricao: string
  gestao: string
  risco: NivelDeRisco
  seguidores: number
  /** A regra que roda ao vivo quando alguém copia. */
  regra: Estrategia
  /** Parâmetros do gerador do histórico de vitrine. */
  demo: { semente: number; deriva: number; vol: number; opsPorDia: number; acerto: number }
}

export const PERFIS: Perfil[] = [
  {
    id: 'ag7',
    nome: 'AG7',
    autor: 'Mesa Teeds',
    instrumento: 'V100',
    modalidade: 'Dígitos · 7, 8 e 9',
    descricao:
      'Entra em toda vela buscando os três dígitos mais altos. Chance real de 30% e pagamento perto de 3×: '
      + 'é uma estratégia de acerto baixo e pagamento alto, que só fecha no positivo com sequência longa.',
    gestao: 'Martingale após 3 perdas, recuperando a sequência inteira',
    risco: 'alto',
    seguidores: 1_284,
    regra: { id: 'ag7', nome: 'AG7', digitos: [7, 8, 9], tipo: 'DIGITO_ACIMA', barreira: 6, ticks: 1 },
    demo: { semente: 20260901, deriva: 0.9, vol: 26, opsPorDia: 240, acerto: 0.30 },
  },
  {
    id: 'ag2',
    nome: 'AG2',
    autor: 'Mesa Teeds',
    instrumento: 'V25',
    modalidade: 'Dígitos · 0, 1 e 2',
    descricao:
      'O espelho do AG7, no outro extremo da faixa. Mesma chance de 30% e mesmo pagamento, '
      + 'mas com entrada fixa: sem recuperação, o prejuízo de uma sequência ruim não é empurrado para a frente.',
    gestao: 'Entrada fixa, sem recuperação',
    risco: 'médio',
    seguidores: 613,
    regra: { id: 'ag2', nome: 'AG2', digitos: [0, 1, 2], tipo: 'DIGITO_ABAIXO', barreira: 3, ticks: 1 },
    demo: { semente: 77315, deriva: 0.35, vol: 9, opsPorDia: 210, acerto: 0.30 },
  },
  {
    id: 'mare',
    nome: 'Maré Alta',
    autor: 'R. Nakamura',
    instrumento: 'V50',
    modalidade: 'Alta e baixa · 5 min',
    descricao:
      'Compra alta em contratos de cinco minutos, apostando que o índice sobe no período. '
      + 'Num índice sem deriva isso é uma moeda cara: 50% de chance contra 8% de margem da casa.',
    gestao: 'Entrada fixa, um contrato por vez',
    risco: 'médio',
    seguidores: 296,
    regra: { id: 'mare', nome: 'Maré Alta', digitos: [], tipo: 'SUBIR', barreira: 0, ticks: 300 },
    demo: { semente: 4412, deriva: -1.1, vol: 10, opsPorDia: 42, acerto: 0.47 },
  },
  {
    id: 'pendulo',
    nome: 'Pêndulo',
    autor: 'L. Ferraz',
    instrumento: 'V10',
    modalidade: 'Dígitos · pares',
    descricao:
      'Alta frequência no índice mais calmo, sempre em dígito par. Acerto perto de 50% e pagamento perto de 1,8× — '
      + 'o volume é grande, e por isso a margem da casa aparece rápido e sem ruído.',
    gestao: 'Entrada fixa, uma operação por tick',
    risco: 'baixo',
    seguidores: 158,
    regra: { id: 'pendulo', nome: 'Pêndulo', digitos: [0, 2, 4, 6, 8], tipo: 'DIGITO_PAR', barreira: 0, ticks: 1 },
    demo: { semente: 90211, deriva: -0.75, vol: 4, opsPorDia: 430, acerto: 0.50 },
  },
]

export const perfilPorId = (id: string): Perfil =>
  PERFIS.find((p) => p.id === id) ?? PERFIS[0]

/* --------------------------------------------------- histórico de vitrine */

export interface Dia {
  /** AAAA-MM-DD */
  data: string
  resultado: number
  operacoes: number
  ganhos: number
}

export interface Mes {
  /** AAAA-MM */
  mes: string
  rotulo: string
  resultado: number
}

export interface HistoricoDemo {
  /** Sempre verdadeiro. Existe para nenhuma tela esquecer de avisar. */
  simulado: true
  capitalInicial: number
  dias: Dia[]
  curva: number[]
  meses: Mes[]
  operacoes: number
  ganhos: number
  acerto: number
  resultado: number
  /** Sobre o capital inicial. */
  retorno: number
  piorQueda: number
  piorQuedaPct: number
  melhorMes: Mes
  piorMes: Mes
  diasPositivos: number
}

/** Gerador determinístico: a mesma estratégia mostra sempre o mesmo gráfico. */
function semeado(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function historicoDemo(
  perfil: Perfil,
  dias = 182,
  capitalInicial = 1_000,
  ate = new Date(),
): HistoricoDemo {
  const r = semeado(perfil.demo.semente)
  const normal = () => {
    // Box-Muller: sem isso os dias ficam uniformes e a curva não parece
    // resultado de nada — parece uma serra.
    const u = Math.max(1e-9, r())
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
  }

  const lista: Dia[] = []
  const curva: number[] = []
  let acumulado = 0
  let topo = 0
  let piorQueda = 0
  let operacoes = 0
  let ganhos = 0
  let diasPositivos = 0

  for (let i = dias - 1; i >= 0; i -= 1) {
    const d = new Date(ate)
    d.setDate(d.getDate() - i)
    // fim de semana também opera: índice sintético não fecha
    const ops = Math.max(1, Math.round(perfil.demo.opsPorDia * (0.6 + r() * 0.8)))
    const resultado = Number((perfil.demo.deriva + normal() * perfil.demo.vol).toFixed(2))
    const acertoDoDia = Math.min(1, Math.max(0, perfil.demo.acerto + (r() - 0.5) * 0.09))

    acumulado = Number((acumulado + resultado).toFixed(2))
    operacoes += ops
    ganhos += Math.round(ops * acertoDoDia)
    if (resultado > 0) diasPositivos += 1
    if (acumulado > topo) topo = acumulado
    piorQueda = Math.max(piorQueda, topo - acumulado)

    lista.push({
      data: d.toISOString().slice(0, 10),
      resultado,
      operacoes: ops,
      ganhos: Math.round(ops * acertoDoDia),
    })
    curva.push(acumulado)
  }

  const porMes = new Map<string, number>()
  for (const d of lista) {
    const chave = d.data.slice(0, 7)
    porMes.set(chave, Number(((porMes.get(chave) ?? 0) + d.resultado).toFixed(2)))
  }
  const meses: Mes[] = [...porMes.entries()].map(([mes, resultado]) => ({
    mes,
    rotulo: `${MESES_PT[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`,
    resultado,
  }))

  const ordenados = [...meses].sort((a, b) => b.resultado - a.resultado)

  return {
    simulado: true,
    capitalInicial,
    dias: lista,
    curva,
    meses,
    operacoes,
    ganhos,
    acerto: operacoes > 0 ? ganhos / operacoes : 0,
    resultado: acumulado,
    retorno: acumulado / capitalInicial,
    piorQueda: Number(piorQueda.toFixed(2)),
    piorQuedaPct: piorQueda / capitalInicial,
    melhorMes: ordenados[0],
    piorMes: ordenados[ordenados.length - 1],
    diasPositivos,
  }
}
