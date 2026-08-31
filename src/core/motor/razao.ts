/**
 * Razão de partidas dobradas.
 *
 * A regra que não se negocia: **saldo é derivado, nunca guardado**. Não
 * existe campo `saldo` que alguém possa somar errado — existe uma lista de
 * lançamentos e uma soma. Se a soma estiver certa, o saldo está certo; se
 * um lançamento sumir, dá para ver qual.
 *
 * Toda operação que mexe em dinheiro carrega uma chave de idempotência: se
 * a mesma ordem chegar duas vezes (clique duplo, retentativa de rede), o
 * segundo lançamento é recusado em vez de cobrar de novo.
 *
 * Contas:
 *   cliente:<id>   dinheiro do cliente
 *   casa           o livro da casa
 *   emJogo         valor preso em contratos abertos
 *
 * A soma de todas as contas é sempre zero. Dinheiro não nasce nem some.
 */

export type Conta = string

export interface Lancamento {
  id: number
  /** Chave de idempotência: mesma chave, mesmo lançamento, uma vez só. */
  chave: string
  quando: number
  descricao: string
  /** Cada linha: conta e valor. A soma dos valores tem de ser zero. */
  linhas: Array<{ conta: Conta; valor: number }>
}

export class RazaoDesbalanceada extends Error {}
export class ChaveRepetida extends Error {}

const centavos = (v: number) => Math.round(v * 100)

export class Razao {
  private lancamentos: Lancamento[] = []
  private chaves = new Set<string>()
  private proximoId = 1

  /**
   * Registra um lançamento. Recusa se as linhas não fecharem em zero ou se
   * a chave já tiver sido usada.
   */
  lancar(chave: string, descricao: string, linhas: Lancamento['linhas']): Lancamento {
    if (this.chaves.has(chave)) {
      throw new ChaveRepetida(`Lançamento ${chave} já foi registrado`)
    }
    const soma = linhas.reduce((t, l) => t + centavos(l.valor), 0)
    if (soma !== 0) {
      throw new RazaoDesbalanceada(
        `As linhas somam ${soma / 100}, deveriam somar 0 — ${descricao}`,
      )
    }
    const lancamento: Lancamento = {
      id: this.proximoId++,
      chave,
      quando: Date.now(),
      descricao,
      linhas,
    }
    this.lancamentos.push(lancamento)
    this.chaves.add(chave)
    return lancamento
  }

  /** Já registramos esta chave? Serve para não repetir trabalho antes de tentar. */
  jaRegistrado(chave: string): boolean {
    return this.chaves.has(chave)
  }

  /** Saldo de uma conta: a soma dos lançamentos, sempre recalculada. */
  saldo(conta: Conta): number {
    let total = 0
    for (const l of this.lancamentos) {
      for (const linha of l.linhas) {
        if (linha.conta === conta) total += centavos(linha.valor)
      }
    }
    return total / 100
  }

  /** Extrato de uma conta, do mais novo para o mais antigo. */
  extrato(conta: Conta, limite = 100): Array<{ lancamento: Lancamento; valor: number }> {
    const saida: Array<{ lancamento: Lancamento; valor: number }> = []
    for (let i = this.lancamentos.length - 1; i >= 0 && saida.length < limite; i -= 1) {
      const l = this.lancamentos[i]
      const valor = l.linhas
        .filter((x) => x.conta === conta)
        .reduce((t, x) => t + x.valor, 0)
      if (valor !== 0) saida.push({ lancamento: l, valor })
    }
    return saida
  }

  /** Todas as contas com movimento. */
  contas(): Conta[] {
    const s = new Set<Conta>()
    for (const l of this.lancamentos) for (const x of l.linhas) s.add(x.conta)
    return [...s].sort()
  }

  get total(): number {
    return this.lancamentos.length
  }

  todos(limite = 200): Lancamento[] {
    return this.lancamentos.slice(-limite).reverse()
  }

  /**
   * Prova de que o livro fecha.
   *
   * Se a soma de todas as contas não for zero, alguma coisa criou ou
   * destruiu dinheiro — e é melhor descobrir aqui do que no fim do mês.
   */
  fecha(): boolean {
    let soma = 0
    for (const l of this.lancamentos) {
      for (const linha of l.linhas) soma += centavos(linha.valor)
    }
    return soma === 0
  }

  /** Estado serializável, para guardar entre sessões. */
  exportar(): { lancamentos: Lancamento[]; proximoId: number } {
    return { lancamentos: this.lancamentos, proximoId: this.proximoId }
  }

  static importar(dados: { lancamentos: Lancamento[]; proximoId: number }): Razao {
    const r = new Razao()
    r.lancamentos = dados.lancamentos ?? []
    r.proximoId = dados.proximoId ?? r.lancamentos.length + 1
    r.chaves = new Set(r.lancamentos.map((l) => l.chave))
    return r
  }
}

/* --------------------------------------------------------------- contas */

export const CONTA = {
  cliente: (id: string) => `cliente:${id}`,
  casa: 'casa',
  emJogo: 'emJogo',
  deposito: 'externo:deposito',
} as const
