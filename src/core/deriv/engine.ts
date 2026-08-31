import type { TeedsSocket } from './client'
import { fetchTickHistory, subscribeTicks } from './market'
import { assinarContratos, buscarContrato, comprarDireto } from './trading'
import type { OpenContract } from './trading'
import { marcarOrigem } from './robotNames'
import { ultimoDigito } from './digits'

/**
 * Motor de estrategias da Teeds.
 *
 * Os robos de servidor da Deriv so aceitam Martingale e D'Alembert com um
 * contrato fixo. Estrategias com filtro de entrada — "so entra se os tres
 * ultimos digitos forem X" — precisam de um motor proprio. Este roda no
 * navegador: enquanto a Teeds estiver aberta, ele opera.
 */

export interface Contexto {
  /** Ultimos digitos, do mais antigo para o mais recente. */
  digitos: number[]
  /** Perdas seguidas ate agora. */
  perdasSeguidas: number
  vitoriasSeguidas: number
  operacoes: number
  resultado: number
  /** Quanto a sequencia de perdas atual ja custou (numero positivo). */
  prejuizoDaSequencia: number
  config: ConfigEstrategia
}

export interface Estrategia {
  id: string
  nome: string
  descricao: string
  origem?: string
  contractType: string
  barreira?: number
  ticks: number
  /** Decide se entra agora. */
  entrar: (c: Contexto) => boolean
  /** Texto do que o robo esta esperando, para mostrar na tela. */
  aguardando: (c: Contexto) => string
  /**
   * Estado da condicao de entrada, para a tela desenhar.
   * Cada item e um requisito: o valor lido e se ele passou.
   */
  progresso?: (c: Contexto) => { rotulo: string; itens: Array<{ valor: string; ok: boolean }> }
  /**
   * Entra de novo assim que o contrato liquida, sem esperar o proximo tick.
   * Para estrategias sem filtro de entrada, que operam continuamente.
   */
  entradaContinua?: boolean
  /** Proximo valor apos o resultado de uma operacao. */
  proximoValor: (args: {
    valorAtual: number
    valorInicial: number
    valorAoVencer: number
    ganhou: boolean
    lucro: number
    perdasSeguidas: number
    /** Soma das perdas da sequencia atual, em positivo. */
    prejuizoDaSequencia: number
    config: ConfigEstrategia
  }) => number
}

export interface ConfigEstrategia {
  valorInicial: number
  valorAoVencer: number
  fatorGale: number
  galeApos: number
  valorMaximo: number
  takeProfit: number
  stopLoss: number
  maxOperacoes: number
}

/** Uma operacao ja encerrada, do jeito que a tela precisa mostrar. */
export interface OperacaoMotor {
  n: number
  contractId: number
  valor: number
  entrada: number | null
  saida: number | null
  digitoEntrada: number | null
  digitoSaida: number | null
  lucro: number
  ganhou: boolean
  quando: number
  /** Quantos ticks o robo esperou antes desta entrada. */
  esperou: number
}

/** A operacao que esta correndo agora. */
export interface EmCurso {
  contractId: number
  valor: number
  payout: number
  entrada: number | null
  digitoEntrada: number | null
  spot: number | null
  digitoAtual: number | null
  lucro: number
  comprouEm: number
  /** Milissegundos entre decidir e a Deriv confirmar a compra. */
  latencia: number
}

export interface Registro {
  hora: number
  texto: string
  tipo: 'info' | 'compra' | 'ganho' | 'perda' | 'parada' | 'espera'
}

export interface EstadoMotor {
  rodando: boolean
  emOperacao: boolean
  operacoes: number
  vitorias: number
  derrotas: number
  perdasSeguidas: number
  resultado: number
  movimentado: number
  valorAtual: number
  aguardando: string
  motivoParada: string | null
  registros: Registro[]
  digitos: number[]
  /** Resultado acumulado depois de cada operacao, para desenhar a curva. */
  curva: number[]
  condicao: { rotulo: string; itens: Array<{ valor: string; ok: boolean }> } | null
  ultimoLucro: number | null
  /** Operacoes encerradas, da mais recente para a mais antiga. */
  historico: OperacaoMotor[]
  /** A operacao em andamento, quando ha uma. */
  emCurso: EmCurso | null
  /** Ticks analisados desde a ultima entrada — mostra que o robo esta vivo. */
  ticksAnalisados: number
  /** Media de milissegundos entre decidir e a compra ser confirmada. */
  latenciaMedia: number | null
  /**
   * A ultima recusa da Deriv, do jeito que ela veio.
   *
   * Sem isto na tela, uma compra recusada some: o robo parece rodando e
   * simplesmente nao entra, sem dizer por que.
   */
  falha: { texto: string; quando: number } | null
}

/** Recusas seguidas ate o robo desistir e se desligar, dizendo o motivo. */
const LIMITE_FALHAS = 3

/** Tempo sem nenhum tick que ja e motivo para desconfiar da conexao. */
const SILENCIO_MAXIMO_MS = 25_000

/**
 * Contrato aberto por mais tempo que isto merece uma consulta direta.
 * Um contrato de 1 tick liquida em ~1 s; passou de 4 s, algo se perdeu.
 */
const CONTRATO_PRESO_MS = 4_000

const VAZIO: EstadoMotor = {
  rodando: false, emOperacao: false, operacoes: 0, vitorias: 0, derrotas: 0,
  perdasSeguidas: 0, resultado: 0, movimentado: 0, valorAtual: 0,
  aguardando: '', motivoParada: null, registros: [], digitos: [],
  curva: [0], condicao: null, ultimoLucro: null,
  historico: [], emCurso: null, ticksAnalisados: 0, latenciaMedia: null,
  falha: null,
}

export class MotorTeeds {
  private socket: TeedsSocket
  private estrategia: Estrategia
  private config: ConfigEstrategia
  private symbol: string
  private moeda: string
  private pipSize: number
  private pararTicks: (() => void) | null = null
  private pararContratos: (() => void) | null = null
  private ouvintes = new Set<(e: EstadoMotor) => void>()
  private estado: EstadoMotor = { ...VAZIO }
  private vitoriasSeguidas = 0
  private ultimoEpoch = 0
  private latencias: number[] = []
  private esperaAtual = 0
  /** Quanto a sequencia de perdas atual ja custou. Zera a cada vitoria. */
  private prejuizoDaSequencia = 0
  private ultimoTickEm = 0
  private contratoDesde = 0
  private valorEmCurso = 0
  private falhasSeguidas = 0
  private liquidados = new Set<number>()
  private vigia: ReturnType<typeof setInterval> | null = null

  constructor(opts: {
    socket: TeedsSocket
    estrategia: Estrategia
    config: ConfigEstrategia
    symbol: string
    moeda: string
    pipSize: number
  }) {
    this.socket = opts.socket
    this.estrategia = opts.estrategia
    this.config = opts.config
    this.symbol = opts.symbol
    this.moeda = opts.moeda
    this.pipSize = opts.pipSize
    this.estado.valorAtual = opts.config.valorInicial
  }

  escutar(fn: (e: EstadoMotor) => void): () => void {
    this.ouvintes.add(fn)
    fn(this.estado)
    return () => this.ouvintes.delete(fn)
  }

  private emitir() {
    const copia = { ...this.estado, registros: [...this.estado.registros] }
    this.ouvintes.forEach((f) => f(copia))
  }

  private registrar(texto: string, tipo: Registro['tipo'] = 'info') {
    this.estado.registros = [{ hora: Date.now() / 1000, texto, tipo }, ...this.estado.registros].slice(0, 200)
  }

  private get contexto(): Contexto {
    return {
      digitos: this.estado.digitos,
      perdasSeguidas: this.estado.perdasSeguidas,
      vitoriasSeguidas: this.vitoriasSeguidas,
      operacoes: this.estado.operacoes,
      resultado: this.estado.resultado,
      prejuizoDaSequencia: this.prejuizoDaSequencia,
      config: this.config,
    }
  }

  ligar() {
    if (this.estado.rodando) return
    this.estado = { ...VAZIO, rodando: true, valorAtual: this.config.valorInicial, digitos: [], curva: [0] }
    this.ultimoEpoch = 0
    this.latencias = []
    this.esperaAtual = 0
    this.prejuizoDaSequencia = 0
    this.liquidados = new Set()
    this.registrar(`Robô ligado — ${this.estrategia.nome}`, 'info')
    this.estado.aguardando = 'lendo o histórico do ativo…'
    this.emitir()

    // Sem isto o robo precisaria de tres ticks so para poder olhar a condicao.
    // Com o historico na mao ele ja pode entrar no primeiro tick que chegar.
    void this.semear()

    this.pararTicks = subscribeTicks(this.symbol, (t) => {
      // o mesmo tick pode chegar duas vezes (replay da central + stream)
      if (t.epoch && t.epoch === this.ultimoEpoch) return
      this.ultimoEpoch = t.epoch ?? 0

      this.ultimoTickEm = Date.now()
      const d = ultimoDigito(t.quote, t.pipSize || this.pipSize)
      this.estado.digitos = [...this.estado.digitos, d].slice(-120)
      if (!this.estado.rodando || this.estado.emOperacao) { this.emitir(); return }

      this.estado.ticksAnalisados += 1
      this.esperaAtual += 1

      const ctx = this.contexto
      if (this.estrategia.entrar(ctx)) {
        void this.comprar()
      } else {
        this.estado.aguardando = this.estrategia.aguardando(ctx)
        this.estado.condicao = this.estrategia.progresso?.(ctx) ?? null
        this.emitir()
      }
    }, this.socket)

    // Uma assinatura para todos os contratos da conta, em vez de uma por
    // operacao: e o que impede o teto de 100 assinaturas de estourar.
    this.pararContratos = assinarContratos(
      this.socket,
      (c) => this.receber(c),
      (erro) => this.registrar(`Stream de contratos recusado (${erro})`, 'info'),
    )

    // Vigia: um socket "meio aberto" nao dispara onclose, e o robo ficaria
    // esperando um preco que nunca chega. Silencio longo = reconecta.
    this.ultimoTickEm = Date.now()
    this.vigia = setInterval(() => {
      if (!this.estado.rodando) return
      const silencio = Date.now() - this.ultimoTickEm
      // contrato de 1 tick nao passa de meio minuto aberto: algo se perdeu
      if (this.contratoDesde && Date.now() - this.contratoDesde > CONTRATO_PRESO_MS) {
        const emCurso = this.estado.emCurso
        if (emCurso) void this.conferirContrato(emCurso.contractId, emCurso.valor)
      }
      if (silencio < SILENCIO_MAXIMO_MS) return
      this.ultimoTickEm = Date.now()
      this.registrar('Sem preço há um tempo — refazendo a conexão', 'info')
      this.estado.aguardando = 'sem sinal do mercado — reconectando'
      this.emitir()
      this.socket.reconectarAgora()
    }, 2_000)
  }

  /** Carrega os ultimos digitos do ativo para o robo comecar ja abastecido. */
  private async semear() {
    try {
      const ticks = await fetchTickHistory(this.symbol, 60, this.socket)
      if (!this.estado.rodando || this.estado.digitos.length >= 3) return
      const lidos = ticks.map((t) => ultimoDigito(t.quote, t.pipSize || this.pipSize))
      // o que ja chegou pelo stream tem prioridade: entra no fim
      this.estado.digitos = [...lidos, ...this.estado.digitos].slice(-120)
      const ctx = this.contexto
      this.estado.aguardando = this.estrategia.aguardando(ctx)
      this.estado.condicao = this.estrategia.progresso?.(ctx) ?? null
      this.emitir()
    } catch {
      // sem historico o robo so demora alguns ticks a mais para se orientar
    }
  }

  /** O socket que este motor usa — serve para detectar troca de conta. */
  get conexao(): TeedsSocket {
    return this.socket
  }

  /** Leitura do estado atual, sem precisar assinar. */
  get estadoAtual(): EstadoMotor {
    return this.estado
  }

  desligar(motivo = 'você desligou') {
    if (!this.estado.rodando) return
    this.estado.rodando = false
    this.estado.motivoParada = motivo
    this.pararTicks?.(); this.pararTicks = null
    this.pararContratos?.(); this.pararContratos = null
    if (this.vigia) { clearInterval(this.vigia); this.vigia = null }
    this.registrar(`Robô parado — ${motivo}`, 'parada')
    this.emitir()
  }

  private async comprar() {
    this.estado.emOperacao = true
    this.estado.aguardando = 'comprando…'
    this.emitir()

    const valor = Math.min(
      Math.max(0.35, Number(this.estado.valorAtual.toFixed(2))),
      this.config.valorMaximo || Infinity,
    )
    const partiu = Date.now()

    try {
      // Uma chamada so: no proposal->buy o tick que disparou a entrada ja
      // teria passado antes da compra chegar.
      const recibo = await comprarDireto(
        this.socket,
        {
          symbol: this.symbol,
          contractType: this.estrategia.contractType,
          amount: valor,
          duration: this.estrategia.ticks,
          durationUnit: 't',
          currency: this.moeda,
          ...(this.estrategia.barreira !== undefined ? { barrier: String(this.estrategia.barreira) } : {}),
        },
        // teto de deslizamento: o custo nunca deve passar do valor da entrada
        Number((valor * 1.01).toFixed(2)),
      )

      // deixa a marca para o historico saber de quem foi a operacao
      marcarOrigem(recibo.contractId, this.estrategia.nome)

      const latencia = Date.now() - partiu
      this.latencias = [...this.latencias, latencia].slice(-30)
      this.estado.latenciaMedia = Math.round(
        this.latencias.reduce((t, n) => t + n, 0) / this.latencias.length,
      )
      this.estado.movimentado += recibo.buyPrice || valor
      this.estado.emCurso = {
        contractId: recibo.contractId,
        valor: recibo.buyPrice || valor,
        payout: recibo.payout,
        entrada: null,
        digitoEntrada: null,
        spot: null,
        digitoAtual: null,
        lucro: 0,
        comprouEm: Date.now(),
        latencia,
      }
      this.falhasSeguidas = 0
      this.estado.falha = null
      this.registrar(
        `Entrou com ${this.moeda} ${(recibo.buyPrice || valor).toFixed(2)} · pagamento ${this.moeda} ${recibo.payout.toFixed(2)}`,
        'compra',
      )
      this.emitir()
      this.acompanhar(recibo.contractId, recibo.buyPrice || valor)
    } catch (e) {
      const texto = (e as Error).message
      this.falhasSeguidas += 1
      this.estado.falha = { texto, quando: Date.now() }
      this.estado.emOperacao = false
      this.estado.emCurso = null
      this.registrar(`Compra recusada: ${texto}`, 'parada')

      // Insistir numa recusa que nao vai mudar so queima requisicao — e
      // esconde o problema atras de dezenas de tentativas iguais.
      if (this.falhasSeguidas >= LIMITE_FALHAS) {
        this.desligar(`a Deriv recusou ${LIMITE_FALHAS} compras seguidas — ${texto}`)
        return
      }
      this.emitir()
    }
  }

  /** Marca o inicio do acompanhamento. O stream ja esta aberto desde o ligar. */
  private acompanhar(contractId: number, valor: number) {
    this.contratoDesde = Date.now()
    this.valorEmCurso = valor
  }

  /** Recebe qualquer contrato da conta e reage se for o nosso. */
  private receber(c: OpenContract) {
    const emCurso = this.estado.emCurso
    if (!emCurso || c.contractId !== emCurso.contractId) return
    const casas = c.pipSize || this.pipSize

    if (c.status === 'open' && !c.isExpired) {
      this.estado.emCurso = {
        ...emCurso,
        entrada: c.entrySpot,
        digitoEntrada: c.entrySpot !== null ? ultimoDigito(c.entrySpot, casas) : null,
        spot: c.currentSpot,
        digitoAtual: c.currentSpot !== null ? ultimoDigito(c.currentSpot, casas) : null,
        lucro: c.profit,
        payout: c.payout || emCurso.payout,
      }
      this.emitir()
      return
    }
    this.liquidar(c, c.contractId, this.valorEmCurso || emCurso.valor)
  }

  /**
   * Pergunta o estado de um contrato sem assinar nada.
   *
   * Rede de seguranca para quando o stream nao chega: um contrato de 1 tick
   * que passa de meio minuto aberto nao esta correndo, esta perdido.
   */
  private async conferirContrato(contractId: number, valor: number) {
    if (!this.estado.rodando || this.estado.emCurso?.contractId !== contractId) return
    try {
      const c = await buscarContrato(this.socket, contractId)
      if (this.estado.emCurso?.contractId !== contractId) return
      if (c.status === 'open' && !c.isExpired) return
      this.liquidar(c, contractId, valor)
    } catch {
      // segue tentando no proximo ciclo do vigia
    }
  }

  private liquidar(c: OpenContract, contractId: number, valor: number) {
    // O stream e a consulta direta podem chegar juntos: cada contrato so
    // pode ser contabilizado uma vez.
    if (this.liquidados.has(contractId)) return
    this.liquidados.add(contractId)
    if (this.liquidados.size > 300) {
      this.liquidados = new Set([...this.liquidados].slice(-150))
    }
    this.contratoDesde = 0
    const casas = c.pipSize || this.pipSize

      const ganhou = c.status === 'won' || c.profit > 0
      this.estado.operacoes += 1
      this.estado.resultado += c.profit
      this.estado.emOperacao = false
      this.estado.ultimoLucro = c.profit
      this.estado.curva = [...this.estado.curva, this.estado.resultado].slice(-200)

      const entrada = c.entrySpot ?? this.estado.emCurso?.entrada ?? null
      const saida = c.exitSpot ?? c.currentSpot ?? null
      this.estado.historico = [
        {
          n: this.estado.operacoes,
          contractId,
          valor,
          entrada,
          saida,
          digitoEntrada: entrada !== null ? ultimoDigito(entrada, casas) : null,
          digitoSaida: saida !== null ? ultimoDigito(saida, casas) : null,
          lucro: c.profit,
          ganhou,
          quando: Date.now(),
          esperou: this.esperaAtual,
        },
        ...this.estado.historico,
      ].slice(0, 60)
      this.esperaAtual = 0
      this.estado.ticksAnalisados = 0
      this.estado.emCurso = null

      if (ganhou) {
        this.estado.vitorias += 1
        this.estado.perdasSeguidas = 0
        this.prejuizoDaSequencia = 0
        this.vitoriasSeguidas += 1
        this.registrar(`Ganhou ${this.moeda} ${c.profit.toFixed(2)}`, 'ganho')
      } else {
        this.estado.derrotas += 1
        this.estado.perdasSeguidas += 1
        this.prejuizoDaSequencia += Math.abs(c.profit)
        this.vitoriasSeguidas = 0
        this.registrar(`Perdeu ${this.moeda} ${Math.abs(c.profit).toFixed(2)}`, 'perda')
      }

      this.estado.valorAtual = this.estrategia.proximoValor({
        valorAtual: valor,
        valorInicial: this.config.valorInicial,
        valorAoVencer: this.config.valorAoVencer,
        ganhou,
        lucro: c.profit,
        perdasSeguidas: this.estado.perdasSeguidas,
        prejuizoDaSequencia: this.prejuizoDaSequencia,
        config: this.config,
      })

      // freios
      if (this.config.takeProfit > 0 && this.estado.resultado >= this.config.takeProfit) {
        this.desligar(`meta de lucro atingida (${this.moeda} ${this.estado.resultado.toFixed(2)})`)
        return
      }
      if (this.config.stopLoss > 0 && this.estado.resultado <= -this.config.stopLoss) {
        this.desligar(`limite de perda atingido (${this.moeda} ${this.estado.resultado.toFixed(2)})`)
        return
      }
      if (this.config.maxOperacoes > 0 && this.estado.operacoes >= this.config.maxOperacoes) {
        this.desligar(`limite de ${this.config.maxOperacoes} operações`)
        return
      }
      if (this.config.valorMaximo > 0 && this.estado.valorAtual > this.config.valorMaximo) {
        this.desligar(`próxima entrada (${this.estado.valorAtual.toFixed(2)}) passaria do teto`)
        return
      }

      this.emitir()

      // Sem filtro de entrada nao ha o que esperar: emenda a proxima assim
      // que esta liquida, em vez de perder um tick parado.
      if (this.estrategia.entradaContinua && this.estado.rodando) {
        const ctx = this.contexto
        if (this.estrategia.entrar(ctx)) void this.comprar()
      }
  }
}
