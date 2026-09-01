import { Fluxo, abrirCompromisso, sementeNova, type Compromisso } from './aleatorio'

/**
 * Motor de tick.
 *
 * Índices sintéticos são um movimento browniano geométrico simulado:
 *
 *   S(t+1) = S(t) · exp( (μ − σ²/2)·Δt + σ·√Δt · Z )
 *
 * com Z normal padrão vindo do fluxo semeado. Deriva μ zero — a casa ganha
 * pela margem no preço, não empurrando o índice contra o cliente. Isso é
 * uma decisão de produto, não um detalhe: um índice com deriva é um índice
 * viciado, e a prova de honestidade não serviria de nada.
 *
 * O motor é determinístico e guarda a série inteira: dado o par de
 * sementes, qualquer pessoa reproduz tick a tick.
 */

export interface Instrumento {
  codigo: string
  nome: string
  /** Volatilidade anualizada. 1.0 = 100%. */
  volatilidade: number
  /** Segundos entre ticks. */
  intervalo: number
  /** Casas decimais do preço. */
  casas: number
  /** Preço de abertura da série. */
  inicial: number
}

export const INSTRUMENTOS: Instrumento[] = [
  { codigo: 'V10', nome: 'Volatilidade 10', volatilidade: 0.10, intervalo: 1, casas: 3, inicial: 1000 },
  { codigo: 'V25', nome: 'Volatilidade 25', volatilidade: 0.25, intervalo: 1, casas: 3, inicial: 1000 },
  { codigo: 'V50', nome: 'Volatilidade 50', volatilidade: 0.50, intervalo: 1, casas: 3, inicial: 1000 },
  { codigo: 'V100', nome: 'Volatilidade 100', volatilidade: 1.00, intervalo: 1, casas: 2, inicial: 1000 },
]

export interface Tick {
  /** Número do tick desde o início da rodada. É a unidade de tempo do motor. */
  n: number
  instrumento: string
  preco: number
  /** Último dígito do preço — o que decide os contratos de dígito. */
  digito: number
  epoch: number
}

/** Segundos num ano de negociação contínua, para anualizar a volatilidade. */
const ANO = 365 * 24 * 60 * 60

export function ultimoDigito(preco: number, casas: number): number {
  const t = preco.toFixed(casas)
  return Number(t[t.length - 1])
}

type Ouvinte = (t: Tick) => void

/**
 * Uma rodada de um instrumento: o compromisso, a série e quem escuta.
 *
 * "Rodada" existe porque a prova de honestidade tem começo e fim: a semente
 * da casa só pode ser revelada quando ninguém mais vai apostar sobre ela.
 */
export class MotorDeTicks {
  /**
   * Deixou de ser `readonly`: a torre de controle ajusta volatilidade,
   * intervalo e casas decimais com o motor rodando. O objeto é o mesmo que
   * está em INSTRUMENTOS, então a edição vale para a lista inteira.
   */
  instrumento: Instrumento
  private fluxo: Fluxo | null = null
  private compromisso: Compromisso | null = null
  private serie: Tick[] = []
  private ouvintes = new Set<Ouvinte>()
  private relogio: ReturnType<typeof setInterval> | null = null
  /** Fila de dígitos forçados pela torre. Cada um vale para um tick. */
  private forcados: number[] = []
  /**
   * Uma vez verdadeiro, não volta atrás sem abrir rodada nova.
   *
   * Marca que algum tick desta rodada não é mais função pura das sementes.
   * A prova de honestidade continua sendo publicada, mas deixaria de bater
   * na verificação do cliente — então a tela precisa dizer isso na cara.
   */
  adulterada = false
  /** Multiplicador de velocidade da rodada. 1 = tempo real. */
  velocidade = 1

  constructor(instrumento: Instrumento) {
    this.instrumento = instrumento
  }

  /** Abre a rodada. O hash pode ir para a tela na hora. */
  async abrirRodada(sementeCliente = sementeNova(), sementeCasa?: string): Promise<Compromisso> {
    this.parar()
    this.compromisso = await abrirCompromisso(sementeCliente, sementeCasa)
    this.fluxo = await Fluxo.criar(this.compromisso.sementeCasa, sementeCliente)
    this.serie = []
    this.forcados = []
    // rodada nova é a única coisa que limpa a marca de adulteração
    this.adulterada = false
    return this.compromisso
  }

  /** O que a tela pode mostrar antes da revelação. */
  get provaPublica(): { hash: string; sementeCliente: string; ticks: number } | null {
    if (!this.compromisso) return null
    return {
      hash: this.compromisso.hash,
      sementeCliente: this.compromisso.sementeCliente,
      ticks: this.serie.length,
    }
  }

  /** Só depois de encerrada a rodada. Antes disso, revelar seria abrir o jogo. */
  revelar(): Compromisso | null {
    if (this.relogio) return null
    return this.compromisso
  }

  /**
   * Revela com a rodada aberta.
   *
   * Quem conhece a semente da casa e a do cliente calcula todos os preços
   * que ainda vão sair. Vazar isto com apostas em aberto é entregar o
   * jogo — a torre só oferece porque o pedido foi ver tudo solto, e o
   * chamador é obrigado a registrar como quebra.
   */
  revelarAgora(): Compromisso | null {
    if (this.serie.length > 0) this.adulterada = true
    return this.compromisso
  }

  /**
   * Leitura interna do compromisso, para a casa conferir a própria série.
   *
   * Não é revelação: nada sai desta máquina. Confundir as duas coisas faz
   * a torre marcar a rodada como adulterada só porque alguém apertou
   * "conferir" — e um alarme que dispara sozinho é um alarme que ninguém
   * olha mais.
   */
  get compromissoInterno(): Compromisso | null {
    return this.compromisso
  }

  /** Quantos ticks a rodada já produziu. */
  get tamanhoDaSerie(): number {
    return this.serie.length
  }

  ligar(): void {
    if (this.relogio || !this.fluxo) return
    this.gerar()
    this.agendar()
  }

  parar(): void {
    if (this.relogio) clearInterval(this.relogio)
    this.relogio = null
  }

  get rodando(): boolean {
    return this.relogio !== null
  }

  /** Gera exatamente um tick, esteja o motor parado ou andando. */
  passo(): Tick | null {
    if (!this.fluxo) return null
    this.gerar()
    return this.ultimo
  }

  /**
   * Ajusta o instrumento com o motor de pé.
   *
   * Mudar volatilidade no meio da rodada muda a série a partir daqui — os
   * ticks anteriores continuam válidos, os próximos não são mais
   * reproduzíveis pelos parâmetros publicados. Por isso conta como
   * adulteração e quem chama precisa saber disso.
   */
  ajustar(patch: Partial<Instrumento>, marcarAdulterada = true): void {
    const mudouAlgoDaSerie =
      (patch.volatilidade !== undefined && patch.volatilidade !== this.instrumento.volatilidade) ||
      (patch.casas !== undefined && patch.casas !== this.instrumento.casas)
    Object.assign(this.instrumento, patch)
    if (mudouAlgoDaSerie && marcarAdulterada && this.serie.length > 0) this.adulterada = true
    if (this.relogio) { clearInterval(this.relogio); this.agendar() }
  }

  definirVelocidade(v: number): void {
    this.velocidade = Math.max(0.1, Math.min(50, v))
    if (this.relogio) { clearInterval(this.relogio); this.agendar() }
  }

  /**
   * Força o último dígito dos próximos ticks.
   *
   * Isto existe para exercitar caminhos de liquidação que a sorte levaria
   * horas para produzir — dez perdas seguidas, o bucket estourando, o
   * disjuntor abrindo. É também, literalmente, a alavanca de fraudar o
   * jogo. Ela suja a rodada de forma permanente e visível de propósito:
   * num sistema com dinheiro real, esta função não deveria existir em
   * produção, e sim num ambiente de testes com as mesmas sementes.
   */
  forcarDigitos(digitos: number[]): void {
    this.forcados.push(...digitos.map((d) => Math.max(0, Math.min(9, Math.round(d)))))
    this.adulterada = true
  }

  limparForcados(): void {
    this.forcados = []
  }

  get forcadosPendentes(): number[] {
    return [...this.forcados]
  }

  private agendar(): void {
    const ms = Math.max(50, (this.instrumento.intervalo * 1000) / this.velocidade)
    this.relogio = setInterval(() => this.gerar(), ms)
  }

  escutar(fn: Ouvinte): () => void {
    this.ouvintes.add(fn)
    return () => this.ouvintes.delete(fn)
  }

  get ultimo(): Tick | null {
    return this.serie.length ? this.serie[this.serie.length - 1] : null
  }

  historico(quantos = 200): Tick[] {
    return this.serie.slice(-quantos)
  }

  /** Recomputa a série do zero a partir das sementes — é o que o cliente roda. */
  static async reproduzir(
    instrumento: Instrumento,
    sementeCasa: string,
    sementeCliente: string,
    quantos: number,
  ): Promise<Tick[]> {
    const fluxo = await Fluxo.criar(sementeCasa, sementeCliente)
    const dt = instrumento.intervalo / ANO
    const passo = instrumento.volatilidade * Math.sqrt(dt)
    const ajuste = -0.5 * instrumento.volatilidade ** 2 * dt
    let preco = instrumento.inicial
    const saida: Tick[] = []
    for (let n = 1; n <= quantos; n += 1) {
      // Compõe a partir do preço JÁ ARREDONDADO, exatamente como `gerar`.
      // Compor do valor cheio e arredondar só na saída daria uma série
      // parecida e diferente: as duas divergem devagar, e a verificação do
      // cliente falharia sem que ninguém tivesse mexido em nada. O preço
      // publicado é o preço arredondado — então é ele que entra no próximo
      // passo, aqui e lá.
      preco = Number((preco * Math.exp(ajuste + passo * fluxo.normal())).toFixed(instrumento.casas))
      saida.push({
        n,
        instrumento: instrumento.codigo,
        preco,
        digito: ultimoDigito(preco, instrumento.casas),
        epoch: 0,
      })
    }
    return saida
  }

  private gerar(): void {
    if (!this.fluxo) return
    const i = this.instrumento
    const dt = i.intervalo / ANO
    const anterior = this.ultimo?.preco ?? i.inicial
    const bruto = anterior * Math.exp(
      -0.5 * i.volatilidade ** 2 * dt + i.volatilidade * Math.sqrt(dt) * this.fluxo.normal(),
    )
    let preco = Number(bruto.toFixed(i.casas))

    // dígito forçado pela torre: mexe só na última casa, o resto do preço
    // continua sendo o que o browniano produziu
    const forcado = this.forcados.shift()
    if (forcado !== undefined) {
      const texto = preco.toFixed(i.casas)
      preco = Number(texto.slice(0, -1) + String(forcado))
    }

    const tick: Tick = {
      n: this.serie.length + 1,
      instrumento: i.codigo,
      preco,
      digito: ultimoDigito(preco, i.casas),
      epoch: Math.floor(Date.now() / 1000),
    }
    this.serie.push(tick)
    if (this.serie.length > 5000) this.serie = this.serie.slice(-3000)
    this.ouvintes.forEach((fn) => {
      try { fn(tick) } catch { /* um ouvinte quebrado nao derruba o motor */ }
    })
  }
}
