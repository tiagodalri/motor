import type { Contrato, Livro } from './livro'

/**
 * Histórico de um trader, calculado do livro — nunca guardado como número.
 *
 * Mesma disciplina da razão, e pela mesma razão: um "acerto de 68%"
 * gravado num campo é um número que alguém pode escrever. Um acerto
 * derivado das operações é um número que só pode ser verdade.
 *
 * Isto é o que um copy trade de verdade precisa publicar. Quem escolhe
 * quem seguir está apostando na régua tanto quanto no trader, então a
 * régua tem de ser reproduzível a partir dos contratos.
 */

export interface Desempenho {
  clienteId: string
  operacoes: number
  ganhos: number
  perdas: number
  /** Fração, não porcentagem. */
  acerto: number
  resultado: number
  apostado: number
  /** Resultado sobre o total apostado. */
  retorno: number
  /** Maior sequência de perdas seguidas. */
  piorSequencia: number
  /** Pior queda do topo até o fundo, ao longo do caminho. */
  piorQueda: number
  /** Curva do resultado acumulado, do primeiro contrato ao último. */
  curva: number[]
}

export function desempenho(livro: Livro, clienteId: string, limite = 500): Desempenho {
  const fechados = livro.historico(clienteId, limite)
    .slice()
    .sort((a, b) => (a.encerradoEm ?? 0) - (b.encerradoEm ?? 0))
  return daLista(clienteId, fechados)
}

export function daLista(clienteId: string, fechados: Contrato[]): Desempenho {
  let acumulado = 0
  let topo = 0
  let piorQueda = 0
  let seguidas = 0
  let piorSequencia = 0
  let ganhos = 0
  let apostado = 0
  const curva: number[] = []

  for (const c of fechados) {
    acumulado = Number((acumulado + (c.resultado ?? 0)).toFixed(2))
    apostado += c.valor
    curva.push(acumulado)
    if (acumulado > topo) topo = acumulado
    const queda = topo - acumulado
    if (queda > piorQueda) piorQueda = queda
    if (c.ganhou) {
      ganhos += 1
      seguidas = 0
    } else {
      seguidas += 1
      if (seguidas > piorSequencia) piorSequencia = seguidas
    }
  }

  const operacoes = fechados.length
  return {
    clienteId,
    operacoes,
    ganhos,
    perdas: operacoes - ganhos,
    acerto: operacoes > 0 ? ganhos / operacoes : 0,
    resultado: acumulado,
    apostado: Number(apostado.toFixed(2)),
    retorno: apostado > 0 ? acumulado / apostado : 0,
    piorSequencia,
    piorQueda: Number(piorQueda.toFixed(2)),
    curva,
  }
}
