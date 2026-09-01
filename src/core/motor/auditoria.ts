/**
 * Auditoria da torre de controle.
 *
 * Toda alavanca desta plataforma passa por aqui antes de existir. A razão
 * é simples: um painel que deixa mexer em tudo sem deixar rastro não é uma
 * torre de controle, é uma porta dos fundos. Enquanto ainda estamos
 * decidindo o que trava e o que fica solto, o registro é o que permite
 * responder depois a pergunta que importa — *quem mexeu, no quê, quando, e
 * de quanto para quanto*.
 *
 * Cada registro tem um peso:
 *
 *  - `rotina`  — leitura de estado, coisa sem consequência
 *  - `ajuste`  — muda o comportamento do sistema daqui para a frente
 *  - `dinheiro`— cria, destrói ou move valor fora do fluxo normal
 *  - `quebra`  — invalida uma garantia que o cliente recebeu por escrito
 *
 * `quebra` existe porque algumas alavancas que você pediu (forçar dígito,
 * reescrever semente) destroem a prova de honestidade da rodada. Elas
 * ficam disponíveis, mas nunca silenciosas.
 */

export type Peso = 'rotina' | 'ajuste' | 'dinheiro' | 'quebra'

export interface Registro {
  id: number
  quando: number
  peso: Peso
  /** Onde: 'risco', 'precos', 'motor', 'razao', 'rodada'. */
  area: string
  acao: string
  /** Antes e depois, quando faz sentido. */
  de?: string
  para?: string
  /** Quem puxou. Hoje sempre o operador local; num servidor, o usuário. */
  quem: string
}

const CHAVE = 'motor.auditoria'
const TETO = 500

export class Auditoria {
  private registros: Registro[] = []
  private proximoId = 1
  private ouvintes = new Set<() => void>()
  quem = 'operador'

  constructor() {
    try {
      const bruto = localStorage.getItem(CHAVE)
      if (bruto) {
        const dados = JSON.parse(bruto) as { registros: Registro[]; proximoId: number }
        this.registros = dados.registros ?? []
        this.proximoId = dados.proximoId ?? this.registros.length + 1
      }
    } catch { /* comeca vazia */ }
  }

  registrar(peso: Peso, area: string, acao: string, de?: unknown, para?: unknown): Registro {
    const r: Registro = {
      id: this.proximoId++,
      quando: Date.now(),
      peso, area, acao,
      quem: this.quem,
      ...(de !== undefined ? { de: String(de) } : {}),
      ...(para !== undefined ? { para: String(para) } : {}),
    }
    this.registros.push(r)
    if (this.registros.length > TETO) this.registros = this.registros.slice(-TETO)
    this.salvar()
    this.avisar()
    return r
  }

  todos(limite = 200): Registro[] {
    return this.registros.slice(-limite).reverse()
  }

  /** Quantas quebras de garantia nesta instalação. Não zera. */
  get quebras(): number {
    return this.registros.filter((r) => r.peso === 'quebra').length
  }

  get total(): number { return this.registros.length }

  escutar(fn: () => void): () => void {
    this.ouvintes.add(fn)
    return () => this.ouvintes.delete(fn)
  }

  /**
   * Exporta o log inteiro. Num sistema de verdade isto sairia por um canal
   * só de escrita, para fora da máquina que pode ser comprometida.
   */
  exportar(): string {
    return JSON.stringify({ registros: this.registros, proximoId: this.proximoId }, null, 2)
  }

  private salvar(): void {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({
        registros: this.registros, proximoId: this.proximoId,
      }))
    } catch { /* sem armazenamento: o log vale enquanto a aba viver */ }
  }

  private avisar(): void {
    this.ouvintes.forEach((fn) => { try { fn() } catch { /* ignora */ } })
  }
}

export const auditoria = new Auditoria()
