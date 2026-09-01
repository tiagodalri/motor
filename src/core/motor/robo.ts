import { OrdemRecusada, type Contrato, type Livro } from './livro'
import { PARAMETROS, type TipoContrato } from './precos'
import type { MotorDeTicks } from './ticks'

/**
 * AG7 contra a casa própria.
 *
 * A mesma regra que roda na Teeds em cima da Deriv, agora do lado de cá do
 * balcão. Isto não é um enfeite: é o teste mais duro que existe para o
 * controle de risco, porque um martingale é exatamente o padrão de aposta
 * que quebra casa. Ele aposta pequeno quase sempre e, na hora em que a
 * casa está perdendo, aposta grande — a pior correlação possível para
 * quem está do outro lado.
 *
 * A regra:
 *  - entra em toda operação, dígito acima de 5 (chance real de 40%)
 *  - mantém a entrada base enquanto as perdas seguidas forem menores que
 *    `galeApos`
 *  - a partir daí, recupera **a sequência inteira de prejuízo** de uma vez
 *  - ganhou, volta para a base
 */

export interface ConfigRobo {
  valorBase: number
  /** Quantas perdas seguidas antes de começar a recuperar. */
  galeApos: number
  /** Multiplicador aplicado ao prejuízo acumulado da sequência. */
  fatorGale: number
  /** Teto de uma entrada. Acima disso o robô desiste da recuperação. */
  valorMaximo: number
  takeProfit: number
  stopLoss: number
  maxOperacoes: number
  tipo: TipoContrato
  barreira: number
  ticks: number
}

export const AG7_PADRAO: ConfigRobo = {
  valorBase: 0.30,
  galeApos: 3,
  fatorGale: 1,
  valorMaximo: 500,
  takeProfit: 0,
  stopLoss: 0,
  maxOperacoes: 0,
  tipo: 'DIGITO_ACIMA',
  barreira: 5,
  ticks: 1,
}

export interface EstadoRobo {
  ligado: boolean
  operacoes: number
  ganhos: number
  perdas: number
  perdasSeguidas: number
  prejuizoDaSequencia: number
  resultado: number
  proximaEntrada: number
  /** Ordens que a casa recusou — o número que interessa para a cobertura. */
  recusadas: number
  ultimaRecusa: string | null
  motivoDaParada: string | null
}

type Ouvinte = (e: EstadoRobo) => void

export class RoboAG7 {
  config: ConfigRobo
  private estado: EstadoRobo
  private livro: Livro
  private motor: MotorDeTicks
  private clienteId: string
  private abertos = new Set<string>()
  private ouvintes = new Set<Ouvinte>()
  private soltarTick: (() => void) | null = null
  private soltarLivro: (() => void) | null = null

  constructor(args: {
    livro: Livro; motor: MotorDeTicks; clienteId: string; config?: Partial<ConfigRobo>
  }) {
    this.livro = args.livro
    this.motor = args.motor
    this.clienteId = args.clienteId
    this.config = { ...AG7_PADRAO, ...args.config }
    this.estado = {
      ligado: false, operacoes: 0, ganhos: 0, perdas: 0, perdasSeguidas: 0,
      prejuizoDaSequencia: 0, resultado: 0, proximaEntrada: this.config.valorBase,
      recusadas: 0, ultimaRecusa: null, motivoDaParada: null,
    }
  }

  escutar(fn: Ouvinte): () => void {
    this.ouvintes.add(fn)
    fn(this.instantaneo)
    return () => this.ouvintes.delete(fn)
  }

  get instantaneo(): EstadoRobo {
    return { ...this.estado }
  }

  ligar(): void {
    if (this.estado.ligado) return
    this.estado.ligado = true
    this.estado.motivoDaParada = null
    this.soltarTick = this.motor.escutar(() => this.aoTick())
    this.soltarLivro = this.livro.escutar((c) => this.aoContrato(c))
    this.avisar()
  }

  desligar(motivo: string | null = null): void {
    this.estado.ligado = false
    this.estado.motivoDaParada = motivo
    this.soltarTick?.(); this.soltarTick = null
    this.soltarLivro?.(); this.soltarLivro = null
    this.avisar()
  }

  /** Volta ao começo sem mexer no saldo. */
  zerar(): void {
    this.estado = {
      ...this.estado, operacoes: 0, ganhos: 0, perdas: 0, perdasSeguidas: 0,
      prejuizoDaSequencia: 0, resultado: 0, proximaEntrada: this.config.valorBase,
      recusadas: 0, ultimaRecusa: null, motivoDaParada: null,
    }
    this.avisar()
  }

  /**
   * Uma operação por vez. O AG7 é sequencial por natureza: a entrada
   * seguinte depende do resultado da anterior, então abrir duas ao mesmo
   * tempo descaracterizaria a regra.
   */
  private aoTick(): void {
    if (!this.estado.ligado || this.abertos.size > 0) return

    const c = this.config
    if (c.maxOperacoes > 0 && this.estado.operacoes >= c.maxOperacoes) {
      return this.desligar(`limite de ${c.maxOperacoes} operações`)
    }
    if (c.takeProfit > 0 && this.estado.resultado >= c.takeProfit) {
      return this.desligar(`alvo de ${c.takeProfit.toFixed(2)} atingido`)
    }
    if (c.stopLoss > 0 && this.estado.resultado <= -c.stopLoss) {
      return this.desligar(`perda de ${c.stopLoss.toFixed(2)} atingida`)
    }

    const valor = Math.max(PARAMETROS.valorMinimo,
      Number(Math.min(this.estado.proximaEntrada, c.valorMaximo).toFixed(2)))

    if (this.livro.saldo(this.clienteId) < valor) {
      return this.desligar('saldo insuficiente para a próxima entrada')
    }

    try {
      const cotacao = this.livro.cotar({
        tipo: c.tipo, barreira: c.barreira, valor, ticks: c.ticks,
      })
      const contrato = this.livro.apostar({
        clienteId: this.clienteId, motor: this.motor, cotacao,
      })
      this.abertos.add(contrato.id)
      this.estado.operacoes += 1
    } catch (e) {
      // Recusa não é erro do robô: é a casa dizendo que não cobre esta
      // aposta agora. Ele espera o próximo tick e tenta de novo — a
      // sequência de gale continua exatamente de onde parou.
      this.estado.recusadas += 1
      this.estado.ultimaRecusa = e instanceof OrdemRecusada
        ? `${e.veredito.camada}: ${e.veredito.motivo}`
        : (e as Error).message
    }
    this.avisar()
  }

  private aoContrato(c: Contrato): void {
    if (!this.abertos.has(c.id) || c.ganhou === null) return
    this.abertos.delete(c.id)

    const resultado = c.resultado ?? 0
    this.estado.resultado = Number((this.estado.resultado + resultado).toFixed(2))

    if (c.ganhou) {
      this.estado.ganhos += 1
      this.estado.perdasSeguidas = 0
      this.estado.prejuizoDaSequencia = 0
      this.estado.proximaEntrada = this.config.valorBase
    } else {
      this.estado.perdas += 1
      this.estado.perdasSeguidas += 1
      this.estado.prejuizoDaSequencia =
        Number((this.estado.prejuizoDaSequencia + c.valor).toFixed(2))
      this.estado.proximaEntrada = this.estado.perdasSeguidas < this.config.galeApos
        ? this.config.valorBase
        : Number((this.config.valorBase
            + this.estado.prejuizoDaSequencia * this.config.fatorGale).toFixed(2))
    }
    this.avisar()
  }

  private avisar(): void {
    const e = this.instantaneo
    this.ouvintes.forEach((fn) => { try { fn(e) } catch { /* ignora */ } })
  }
}
