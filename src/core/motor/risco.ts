import type { Cotacao } from './precos'

/**
 * Controle de risco da casa.
 *
 * Quatro camadas, da mais barata para a mais cara:
 *
 *  1. por aposta      — valor e pagamento máximos
 *  2. por cliente     — exposição aberta e perda diária
 *  3. por bucket      — soma dos pagamentos que liquidam no MESMO tick
 *  4. disjuntor       — suspende o instrumento sozinho
 *
 * A terceira é a que importa e a que quase todo mundo esquece. Em opções
 * binárias milhares de contratos liquidam no mesmo tick: se todo mundo
 * apostou no mesmo lado, ou a casa paga todos ou não paga nenhum. Não há
 * diversificação — o resultado é perfeitamente correlacionado. Limitar por
 * cliente não protege de nada nesse cenário.
 */

export interface Limites {
  /** Valor máximo de uma aposta. */
  valorMaximo: number
  /** Pagamento máximo de uma aposta. */
  pagamentoMaximo: number
  /** Exposição aberta somada de um cliente. */
  exposicaoPorCliente: number
  /** Perda máxima da casa para um cliente por dia. */
  perdaDiariaPorCliente: number
  /** Soma dos pagamentos potenciais que liquidam no mesmo tick. */
  exposicaoPorBucket: number
  /** Perda líquida por minuto que faz o disjuntor abrir. */
  sangriaPorMinuto: number
}

export const LIMITES_PADRAO: Limites = {
  valorMaximo: 500,
  pagamentoMaximo: 5_000,
  exposicaoPorCliente: 2_000,
  perdaDiariaPorCliente: 5_000,
  exposicaoPorBucket: 10_000,
  sangriaPorMinuto: 3_000,
}

export type Veredito =
  | { aceita: true }
  | { aceita: false; motivo: string; camada: 'aposta' | 'cliente' | 'bucket' | 'disjuntor' }

interface Aberto {
  clienteId: string
  instrumento: string
  /** Tick em que este contrato liquida. É a chave do bucket. */
  tickLiquidacao: number
  exposicao: number
}

const chaveBucket = (instrumento: string, tick: number) => `${instrumento}#${tick}`
const hoje = () => new Date().toISOString().slice(0, 10)

export class Risco {
  limites: Limites
  /**
   * O disjuntor pode ser desarmado pela torre.
   *
   * Desligar é exatamente o que você pediu para poder fazer — e é a
   * primeira coisa que eu travaria depois. Um sistema que só tem limite e
   * não tem disjuntor encontra um jeito de perder tudo às três da manhã;
   * um sistema cujo disjuntor pode ser desligado pela tela encontra o
   * mesmo jeito, só que com autorização.
   */
  disjuntorAtivo = true
  /** Minutos de suspensão automática quando o disjuntor abre. */
  minutosDeSuspensao = 5
  private abertos = new Map<string, Aberto>()
  private perdaDoDia = new Map<string, number>()
  private sangria: Array<{ quando: number; valor: number }> = []
  private suspensos = new Map<string, { ate: number; motivo: string }>()

  constructor(limites: Limites = LIMITES_PADRAO) {
    this.limites = limites
  }

  /**
   * Decide antes de registrar a aposta. Barato: nada é gravado se recusar.
   */
  avaliar(args: {
    clienteId: string
    instrumento: string
    tickLiquidacao: number
    cotacao: Cotacao
  }): Veredito {
    const { clienteId, instrumento, tickLiquidacao, cotacao } = args
    const L = this.limites

    // --- 4. disjuntor primeiro: se o instrumento está fora, nada passa
    const suspenso = this.suspensos.get(instrumento)
    if (suspenso && Date.now() < suspenso.ate) {
      return { aceita: false, camada: 'disjuntor', motivo: suspenso.motivo }
    }

    // --- 1. por aposta
    if (cotacao.valor > L.valorMaximo) {
      return { aceita: false, camada: 'aposta',
        motivo: `Valor acima do máximo por aposta (${L.valorMaximo}).` }
    }
    if (cotacao.pagamento > L.pagamentoMaximo) {
      return { aceita: false, camada: 'aposta',
        motivo: `Pagamento acima do máximo por aposta (${L.pagamentoMaximo}).` }
    }

    // --- 2. por cliente
    const doCliente = this.exposicaoDoCliente(clienteId)
    if (doCliente + cotacao.exposicao > L.exposicaoPorCliente) {
      return { aceita: false, camada: 'cliente',
        motivo: 'Você já tem exposição demais em aberto. Espere liquidar.' }
    }
    if ((this.perdaDoDia.get(`${clienteId}:${hoje()}`) ?? 0) >= L.perdaDiariaPorCliente) {
      return { aceita: false, camada: 'cliente',
        motivo: 'Limite diário desta conta atingido.' }
    }

    // --- 3. por bucket de liquidação
    const bucket = this.exposicaoDoBucket(instrumento, tickLiquidacao)
    if (bucket + cotacao.exposicao > L.exposicaoPorBucket) {
      return { aceita: false, camada: 'bucket',
        motivo: 'A casa já está exposta demais neste instante. Tente o próximo tick.' }
    }

    return { aceita: true }
  }

  /** Registra a exposição depois que a aposta foi aceita e lançada. */
  abrir(id: string, a: Aberto): void {
    this.abertos.set(id, a)
  }

  /**
   * Fecha a exposição e contabiliza o resultado da casa.
   * `resultadoDaCasa` é positivo quando a casa ganhou.
   */
  fechar(id: string, resultadoDaCasa: number): void {
    const a = this.abertos.get(id)
    this.abertos.delete(id)
    if (!a) return

    if (resultadoDaCasa < 0) {
      const chave = `${a.clienteId}:${hoje()}`
      this.perdaDoDia.set(chave, (this.perdaDoDia.get(chave) ?? 0) + Math.abs(resultadoDaCasa))
    }

    this.sangria.push({ quando: Date.now(), valor: resultadoDaCasa })
    this.limparSangria()
    this.verificarDisjuntor(a.instrumento)
  }

  exposicaoDoCliente(clienteId: string): number {
    let t = 0
    for (const a of this.abertos.values()) if (a.clienteId === clienteId) t += a.exposicao
    return Number(t.toFixed(2))
  }

  exposicaoDoBucket(instrumento: string, tick: number): number {
    const chave = chaveBucket(instrumento, tick)
    let t = 0
    for (const a of this.abertos.values()) {
      if (chaveBucket(a.instrumento, a.tickLiquidacao) === chave) t += a.exposicao
    }
    return Number(t.toFixed(2))
  }

  /** Exposição total da casa agora. */
  get exposicaoTotal(): number {
    let t = 0
    for (const a of this.abertos.values()) t += a.exposicao
    return Number(t.toFixed(2))
  }

  /** Os buckets mais carregados — o que o painel da casa precisa ver. */
  bucketsQuentes(quantos = 6): Array<{ instrumento: string; tick: number; exposicao: number }> {
    const mapa = new Map<string, { instrumento: string; tick: number; exposicao: number }>()
    for (const a of this.abertos.values()) {
      const chave = chaveBucket(a.instrumento, a.tickLiquidacao)
      const atual = mapa.get(chave)
        ?? { instrumento: a.instrumento, tick: a.tickLiquidacao, exposicao: 0 }
      atual.exposicao = Number((atual.exposicao + a.exposicao).toFixed(2))
      mapa.set(chave, atual)
    }
    return [...mapa.values()].sort((x, y) => y.exposicao - x.exposicao).slice(0, quantos)
  }

  /** Resultado da casa no último minuto. Negativo = sangrando. */
  get resultadoDoMinuto(): number {
    this.limparSangria()
    return Number(this.sangria.reduce((t, s) => t + s.valor, 0).toFixed(2))
  }

  suspensao(instrumento: string): { ate: number; motivo: string } | null {
    const s = this.suspensos.get(instrumento)
    if (!s || Date.now() >= s.ate) return null
    return s
  }

  /** Religa na mão, quando um humano olhou e decidiu. */
  religar(instrumento: string): void {
    this.suspensos.delete(instrumento)
  }

  /** Suspende na mão. Minutos = 0 suspende até alguém religar. */
  suspender(instrumento: string, minutos: number, motivo: string): void {
    this.suspensos.set(instrumento, {
      ate: minutos > 0 ? Date.now() + minutos * 60_000 : Number.MAX_SAFE_INTEGER,
      motivo,
    })
  }

  /** Tudo que está suspenso agora. */
  suspensoes(): Array<{ instrumento: string; ate: number; motivo: string }> {
    const saida: Array<{ instrumento: string; ate: number; motivo: string }> = []
    for (const [instrumento, s] of this.suspensos) {
      if (Date.now() < s.ate) saida.push({ instrumento, ...s })
    }
    return saida
  }

  /** Quanto a casa já perdeu hoje com este cliente. */
  perdaDeHoje(clienteId: string): number {
    return Number((this.perdaDoDia.get(`${clienteId}:${hoje()}`) ?? 0).toFixed(2))
  }

  /** Zera o contador diário de um cliente — libera quem bateu no teto. */
  zerarPerdaDoDia(clienteId: string): void {
    this.perdaDoDia.delete(`${clienteId}:${hoje()}`)
  }

  /** Exposição aberta por cliente, para a torre enxergar quem carrega risco. */
  exposicaoPorClienteAgora(): Array<{ clienteId: string; exposicao: number; contratos: number }> {
    const mapa = new Map<string, { clienteId: string; exposicao: number; contratos: number }>()
    for (const a of this.abertos.values()) {
      const atual = mapa.get(a.clienteId) ?? { clienteId: a.clienteId, exposicao: 0, contratos: 0 }
      atual.exposicao = Number((atual.exposicao + a.exposicao).toFixed(2))
      atual.contratos += 1
      mapa.set(a.clienteId, atual)
    }
    return [...mapa.values()].sort((x, y) => y.exposicao - x.exposicao)
  }

  private limparSangria(): void {
    const corte = Date.now() - 60_000
    this.sangria = this.sangria.filter((s) => s.quando >= corte)
  }

  /**
   * Sistema que só tem limite e não tem disjuntor sempre acha um jeito de
   * perder tudo às três da manhã.
   */
  private verificarDisjuntor(instrumento: string): void {
    if (!this.disjuntorAtivo) return
    const resultado = this.resultadoDoMinuto
    if (resultado > -this.limites.sangriaPorMinuto) return
    this.suspensos.set(instrumento, {
      ate: Date.now() + this.minutosDeSuspensao * 60_000,
      motivo: `Suspenso automaticamente: a casa perdeu ${Math.abs(resultado).toFixed(2)} em um minuto.`,
    })
  }
}
