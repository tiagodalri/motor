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
  readonly instrumento: Instrumento
  private fluxo: Fluxo | null = null
  private compromisso: Compromisso | null = null
  private serie: Tick[] = []
  private ouvintes = new Set<Ouvinte>()
  private relogio: ReturnType<typeof setInterval> | null = null

  constructor(instrumento: Instrumento) {
    this.instrumento = instrumento
  }

  /** Abre a rodada. O hash pode ir para a tela na hora. */
  async abrirRodada(sementeCliente = sementeNova()): Promise<Compromisso> {
    this.parar()
    this.compromisso = await abrirCompromisso(sementeCliente)
    this.fluxo = await Fluxo.criar(this.compromisso.sementeCasa, sementeCliente)
    this.serie = []
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

  ligar(): void {
    if (this.relogio || !this.fluxo) return
    this.gerar()
    this.relogio = setInterval(() => this.gerar(), this.instrumento.intervalo * 1000)
  }

  parar(): void {
    if (this.relogio) clearInterval(this.relogio)
    this.relogio = null
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
      preco = preco * Math.exp(ajuste + passo * fluxo.normal())
      const arredondado = Number(preco.toFixed(instrumento.casas))
      saida.push({
        n,
        instrumento: instrumento.codigo,
        preco: arredondado,
        digito: ultimoDigito(arredondado, instrumento.casas),
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
    const preco = Number(bruto.toFixed(i.casas))
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
