import type { TeedsSocket } from './client'

/**
 * Extrato da conta: tudo que entrou e saiu, incluindo depositos e saques.
 * Diferente do historico de operacoes, que so mostra contratos.
 */

export type TipoMovimento = 'buy' | 'sell' | 'deposit' | 'withdrawal'

export interface Movimento {
  id: number
  tipo: TipoMovimento | string
  valor: number
  saldoDepois: number
  quando: number
  descricao: string
  contratoId: number | null
  /** Qual aplicacao originou o movimento (a Teeds tem id proprio). */
  appId: string | null
  shortcode: string | null
  pagamento: number | null
}

const NOMES_CONTRATO: Record<string, string> = {
  DIGITOVER: 'Acima de', DIGITUNDER: 'Abaixo de', DIGITMATCH: 'Igual a',
  DIGITDIFF: 'Diferente de', DIGITEVEN: 'Par', DIGITODD: 'Ímpar',
  CALL: 'Subir', PUT: 'Descer', CALLE: 'Subir ou igual', PUTE: 'Descer ou igual',
  ONETOUCH: 'Toca', NOTOUCH: 'Não toca', RANGE: 'Dentro da faixa',
  UPORDOWN: 'Fora da faixa', MULTUP: 'Multiplicador para cima',
  MULTDOWN: 'Multiplicador para baixo', ACCU: 'Acumulador',
  RESETCALL: 'Reset para cima', RESETPUT: 'Reset para baixo',
  TICKHIGH: 'Tick mais alto', TICKLOW: 'Tick mais baixo',
  TURBOSLONG: 'Turbo para cima', TURBOSSHORT: 'Turbo para baixo',
  VANILLALONGCALL: 'Vanilla de alta', VANILLALONGPUT: 'Vanilla de baixa',
}

const COM_BARREIRA = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF']

/**
 * Descricao em portugues montada a partir do codigo do contrato.
 * A Deriv devolve o texto so em ingles; aqui reescrevemos com os nossos termos.
 * Ex.: DIGITOVER_1HZ100V_17.78_1788198268_1T_5_0 -> "Acima de 5 · 1 tick · Volatility 100 (1s)"
 */
export function descreverContrato(
  shortcode: string | null | undefined,
  nomeAtivo?: (codigo: string) => string,
): string | null {
  if (!shortcode) return null
  const partes = shortcode.split('_')
  const tipo = partes[0]
  if (!tipo || !NOMES_CONTRATO[tipo]) return null

  const ativo = partes[1] ?? ''
  const nome = NOMES_CONTRATO[tipo]
  const pedacos: string[] = []

  if (COM_BARREIRA.includes(tipo)) {
    const barreira = partes.find((p, i) => i >= 4 && /^[0-9]$/.test(p))
    pedacos.push(barreira !== undefined ? `${nome} ${barreira}` : nome)
  } else {
    pedacos.push(nome)
  }

  const duracao = partes.find((p) => /^[0-9]+T$/i.test(p))
  if (duracao) {
    const n = Number(duracao.slice(0, -1))
    pedacos.push(`${n} ${n === 1 ? 'tick' : 'ticks'}`)
  }

  const legivel = nomeAtivo ? nomeAtivo(ativo) : ativo
  if (legivel) pedacos.push(legivel)

  return pedacos.join(' · ')
}

const ROTULOS: Record<string, string> = {
  buy: 'Compra',
  sell: 'Liquidação',
  deposit: 'Depósito',
  withdrawal: 'Saque',
}

export function rotuloTipo(t: string): string {
  return ROTULOS[t] ?? t
}

export async function buscarExtrato(
  socket: TeedsSocket,
  opcoes: {
    limite?: number
    pular?: number
    tipo?: TipoMovimento | 'todos'
    /** Recorte de tempo, em epoch de segundos. O statement exige inteiro. */
    de?: number
    ate?: number
  } = {},
): Promise<{ movimentos: Movimento[]; total: number }> {
  const { limite = 50, pular = 0, tipo = 'todos', de, ate } = opcoes
  const pedido: Record<string, any> = {
    statement: 1,
    description: 1,
    limit: limite,
    offset: pular,
  }
  if (tipo !== 'todos') pedido.action_type = tipo
  if (de !== undefined) pedido.date_from = Math.floor(de)
  if (ate !== undefined) pedido.date_to = Math.floor(ate)

  const res = await socket.send(pedido)
  const s = res.statement as Record<string, any> | undefined
  const linhas = (s?.transactions ?? []) as Array<Record<string, any>>

  return {
    total: Number(s?.count ?? linhas.length),
    movimentos: linhas.map((t) => ({
      id: Number(t.transaction_id),
      tipo: t.action_type ?? '',
      valor: Number(t.amount ?? 0),
      saldoDepois: Number(t.balance_after ?? 0),
      quando: Number(t.transaction_time ?? 0),
      descricao: t.longcode ?? '',
      contratoId: t.contract_id != null ? Number(t.contract_id) : null,
      appId: t.app_id != null ? String(t.app_id) : null,
      shortcode: t.shortcode ?? null,
      pagamento: t.payout != null ? Number(t.payout) : null,
    })),
  }
}

/** Totais do extrato carregado. */
export function resumirExtrato(movs: Movimento[]) {
  let entradas = 0, saidas = 0, depositos = 0, saques = 0
  for (const m of movs) {
    if (m.valor > 0) entradas += m.valor
    else saidas += Math.abs(m.valor)
    if (m.tipo === 'deposit') depositos += m.valor
    if (m.tipo === 'withdrawal') saques += Math.abs(m.valor)
  }
  return {
    entradas, saidas, depositos, saques,
    liquido: entradas - saidas,
    movimentado: entradas + saidas,
    saldoFinal: movs.length ? movs[0].saldoDepois : 0,
  }
}
