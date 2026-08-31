import { casasDecimais } from './types'
import type { TeedsSocket } from './client'

/**
 * Historico detalhado de operacoes.
 *
 * A tabela de lucros da Deriv traz o essencial, mas nao o preco de entrada,
 * o de saida nem a qual robo a operacao pertence. Esses dados so vem em
 * proposal_open_contract, contrato a contrato — entao buscamos os dois e
 * juntamos aqui.
 */

export interface Operacao {
  contractId: number
  /** Identificador do robo que comprou, quando veio de automacao. */
  runId: string | null
  tipo: string
  ativo: string
  barreira: string | null
  valor: number
  recebido: number
  lucro: number
  ganhou: boolean
  entrada: number | null
  saida: number | null
  /** Ultimo digito da entrada e da saida — o que decide contratos de digito. */
  digitoEntrada: number | null
  digitoSaida: number | null
  pipSize: number
  compra: number
  fim: number
  ticks: number
  longcode: string
}

function ultimoDigito(valor: number | null, pip: number): number | null {
  if (valor === null || !Number.isFinite(valor)) return null
  const t = valor.toFixed(pip)
  return Number(t[t.length - 1])
}

function montar(p: Record<string, any>): Operacao {
  const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v))
  const pip = casasDecimais(p.pip_size)
  const entrada = num(p.entry_spot)
  const saida = num(p.exit_spot)
  const valor = Number(p.buy_price ?? 0)
  const recebido = Number(p.sell_price ?? 0)
  return {
    contractId: Number(p.contract_id),
    runId: p.auto_run_id ? String(p.auto_run_id) : null,
    tipo: p.contract_type ?? '',
    ativo: p.underlying_symbol ?? '',
    barreira: p.barrier != null ? String(p.barrier) : null,
    valor,
    recebido,
    lucro: p.profit != null ? Number(p.profit) : recebido - valor,
    ganhou: p.status === 'won' || (p.profit != null && Number(p.profit) > 0),
    entrada,
    saida,
    digitoEntrada: ultimoDigito(entrada, pip),
    digitoSaida: ultimoDigito(saida, pip),
    pipSize: pip,
    compra: Number(p.purchase_time ?? 0),
    fim: Number(p.exit_spot_time ?? p.sell_time ?? p.date_expiry ?? 0),
    ticks: Number(p.tick_count ?? 0),
    longcode: p.longcode ?? '',
  }
}

/**
 * Cache de contratos ja detalhados.
 *
 * Contrato fechado nao muda mais: uma vez buscado o detalhe, ele vale para
 * sempre nesta sessao. Isso faz a segunda abertura do painel ser instantanea
 * e evita repetir dezenas de chamadas a cada troca de filtro ou de limite.
 */
const cache = new Map<number, Operacao>()

/** Descarta o cache (usado ao trocar de conta). */
export function limparCacheOperacoes(): void {
  cache.clear()
}

/**
 * Busca as ultimas operacoes fechadas, ja com entrada, saida e robo de origem.
 * Faz uma consulta para a lista e depois uma por contrato, em lotes — pulando
 * o que ja esta em cache e entregando resultados parciais conforme chegam.
 */
export async function buscarOperacoes(
  socket: TeedsSocket,
  limite = 60,
  aoProgredir?: (feitas: number, total: number, parciais: Operacao[]) => void,
): Promise<Operacao[]> {
  const tabela = await socket.send({ profit_table: 1, description: 1, limit: limite, sort: 'DESC' })
  const linhas = ((tabela.profit_table as any)?.transactions ?? []) as Array<Record<string, any>>
  const ids = linhas.map((l) => Number(l.contract_id)).filter(Boolean)

  const ordenar = (lista: Operacao[]) => [...lista].sort((a, b) => b.compra - a.compra)
  const detalhes: Operacao[] = []
  const faltam: number[] = []

  for (const id of ids) {
    const guardado = cache.get(id)
    if (guardado) detalhes.push(guardado)
    else faltam.push(id)
  }

  // O que ja estava em cache aparece na tela na hora.
  if (detalhes.length) aoProgredir?.(detalhes.length, ids.length, ordenar(detalhes))
  if (!faltam.length) return ordenar(detalhes)

  const lote = 25
  for (let i = 0; i < faltam.length; i += lote) {
    const parte = faltam.slice(i, i + lote)
    const res = await Promise.all(
      parte.map(async (id) => {
        try {
          const r = await socket.send({ proposal_open_contract: 1, contract_id: id })
          const p = r.proposal_open_contract as Record<string, any> | undefined
          return p ? montar(p) : null
        } catch {
          // se o detalhe falhar, aproveita o basico da tabela de lucros
          const l = linhas.find((x) => Number(x.contract_id) === id)
          if (!l) return null
          return montar({
            contract_id: id, contract_type: l.contract_type, underlying_symbol: l.underlying_symbol,
            buy_price: l.buy_price, sell_price: l.sell_price, purchase_time: l.purchase_time,
            longcode: l.longcode, status: Number(l.sell_price) > Number(l.buy_price) ? 'won' : 'lost',
          })
        }
      }),
    )
    for (const op of res) {
      if (!op) continue
      // So vale guardar contrato encerrado; o aberto ainda vai mudar.
      if (op.fim > 0) cache.set(op.contractId, op)
      detalhes.push(op)
    }
    aoProgredir?.(detalhes.length, ids.length, ordenar(detalhes))
  }
  return ordenar(detalhes)
}

/** Estatisticas de um conjunto de operacoes. */
export function resumir(ops: Operacao[]) {
  const total = ops.length
  const ganhos = ops.filter((o) => o.ganhou).length
  const apostado = ops.reduce((t, o) => t + o.valor, 0)
  const resultado = ops.reduce((t, o) => t + o.lucro, 0)

  // maiores sequencias (a lista vem da mais recente para a mais antiga)
  let seqG = 0, seqP = 0, maxG = 0, maxP = 0
  for (const o of [...ops].reverse()) {
    if (o.ganhou) { seqG += 1; seqP = 0; maxG = Math.max(maxG, seqG) }
    else { seqP += 1; seqG = 0; maxP = Math.max(maxP, seqP) }
  }
  return {
    total, ganhos, perdas: total - ganhos,
    acerto: total ? (ganhos / total) * 100 : 0,
    apostado, movimentado: apostado, resultado,
    retorno: apostado ? (resultado / apostado) * 100 : 0,
    maiorSequenciaGanho: maxG, maiorSequenciaPerda: maxP,
    sequenciaAtualGanho: seqG, sequenciaAtualPerda: seqP,
  }
}

/** Exporta para CSV, para abrir no Excel. */
export function paraCSV(ops: Operacao[]): string {
  const cab = [
    'data', 'hora', 'robo', 'contrato', 'barreira', 'ativo', 'valor',
    'entrada', 'digito_entrada', 'saida', 'digito_saida', 'resultado', 'lucro',
  ]
  const linhas = ops.map((o) => {
    const d = new Date(o.compra * 1000)
    return [
      d.toLocaleDateString('pt-BR'),
      d.toLocaleTimeString('pt-BR'),
      o.runId ?? 'manual',
      o.tipo,
      o.barreira ?? '',
      o.ativo,
      o.valor.toFixed(2),
      o.entrada?.toFixed(o.pipSize) ?? '',
      o.digitoEntrada ?? '',
      o.saida?.toFixed(o.pipSize) ?? '',
      o.digitoSaida ?? '',
      o.ganhou ? 'ganhou' : 'perdeu',
      o.lucro.toFixed(2),
    ].join(';')
  })
  return [cab.join(';'), ...linhas].join('\n')
}
