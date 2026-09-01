import { CONTA, Razao } from './razao'
import { Risco, LIMITES_PADRAO, type Limites, type Veredito } from './risco'
import { PARAMETROS, cotar, ganhou, type Cotacao, type PedidoCotacao, type TipoContrato } from './precos'
import type { MotorDeTicks, Tick } from './ticks'

/**
 * O livro da casa: recebe ordem, checa risco, lança na razão, acompanha o
 * contrato e liquida quando o tick de expiração chega.
 *
 * Duas regras de estrutura que valem mais que o código:
 *
 *  - **Escritor único por instrumento.** Duas ordens que mexem na mesma
 *    exposição não podem passar por caminhos diferentes. Aqui isso é de
 *    graça (é tudo um processo só); num servidor, seria uma partição por
 *    instrumento no barramento.
 *
 *  - **Liquidação por evento de tick, nunca por relógio.** O contrato
 *    expira no tick N, não em "daqui a 2 segundos". Se o processo cair e
 *    voltar, o replay do log liquida o que ficou para trás. `setTimeout`
 *    aqui seria dinheiro perdido em toda queda.
 */

export interface Contrato {
  id: string
  clienteId: string
  instrumento: string
  tipo: TipoContrato
  barreira: number | null
  valor: number
  pagamento: number
  exposicao: number
  margem: number
  /** Tick em que foi comprado e tick em que liquida. */
  tickEntrada: number
  tickLiquidacao: number
  precoEntrada: number
  digitoEntrada: number
  /** Preenchidos na liquidação. */
  precoSaida: number | null
  digitoSaida: number | null
  ganhou: boolean | null
  /** Resultado do CLIENTE. Positivo = ele ganhou. */
  resultado: number | null
  quando: number
  encerradoEm: number | null
}

export class OrdemRecusada extends Error {
  veredito: Extract<Veredito, { aceita: false }>
  constructor(veredito: Extract<Veredito, { aceita: false }>) {
    super(veredito.motivo)
    this.veredito = veredito
  }
}

type Ouvinte = (c: Contrato) => void

export class Livro {
  readonly razao: Razao
  readonly risco: Risco
  private contratos = new Map<string, Contrato>()
  /** Contratos abertos indexados pelo tick em que liquidam. */
  private porTick = new Map<string, Set<string>>()
  private ouvintes = new Set<Ouvinte>()
  private sequencia = 1

  constructor(razao = new Razao(), limites: Limites = LIMITES_PADRAO) {
    this.razao = razao
    this.risco = new Risco(limites)
    // retoma a numeração de onde a razão guardada parou
    this.sequencia = razao.maiorContrato() + 1
  }

  escutar(fn: Ouvinte): () => void {
    this.ouvintes.add(fn)
    return () => this.ouvintes.delete(fn)
  }

  /** Deposita na conta de um cliente. Dinheiro entra pelo lado externo. */
  depositar(clienteId: string, valor: number, chave = `dep-${Date.now()}-${clienteId}`): void {
    this.razao.lancar(chave, `Depósito de ${clienteId}`, [
      { conta: CONTA.deposito, valor: -valor },
      { conta: CONTA.cliente(clienteId), valor },
    ])
  }

  saldo(clienteId: string): number {
    return this.razao.saldo(CONTA.cliente(clienteId))
  }

  /** Só cota. Não reserva nada, não move dinheiro. */
  cotar(pedido: PedidoCotacao): Cotacao {
    return cotar(pedido)
  }

  /**
   * Aceita a ordem: risco, saldo, lançamento e registro — nesta ordem.
   * `chave` é a idempotência: a mesma ordem enviada duas vezes cobra uma.
   */
  apostar(args: {
    clienteId: string
    motor: MotorDeTicks
    cotacao: Cotacao
    chave?: string
  }): Contrato {
    const { clienteId, motor, cotacao } = args
    const instrumento = motor.instrumento.codigo
    const agora = motor.ultimo
    if (!PARAMETROS.aceitandoOrdens) {
      throw new OrdemRecusada({
        aceita: false, camada: 'disjuntor',
        motivo: 'A casa está com a cotação fechada no momento.',
      })
    }
    if (cotacao.valor < PARAMETROS.valorMinimo) {
      throw new OrdemRecusada({ aceita: false, camada: 'aposta',
        motivo: `O valor mínimo é ${PARAMETROS.valorMinimo}.` })
    }
    if (cotacao.ticks > PARAMETROS.ticksMaximo) {
      throw new OrdemRecusada({ aceita: false, camada: 'aposta',
        motivo: `A duração máxima é ${PARAMETROS.ticksMaximo} ticks.` })
    }
    if (!agora) throw new Error('O mercado ainda não abriu.')
    if (Date.now() > cotacao.valeAte) throw new Error('A cotação venceu. Peça outra.')

    const tickLiquidacao = agora.n + cotacao.ticks

    const veredito = this.risco.avaliar({ clienteId, instrumento, tickLiquidacao, cotacao })
    if (!veredito.aceita) throw new OrdemRecusada(veredito)

    if (this.saldo(clienteId) < cotacao.valor) {
      throw new OrdemRecusada({ aceita: false, camada: 'cliente', motivo: 'Saldo insuficiente.' })
    }

    const id = `c${this.sequencia++}`
    const chave = args.chave ?? `aposta-${id}`

    // o dinheiro sai do cliente e fica preso até liquidar
    this.razao.lancar(chave, `Aposta ${id} · ${cotacao.tipo}`, [
      { conta: CONTA.cliente(clienteId), valor: -cotacao.valor },
      { conta: CONTA.emJogo, valor: cotacao.valor },
    ])

    const contrato: Contrato = {
      id,
      clienteId,
      instrumento,
      tipo: cotacao.tipo,
      barreira: cotacao.barreira,
      valor: cotacao.valor,
      pagamento: cotacao.pagamento,
      exposicao: cotacao.exposicao,
      margem: cotacao.margem,
      tickEntrada: agora.n,
      tickLiquidacao,
      precoEntrada: agora.preco,
      digitoEntrada: agora.digito,
      precoSaida: null,
      digitoSaida: null,
      ganhou: null,
      resultado: null,
      quando: Date.now(),
      encerradoEm: null,
    }

    this.contratos.set(id, contrato)
    const chaveTick = `${instrumento}#${tickLiquidacao}`
    if (!this.porTick.has(chaveTick)) this.porTick.set(chaveTick, new Set())
    this.porTick.get(chaveTick)!.add(id)

    this.risco.abrir(id, {
      clienteId, instrumento, tickLiquidacao, exposicao: cotacao.exposicao,
    })

    this.avisar(contrato)
    return contrato
  }

  /**
   * Liquida tudo que expira neste tick. Chamado pelo evento de tick — é o
   * relógio do sistema.
   */
  liquidarTick(tick: Tick): Contrato[] {
    const chaveTick = `${tick.instrumento}#${tick.n}`
    const ids = this.porTick.get(chaveTick)
    if (!ids || ids.size === 0) return []
    this.porTick.delete(chaveTick)

    const liquidados: Contrato[] = []
    for (const id of ids) {
      const c = this.contratos.get(id)
      if (!c || c.ganhou !== null) continue

      const venceu = ganhou(c.tipo, c.barreira, tick.digito, c.precoEntrada, tick.preco)
      c.precoSaida = tick.preco
      c.digitoSaida = tick.digito
      c.ganhou = venceu
      c.encerradoEm = Date.now()
      c.resultado = venceu
        ? Number((c.pagamento - c.valor).toFixed(2))
        : -c.valor

      if (venceu) {
        // o valor preso volta, a casa completa o pagamento
        this.razao.lancar(`liq-${id}`, `Liquidação ${id} · cliente ganhou`, [
          { conta: CONTA.emJogo, valor: -c.valor },
          { conta: CONTA.casa, valor: -(c.pagamento - c.valor) },
          { conta: CONTA.cliente(c.clienteId), valor: c.pagamento },
        ])
      } else {
        // o valor preso vira receita da casa
        this.razao.lancar(`liq-${id}`, `Liquidação ${id} · casa ganhou`, [
          { conta: CONTA.emJogo, valor: -c.valor },
          { conta: CONTA.casa, valor: c.valor },
        ])
      }

      this.risco.fechar(id, -(c.resultado ?? 0))
      liquidados.push(c)
      this.avisar(c)
    }
    return liquidados
  }

  /** Saque: dinheiro sai para o lado externo. */
  sacar(clienteId: string, valor: number, chave = `saq-${Date.now()}-${clienteId}`): void {
    if (valor <= 0) throw new Error('Valor de saque tem de ser positivo.')
    if (this.saldo(clienteId) < valor) throw new Error('Saldo insuficiente para o saque.')
    this.razao.lancar(chave, `Saque de ${clienteId}`, [
      { conta: CONTA.cliente(clienteId), valor: -valor },
      { conta: CONTA.deposito, valor },
    ])
  }

  /**
   * Ajuste manual: a casa credita ou debita um cliente por decisão humana.
   *
   * Existe em toda plataforma real (estorno, cortesia, correção de bug) e é
   * a operação mais perigosa do sistema — move dinheiro sem que nenhuma
   * regra tenha sido aplicada. Continua sendo partida dobrada: sai da conta
   * da casa, entra na do cliente. O livro fecha; o que muda é de quem é o
   * dinheiro. É por isso que ela precisa de motivo obrigatório.
   */
  ajustarManual(clienteId: string, valor: number, motivo: string,
    chave = `aj-${Date.now()}-${clienteId}`): void {
    if (!motivo.trim()) throw new Error('Ajuste manual exige motivo.')
    if (valor === 0) throw new Error('Ajuste de zero não faz nada.')
    this.razao.lancar(chave, `Ajuste manual · ${clienteId} · ${motivo}`, [
      { conta: CONTA.casa, valor: -valor },
      { conta: CONTA.cliente(clienteId), valor },
    ])
  }

  /**
   * Cancela um contrato aberto e devolve a entrada.
   *
   * O contrato some do livro como se nunca tivesse acontecido — sem
   * resultado, sem margem. Serve para erro operacional; usado com o
   * mercado andando, é a casa escolhendo desfazer as apostas que estão
   * indo mal para ela.
   */
  cancelar(contratoId: string, motivo: string): Contrato {
    const c = this.contratos.get(contratoId)
    if (!c) throw new Error(`Contrato ${contratoId} não existe.`)
    if (c.ganhou !== null) throw new Error(`Contrato ${contratoId} já liquidou.`)

    this.razao.lancar(`can-${contratoId}`, `Cancelamento ${contratoId} · ${motivo}`, [
      { conta: CONTA.emJogo, valor: -c.valor },
      { conta: CONTA.cliente(c.clienteId), valor: c.valor },
    ])

    this.porTick.get(`${c.instrumento}#${c.tickLiquidacao}`)?.delete(contratoId)
    this.risco.fechar(contratoId, 0)
    this.contratos.delete(contratoId)
    return c
  }

  /**
   * Liquida um contrato aberto com o resultado escolhido a dedo.
   *
   * Não consulta o tick. É a alavanca para exercitar caminhos de
   * liquidação sem esperar o mercado — e, sem cerimônia nenhuma, é
   * decidir quem ganha. Quem chama registra como quebra.
   */
  liquidarForcado(contratoId: string, venceu: boolean, motivo: string): Contrato {
    const c = this.contratos.get(contratoId)
    if (!c) throw new Error(`Contrato ${contratoId} não existe.`)
    if (c.ganhou !== null) throw new Error(`Contrato ${contratoId} já liquidou.`)

    c.ganhou = venceu
    c.encerradoEm = Date.now()
    c.resultado = venceu ? Number((c.pagamento - c.valor).toFixed(2)) : -c.valor

    if (venceu) {
      this.razao.lancar(`liq-${contratoId}`, `Liquidação forçada ${contratoId} · ${motivo}`, [
        { conta: CONTA.emJogo, valor: -c.valor },
        { conta: CONTA.casa, valor: -(c.pagamento - c.valor) },
        { conta: CONTA.cliente(c.clienteId), valor: c.pagamento },
      ])
    } else {
      this.razao.lancar(`liq-${contratoId}`, `Liquidação forçada ${contratoId} · ${motivo}`, [
        { conta: CONTA.emJogo, valor: -c.valor },
        { conta: CONTA.casa, valor: c.valor },
      ])
    }

    this.porTick.get(`${c.instrumento}#${c.tickLiquidacao}`)?.delete(contratoId)
    this.risco.fechar(contratoId, -(c.resultado ?? 0))
    this.avisar(c)
    return c
  }

  /** Todos os clientes com movimento na razão. */
  clientes(): Array<{ id: string; saldo: number }> {
    return this.razao.contas()
      .filter((c) => c.startsWith('cliente:'))
      .map((c) => ({ id: c.slice('cliente:'.length), saldo: this.razao.saldo(c) }))
      .sort((a, b) => b.saldo - a.saldo)
  }

  /** Tudo que está aberto na casa inteira, de todos os clientes. */
  get todosAbertos(): Contrato[] {
    return [...this.contratos.values()].filter((c) => c.ganhou === null)
  }

  abertos(clienteId?: string): Contrato[] {
    return [...this.contratos.values()]
      .filter((c) => c.ganhou === null && (!clienteId || c.clienteId === clienteId))
  }

  historico(clienteId?: string, limite = 100): Contrato[] {
    return [...this.contratos.values()]
      .filter((c) => c.ganhou !== null && (!clienteId || c.clienteId === clienteId))
      .sort((a, b) => (b.encerradoEm ?? 0) - (a.encerradoEm ?? 0))
      .slice(0, limite)
  }

  /** A visão da casa: quanto entrou, quanto saiu, e se a margem se realizou. */
  get livroDaCasa() {
    const fechados = [...this.contratos.values()].filter((c) => c.ganhou !== null)
    const apostado = fechados.reduce((t, c) => t + c.valor, 0)
    const resultado = this.razao.saldo(CONTA.casa)
    const esperado = fechados.reduce((t, c) => t + c.valor * c.margem, 0)
    return {
      contratos: fechados.length,
      apostado: Number(apostado.toFixed(2)),
      resultado: Number(resultado.toFixed(2)),
      margemEsperada: Number(esperado.toFixed(2)),
      margemRealizada: apostado > 0 ? resultado / apostado : 0,
      emJogo: Number(this.razao.saldo(CONTA.emJogo).toFixed(2)),
      exposicao: this.risco.exposicaoTotal,
      fecha: this.razao.fecha(),
    }
  }

  private avisar(c: Contrato): void {
    this.ouvintes.forEach((fn) => {
      try { fn(c) } catch { /* um ouvinte quebrado nao derruba o livro */ }
    })
  }
}
