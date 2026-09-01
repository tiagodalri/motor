import { OrdemRecusada, type Livro } from './livro'
import { PARAMETROS, type TipoContrato } from './precos'
import type { MotorDeTicks } from './ticks'

/**
 * Copy trade: espelhar as ordens de um trader na conta de outro.
 *
 * A parte que **não** depende de servidor é esta: dado um sinal de ordem,
 * dimensioná-lo para a banca do seguidor, aplicar os limites dele e mandar
 * para o livro. Essa lógica é idêntica quer o sinal venha de um robô local,
 * quer venha de outra conta do outro lado do país — e é por isso que a
 * fonte aqui é uma **interface**, não um robô.
 *
 * O que depende de servidor é o resto: contas de verdade, autenticação,
 * histórico público e confiável, e um livro compartilhado onde a ordem do
 * trader e a do seguidor caiam no mesmo instante. Nada disso existe no
 * navegador, e fingir que existe seria construir a parte fácil e chamar de
 * pronto.
 *
 * ---
 *
 * O aviso que importa mais que o código: **copy trade concentra fluxo.**
 * Dez seguidores de um mesmo trader viram dez apostas no mesmo lado, no
 * mesmo tick de liquidação. Para a casa isso não é dez clientes — é um
 * cliente dez vezes maior, sem nenhuma diversificação. É exatamente o
 * cenário em que a cobertura estrita não aceita nada, e o cenário em que
 * a casa mais precisa da trava. Está medido em `testes/copia.ts`.
 */

export interface Sinal {
  /** Quem originou. Hoje um robô local; amanhã, o id de outra conta. */
  fonte: string
  tipo: TipoContrato
  barreira: number | null
  ticks: number
  /** Quanto o trader de origem apostou. */
  valor: number
  /** Banca da origem no momento da ordem, para dimensionar proporcional. */
  bancaDaFonte: number
}

/** Assina uma fonte de sinal. Devolve como cancelar. */
export type FonteDeSinal = (aoSinal: (s: Sinal) => void) => () => void

export interface ConfigCopia {
  /** Quanto o seguidor separou para esta cópia. */
  alocado: number
  /**
   * `proporcional` — copia na mesma proporção da banca do trader. Quem
   *   aloca metade da banca dele corre metade do risco dele.
   * `fixo` — todo sinal vira o mesmo valor, independente do que o trader
   *   apostou. Mais simples de entender, e **descaracteriza gale**: o
   *   seguidor de um martingale que copia valor fixo não está copiando a
   *   estratégia, só a direção.
   */
  modo: 'proporcional' | 'fixo'
  valorFixo: number
  /** Teto por operação copiada. */
  tetoPorOperacao: number
  /** Para de copiar quando a cópia acumular esta perda. Zero = sem parada. */
  stopLoss: number
}

export const COPIA_PADRAO: ConfigCopia = {
  alocado: 100,
  modo: 'proporcional',
  valorFixo: 0.30,
  tetoPorOperacao: 50,
  stopLoss: 0,
}

export interface EstadoCopia {
  copiando: boolean
  fonte: string | null
  sinais: number
  copiadas: number
  recusadas: number
  ignoradas: number
  resultado: number
  ultimaRecusa: string | null
  motivoDaParada: string | null
}

/**
 * Dimensiona o sinal para a banca do seguidor.
 *
 * Separada da classe de propósito: é a única regra do copy trade que
 * precisa estar certa em centavos, e função pura se testa sem montar
 * livro, motor e conta.
 */
export function dimensionar(s: Sinal, c: ConfigCopia): number {
  const bruto = c.modo === 'fixo'
    ? c.valorFixo
    : s.valor * (s.bancaDaFonte > 0 ? c.alocado / s.bancaDaFonte : 0)
  const limitado = Math.min(bruto, c.tetoPorOperacao)
  return Number(Math.max(PARAMETROS.valorMinimo, limitado).toFixed(2))
}

type Ouvinte = (e: EstadoCopia) => void

export class Copiador {
  config: ConfigCopia
  private livro: Livro
  private motor: MotorDeTicks
  private clienteId: string
  private estado: EstadoCopia
  private abertos = new Set<string>()
  private ouvintes = new Set<Ouvinte>()
  private soltarFonte: (() => void) | null = null
  private soltarLivro: (() => void) | null = null

  constructor(args: {
    livro: Livro; motor: MotorDeTicks; clienteId: string; config?: Partial<ConfigCopia>
  }) {
    this.livro = args.livro
    this.motor = args.motor
    this.clienteId = args.clienteId
    this.config = { ...COPIA_PADRAO, ...args.config }
    this.estado = {
      copiando: false, fonte: null, sinais: 0, copiadas: 0, recusadas: 0,
      ignoradas: 0, resultado: 0, ultimaRecusa: null, motivoDaParada: null,
    }
  }

  escutar(fn: Ouvinte): () => void {
    this.ouvintes.add(fn)
    fn(this.instantaneo)
    return () => this.ouvintes.delete(fn)
  }

  get instantaneo(): EstadoCopia { return { ...this.estado } }

  seguir(fonte: FonteDeSinal, nome: string): void {
    this.parar()
    this.estado.copiando = true
    this.estado.fonte = nome
    this.estado.motivoDaParada = null
    this.soltarFonte = fonte((s) => this.aoSinal(s))
    this.soltarLivro = this.livro.escutar((c) => {
      if (!this.abertos.has(c.id) || c.ganhou === null) return
      this.abertos.delete(c.id)
      this.estado.resultado = Number((this.estado.resultado + (c.resultado ?? 0)).toFixed(2))
      this.avisar()
    })
    this.avisar()
  }

  parar(motivo: string | null = null): void {
    this.estado.copiando = false
    this.estado.motivoDaParada = motivo
    this.soltarFonte?.(); this.soltarFonte = null
    this.soltarLivro?.(); this.soltarLivro = null
    this.avisar()
  }

  private aoSinal(s: Sinal): void {
    if (!this.estado.copiando) return
    this.estado.sinais += 1

    const c = this.config
    if (c.stopLoss > 0 && this.estado.resultado <= -c.stopLoss) {
      return this.parar(`perda de ${c.stopLoss.toFixed(2)} na cópia`)
    }

    const valor = dimensionar(s, c)
    if (this.livro.saldo(this.clienteId) < valor) {
      this.estado.ignoradas += 1
      this.avisar()
      return
    }

    try {
      const cotacao = this.livro.cotar({
        tipo: s.tipo, barreira: s.barreira ?? undefined, valor, ticks: s.ticks,
      })
      const contrato = this.livro.apostar({
        clienteId: this.clienteId, motor: this.motor, cotacao,
      })
      this.abertos.add(contrato.id)
      this.estado.copiadas += 1
    } catch (e) {
      // A casa pode recusar a cópia e aceitar o original — e é justamente
      // o que a cobertura faz quando o fluxo fica concentrado num lado.
      // Seguir alguém não garante entrar junto.
      this.estado.recusadas += 1
      this.estado.ultimaRecusa = e instanceof OrdemRecusada
        ? `${e.veredito.camada}: ${e.veredito.motivo}`
        : (e as Error).message
    }
    this.avisar()
  }

  private avisar(): void {
    const e = this.instantaneo
    this.ouvintes.forEach((fn) => { try { fn(e) } catch { /* ignora */ } })
  }
}
