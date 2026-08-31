import { DERIV } from './config'
import type { AuthSession } from './auth'

/**
 * Faturamento de markup da Teeds.
 *
 * O markup e a comissao do dono do app: uma porcentagem do PAGAMENTO
 * potencial de cada contrato negociado atraves da aplicacao. Teto de 3%.
 * Exige o escopo application_read no token.
 */

export interface MarkupResumo {
  comissao: number
  volume: number
  pagamentos: number
  contratos: number
  clientes: number
  porApp: Array<{ appId: string; nome: string; comissao: number; volume: number; contratos: number }>
}

export interface DiaMarkup {
  data: string
  comissao: number
  volume: number
  contratos: number
}

export class SemPermissao extends Error {
  constructor() {
    super('O login atual não tem permissão para ler estatísticas.')
    this.name = 'SemPermissao'
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Quantas paginas de extrato o simulador aceita percorrer, e de que tamanho. */
const POR_PAGINA = 999
const MAX_PAGINAS = 12

/** Mesma janela, em epoch de segundos — o que o `statement` exige. */
export function janelaEpoch(dias: number): { de: number; ate: number } {
  const agora = new Date()
  const inicio = new Date()
  inicio.setDate(inicio.getDate() - (dias - 1))
  inicio.setHours(0, 0, 0, 0)
  return { de: Math.floor(inicio.getTime() / 1000), ate: Math.floor(agora.getTime() / 1000) + 60 }
}

export function periodo(dias: number): { de: string; ate: string } {
  const ate = new Date()
  const de = new Date()
  de.setDate(de.getDate() - (dias - 1))
  return { de: iso(de), ate: iso(ate) }
}

async function consultar(session: AuthSession, de: string, ate: string): Promise<any> {
  const url = `${DERIV.restBase}/applications/v1/markup-statistics?date_from=${de}&date_to=${ate}`
  const res = await fetch(url, {
    headers: {
      'Deriv-App-ID': DERIV.appId,
      Authorization: `Bearer ${session.accessToken}`,
    },
  })
  if (res.status === 403) throw new SemPermissao()
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const first = body?.errors?.[0]
    throw new Error(first?.message || body?.message || `Erro ${res.status}`)
  }
  return body?.data ?? {}
}

/** Totais do periodo. */
export async function buscarResumo(session: AuthSession, de: string, ate: string): Promise<MarkupResumo> {
  const d = await consultar(session, de, ate)
  return {
    comissao: Number(d.total_app_markup_usd ?? 0),
    volume: Number(d.total_volume_usd ?? 0),
    pagamentos: Number(d.total_payout_usd ?? 0),
    contratos: Number(d.total_contract_count ?? 0),
    clientes: Number(d.total_client_count ?? 0),
    porApp: (d.breakdown ?? []).map((b: any) => ({
      appId: String(b.app_id ?? b.application_id ?? ''),
      nome: b.app_name ?? b.name ?? '',
      comissao: Number(b.app_markup_usd ?? b.total_app_markup_usd ?? 0),
      volume: Number(b.volume_usd ?? b.total_volume_usd ?? 0),
      contratos: Number(b.contract_count ?? b.total_contract_count ?? 0),
    })),
  }
}

/** Serie diaria, consultando dia a dia (a API so devolve totais por intervalo). */
export async function buscarSerieDiaria(session: AuthSession, dias: number): Promise<DiaMarkup[]> {
  const datas: string[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    datas.push(iso(d))
  }

  const saida: DiaMarkup[] = []
  const lote = 6 // respeita o limite de 60 requisicoes por minuto
  for (let i = 0; i < datas.length; i += lote) {
    const parte = datas.slice(i, i + lote)
    const res = await Promise.all(
      parte.map(async (data) => {
        try {
          const d = await consultar(session, data, data)
          return {
            data,
            comissao: Number(d.total_app_markup_usd ?? 0),
            volume: Number(d.total_volume_usd ?? 0),
            contratos: Number(d.total_contract_count ?? 0),
          }
        } catch (e) {
          if (e instanceof SemPermissao) throw e
          return { data, comissao: 0, volume: 0, contratos: 0 }
        }
      }),
    )
    saida.push(...res)
  }
  return saida
}

/**
 * Simulador de markup, calibrado com medicao real feita em 31/08/2026:
 * a 3%, o pagamento cai para 91,25% do valor sem markup, em qualquer aposta.
 * Interpolamos linearmente entre os dois pontos medidos (0% e 3%).
 */
const QUEDA_A_3 = 0.0875

export function simular(payoutSemMarkup: number, markupPct: number) {
  const m = Math.max(0, Math.min(3, markupPct)) / 100
  const fator = 1 - (m / 0.03) * QUEDA_A_3
  const payout = payoutSemMarkup * fator
  return {
    payoutCliente: payout,
    suaComissao: m * payout,
    clientePerde: payoutSemMarkup - payout,
  }
}

/* ------------------------------------------------------------------ */
/* Markup calculado a partir das operacoes reais da conta             */
/* ------------------------------------------------------------------ */

import type { TeedsSocket } from './client'
import { buscarExtrato, type Movimento } from './statement'

export interface MarkupSimulado {
  operacoes: number
  /** Janela considerada, em dias. */
  dias: number
  /** Bateu no teto de paginas: ha operacoes mais antigas nao contadas. */
  truncado: boolean
  movimentado: number
  pagamentoTotal: number
  comissao: number
  comissaoMedia: number
  porDia: Array<{ data: string; comissao: number; operacoes: number }>
  taxa: number
}

/**
 * Calcula a comissao que as operacoes teriam gerado.
 *
 * A regra da Deriv, medida em 31/08/2026: markup = taxa x PAGAMENTO do
 * contrato. Percorremos as compras feitas pela Teeds (identificadas pelo
 * app_id no extrato) e aplicamos a taxa sobre o pagamento de cada uma.
 * Vale para conta demo tambem — a conta e ficticia, o calculo e o mesmo.
 */
export async function simularComissao(
  socket: TeedsSocket,
  taxa = 0.03,
  dias = 30,
): Promise<MarkupSimulado> {
  const { de, ate } = janelaEpoch(dias)

  // O statement devolve no maximo 999 por vez. Sem paginar, um robo que
  // faz centenas de operacoes por dia empurra as mais antigas para fora da
  // janela e a comissao *diminui* — foi exatamente o que aconteceu.
  const daTeeds: Movimento[] = []
  let pular = 0
  let truncado = false
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const { movimentos } = await buscarExtrato(socket, {
      limite: POR_PAGINA, pular, tipo: 'buy', de, ate,
    })
    for (const m of movimentos) {
      if (m.appId === DERIV.appId && m.pagamento) daTeeds.push(m)
    }
    if (movimentos.length < POR_PAGINA) break
    pular += POR_PAGINA
    if (pagina === MAX_PAGINAS - 1) truncado = true
  }

  const porDia = new Map<string, { comissao: number; operacoes: number }>()
  let comissao = 0
  let movimentado = 0
  let pagamentoTotal = 0

  for (const m of daTeeds) {
    const c = (m.pagamento ?? 0) * taxa
    comissao += c
    pagamentoTotal += m.pagamento ?? 0
    movimentado += Math.abs(m.valor)
    const dia = new Date(m.quando * 1000).toISOString().slice(0, 10)
    const atual = porDia.get(dia) ?? { comissao: 0, operacoes: 0 }
    porDia.set(dia, { comissao: atual.comissao + c, operacoes: atual.operacoes + 1 })
  }

  return {
    operacoes: daTeeds.length,
    movimentado,
    pagamentoTotal,
    comissao,
    comissaoMedia: daTeeds.length ? comissao / daTeeds.length : 0,
    taxa,
    dias,
    truncado,
    porDia: [...porDia.entries()]
      .map(([data, v]) => ({ data, ...v }))
      .sort((a, b) => a.data.localeCompare(b.data)),
  }
}
