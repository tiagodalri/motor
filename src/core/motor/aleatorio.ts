/**
 * Aleatoriedade verificável.
 *
 * Aqui a casa é dona do gerador contra o qual o cliente aposta. Sem prova,
 * isso é indistinguível de uma máquina viciada — e é essa suspeita, não a
 * matemática, que mata plataforma pequena.
 *
 * O esquema é commit/reveal:
 *  1. a casa sorteia uma semente e publica só o SHA-256 dela (o compromisso)
 *  2. o cliente escolhe a semente dele, e ela entra na conta
 *  3. no fim da rodada a casa revela a sua semente
 *  4. o cliente confere que o hash bate e recomputa a série inteira
 *
 * Como o compromisso sai antes de a casa conhecer a semente do cliente, ela
 * não consegue escolher uma sequência contra ele. E como a série é função
 * pura das duas sementes, qualquer pessoa refaz o cálculo.
 */

const cod = new TextEncoder()

export interface Compromisso {
  /** Publicado antes da rodada. */
  hash: string
  /** Fica escondido até o fim da rodada. */
  sementeCasa: string
  sementeCliente: string
  /** Quando o compromisso foi criado. */
  criadoEm: number
}

const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((n) => n.toString(16).padStart(2, '0')).join('')

export async function sha256(texto: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', cod.encode(texto)))
}

/** Semente aleatória de 32 bytes, em hexadecimal. */
export function sementeNova(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return hex(b.buffer)
}

/** Cria o compromisso da rodada. O hash pode ser publicado; a semente, não. */
export async function abrirCompromisso(
  sementeCliente: string,
  /** Só para teste e para refazer uma rodada. Em produção, sempre sorteada. */
  sementeFixa?: string,
): Promise<Compromisso> {
  const sementeCasa = sementeFixa ?? sementeNova()
  return {
    hash: await sha256(sementeCasa),
    sementeCasa,
    sementeCliente,
    criadoEm: Date.now(),
  }
}

/** O que o cliente roda para conferir: o hash publicado bate com a semente revelada? */
export async function conferirCompromisso(hash: string, sementeCasa: string): Promise<boolean> {
  return (await sha256(sementeCasa)) === hash
}

/**
 * Gerador determinístico a partir das duas sementes.
 *
 * xoshiro128** semeado por SHA-256 das sementes concatenadas com o número
 * do tick. Determinístico: mesmo par de sementes, mesma série, sempre.
 */
export class Fluxo {
  private s: Uint32Array

  private constructor(estado: Uint32Array) {
    this.s = estado
  }

  static async criar(sementeCasa: string, sementeCliente: string): Promise<Fluxo> {
    const semente = await sha256(`${sementeCasa}:${sementeCliente}`)
    const s = new Uint32Array(4)
    for (let i = 0; i < 4; i += 1) {
      s[i] = parseInt(semente.slice(i * 8, i * 8 + 8), 16) >>> 0
    }
    // um estado todo zero trava o gerador
    if (s.every((n) => n === 0)) s[0] = 0x9e3779b9
    return new Fluxo(s)
  }

  /** Próximo inteiro de 32 bits. */
  private proximo(): number {
    const s = this.s
    const rot = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0
    const resultado = (Math.imul(rot(Math.imul(s[1], 5) >>> 0, 7) >>> 0, 9)) >>> 0
    const t = (s[1] << 9) >>> 0
    s[2] = (s[2] ^ s[0]) >>> 0
    s[3] = (s[3] ^ s[1]) >>> 0
    s[1] = (s[1] ^ s[2]) >>> 0
    s[0] = (s[0] ^ s[3]) >>> 0
    s[2] = (s[2] ^ t) >>> 0
    s[3] = rot(s[3], 11)
    return resultado
  }

  /** Uniforme em [0, 1). */
  uniforme(): number {
    return this.proximo() / 4294967296
  }

  /** Normal padrão, por Box-Muller. */
  normal(): number {
    let u = 0
    while (u === 0) u = this.uniforme()
    const v = this.uniforme()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
}
