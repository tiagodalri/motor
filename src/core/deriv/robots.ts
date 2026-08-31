import type { TeedsSocket } from './client'
import type { DerivMessage } from './types'

/**
 * Robos da Teeds.
 *
 * A execucao acontece nos servidores da Deriv (familia auto_*), nao no
 * navegador: o robo continua operando com o computador desligado.
 * A Deriv fornece a gestao de banca (Martingale, D'Alembert) e exige
 * sempre stop loss e take profit. O contrato em si e definido por nos.
 */

export type EstrategiaId = 'martingale' | 'dalembert'

export interface Robo {
  runId: string
  estrategia: string
  status: 'running' | 'paused' | 'stopped' | string
  inicio: number
  fim?: number
  motivoParada?: string
  codigoParada?: string
  contratos: number
  totalMovimentado: number
  totalRecebido: number
  resultado: number
  parametros: Record<string, any>
  contrato: Record<string, any>
  /** Contratos comprados nesta corrida, como a Deriv devolve. */
  contratosDetalhe: Array<Record<string, any>>
}

function toRobo(r: Record<string, any>): Robo {
  const movimentado = Number(r.total_stake ?? 0)
  const recebido = Number(r.total_payout ?? 0)
  return {
    runId: String(r.run_id ?? ''),
    estrategia: String(r.strategy_id ?? ''),
    status: r.status ?? 'running',
    inicio: Number(r.start_time ?? 0),
    fim: r.stop_time ? Number(r.stop_time) : undefined,
    motivoParada: r.stop_reason,
    codigoParada: r.stop_reason_code,
    contratos: Array.isArray(r.contracts) ? r.contracts.length : Number(r.contract_count ?? 0),
    totalMovimentado: movimentado,
    totalRecebido: recebido,
    resultado: recebido - movimentado,
    parametros: r.strategy_parameters ?? {},
    contrato: r.contract_template ?? {},
    contratosDetalhe: Array.isArray(r.contracts) ? r.contracts : [],
  }
}

// ------------------------------------------------------------------ modelos

export interface ModeloRobo {
  id: string
  nome: string
  frase: string
  contractType: string
  /** Digito de referencia, quando o contrato usa barreira. */
  barreira?: number
  /** Quantos dos 10 digitos fazem ganhar — base da chance teorica. */
  digitosQueGanham: number
  cor: 'verde' | 'vermelho' | 'azul' | 'roxo'
}

export const MODELOS: ModeloRobo[] = [
  {
    id: 'acima', nome: 'Acima de 5', frase: 'resultado positivo se o último dígito for 6, 7, 8 ou 9',
    contractType: 'DIGITOVER', barreira: 5, digitosQueGanham: 4, cor: 'verde',
  },
  {
    id: 'abaixo', nome: 'Abaixo de 5', frase: 'resultado positivo se o último dígito for 0, 1, 2, 3 ou 4',
    contractType: 'DIGITUNDER', barreira: 5, digitosQueGanham: 5, cor: 'vermelho',
  },
  {
    id: 'par', nome: 'Par', frase: 'resultado positivo se o último dígito for 0, 2, 4, 6 ou 8',
    contractType: 'DIGITEVEN', digitosQueGanham: 5, cor: 'azul',
  },
  {
    id: 'impar', nome: 'Ímpar', frase: 'resultado positivo se o último dígito for 1, 3, 5, 7 ou 9',
    contractType: 'DIGITODD', digitosQueGanham: 5, cor: 'roxo',
  },
]

// ------------------------------------------------------------------ comandos

export interface ConfigRobo {
  modelo: ModeloRobo
  symbol: string
  moeda: string
  valorInicial: number
  ticks: number
  estrategia: EstrategiaId
  /** Martingale: fator de multiplicacao apos perda. */
  multiplicador: number
  /** D'Alembert: unidade somada apos perda. */
  unidade: number
  valorMaximo: number
  stopLoss: number
  takeProfit: number
  maxContratos: number
}

export function montarPedido(c: ConfigRobo): Record<string, any> {
  const parametros: Record<string, any> =
    c.estrategia === 'martingale'
      ? {
          initial_stake: String(c.valorInicial),
          multiplier: String(c.multiplicador),
          max_stake: String(c.valorMaximo),
          stop_loss: String(c.stopLoss),
          take_profit: String(c.takeProfit),
        }
      : {
          initial_stake: String(c.valorInicial),
          unit: String(c.unidade),
          max_stake: String(c.valorMaximo),
          stop_loss: String(c.stopLoss),
          take_profit: String(c.takeProfit),
        }
  if (c.maxContratos > 0) parametros.max_contracts = c.maxContratos

  const contrato: Record<string, any> = {
    amount: c.valorInicial,
    basis: 'stake',
    contract_type: c.modelo.contractType,
    currency: c.moeda,
    duration: c.ticks,
    duration_unit: 't',
    underlying_symbol: c.symbol,
  }
  if (c.modelo.barreira !== undefined) contrato.barrier = String(c.modelo.barreira)

  return {
    auto_start: 1,
    strategy_id: c.estrategia,
    strategy_parameters: parametros,
    contract_template: contrato,
  }
}

export async function ligarRobo(socket: TeedsSocket, c: ConfigRobo): Promise<Robo> {
  const res = await socket.send(montarPedido(c))
  return toRobo((res.auto_start as Record<string, any>) ?? {})
}

export async function pararRobo(socket: TeedsSocket, runId: string): Promise<Robo> {
  const res = await socket.send({ auto_stop: 1, run_id: runId })
  return toRobo((res.auto_stop as Record<string, any>) ?? {})
}

export async function pausarRobo(socket: TeedsSocket, runId: string): Promise<Robo> {
  const res = await socket.send({ auto_pause: 1, run_id: runId })
  return toRobo((res.auto_pause as Record<string, any>) ?? {})
}

export async function retomarRobo(socket: TeedsSocket, runId: string): Promise<Robo> {
  const res = await socket.send({ auto_resume: 1, run_id: runId })
  return toRobo((res.auto_resume as Record<string, any>) ?? {})
}

export async function listarRobos(socket: TeedsSocket): Promise<Robo[]> {
  const res = await socket.send({ auto_list: 1 })
  const runs = ((res.auto_list as any)?.runs ?? []) as Array<Record<string, any>>
  return runs.map(toRobo)
}

/** Acompanha um robo em tempo real. */
export function acompanharRobo(
  socket: TeedsSocket,
  runId: string,
  onUpdate: (r: Robo) => void,
): () => void {
  return socket.subscribe({ auto_get: 1, run_id: runId }, (msg: DerivMessage) => {
    if (msg.error || !msg.auto_get) return
    onUpdate(toRobo(msg.auto_get as Record<string, any>))
  })
}

// ------------------------------------------------------------------ a matemática

/**
 * O que realmente acontece com o dinheiro, sem ilusao.
 * chance = digitos que ganham x 10%. A perda esperada por operacao ja
 * inclui a margem da Deriv e o seu markup, porque usa o pagamento real.
 */
export function matematica(digitosQueGanham: number, pagamento: number, valor: number) {
  const chance = digitosQueGanham / 10
  const retornoEsperado = chance * pagamento
  const perdaEsperada = valor - retornoEsperado
  return {
    chancePct: chance * 100,
    multiplicador: pagamento / valor,
    perdaEsperada,
    perdaEsperadaPct: (perdaEsperada / valor) * 100,
  }
}

/**
 * Quantas perdas seguidas o stop loss aguenta numa progressao.
 * Martingale dobra a operação a cada perda: o risco cresce exponencialmente.
 */
export function perdasAteOStop(
  estrategia: EstrategiaId,
  valorInicial: number,
  fatorOuUnidade: number,
  valorMaximo: number,
  stopLoss: number,
) {
  let operação = valorInicial
  let acumulado = 0
  let n = 0
  while (acumulado + operação <= stopLoss && n < 60) {
    acumulado += operação
    n += 1
    const proxima =
      estrategia === 'martingale' ? operação * fatorOuUnidade : operação + fatorOuUnidade
    operação = Math.min(proxima, valorMaximo || proxima)
  }
  return { perdasSuportadas: n, totalPerdido: acumulado, proximaOperação: operação }
}
