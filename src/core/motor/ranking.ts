/**
 * Ranking de vitrine — Top 50 Brasil.
 *
 * Cinquenta traders **inventados**, com números inventados, gerados por
 * semente fixa para a lateral da tela de copy trade ter conteúdo.
 *
 * Duas escolhas deliberadas, e as duas são de segurança, não de estilo:
 *
 *  1. **Nome próprio e uma inicial** ("Rafael M."), nunca nome completo.
 *     Nome completo inventado tem chance real de coincidir com uma pessoa
 *     de verdade — e aí o que era um placeholder vira uma alegação de
 *     rentabilidade atribuída a alguém que nunca operou aqui.
 *  2. **`simulado: true` no tipo**, para nenhuma tela futura conseguir
 *     mostrar esta lista sem saber o que ela é.
 *
 * O dia em que existir gente de verdade operando, esta lista sai inteira e
 * dá lugar ao ranking derivado dos contratos (`desempenho.ts`). Um ranking
 * de rentabilidade com gente fictícia, exibido a cliente sem aviso, é
 * material de processo — não é exagero, é o formato clássico da propaganda
 * enganosa em investimento.
 */

export interface TraderDoRanking {
  simulado: true
  posicao: number
  /** Nome próprio e inicial. Fictício. */
  nome: string
  apelido: string
  uf: string
  /** Retorno dos últimos 30 dias, em fração. */
  retorno30d: number
  acerto: number
  seguidores: number
  operacoes: number
  ativo: string
  /** Quantas posições subiu (positivo) ou caiu (negativo) na semana. */
  variacao: number
  /** Vitórias seguidas agora. */
  sequencia: number
}

const NOMES = [
  'Rafael', 'Juliana', 'Bruno', 'Camila', 'Diego', 'Fernanda', 'Gustavo', 'Larissa',
  'Thiago', 'Patrícia', 'Marcelo', 'Aline', 'Rodrigo', 'Vanessa', 'Felipe', 'Bianca',
  'Leandro', 'Carolina', 'Vinícius', 'Renata', 'André', 'Priscila', 'Eduardo', 'Tatiane',
  'Lucas', 'Mariana', 'Caio', 'Débora', 'Henrique', 'Sabrina', 'Murilo', 'Letícia',
  'Otávio', 'Nathália', 'Ricardo', 'Simone', 'Fábio', 'Cristiane', 'Igor', 'Amanda',
  'Danilo', 'Roberta', 'Wesley', 'Milena', 'Alexandre', 'Jéssica', 'Renan', 'Karina',
  'Matheus', 'Elaine',
]

const INICIAIS = 'ABCDFGLMNOPRSTV'.split('')

const APELIDOS = [
  'doji', 'pavio', 'gale', 'martelo', 'topo', 'fundo', 'tick', 'stop', 'alvo',
  'pivo', 'ciclo', 'onda', 'gap', 'range', 'zona', 'setup', 'trend', 'reversao',
  'vela', 'ponta',
]

const UFS = [
  'SP', 'SP', 'SP', 'RJ', 'RJ', 'MG', 'MG', 'RS', 'PR', 'SC', 'BA', 'PE', 'CE',
  'GO', 'DF', 'ES', 'MT', 'MS', 'PA', 'AM',
]

const ATIVOS = ['V10', 'V25', 'V50', 'V100']

function semeado(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * O topo rende mais que o meio, e o meio mais que a cauda — mas a cauda
 * chega no vermelho. Ranking em que ninguém perde é ranking que ninguém
 * acredita, e a lista é justamente o lugar onde a pessoa forma a intuição
 * de que isso aqui não é dinheiro fácil.
 */
export function rankingDemo(quantos = 50, semente = 26091): TraderDoRanking[] {
  const r = semeado(semente)
  const lista: TraderDoRanking[] = []

  for (let i = 0; i < quantos; i += 1) {
    const posicao = i + 1
    // decai do topo para a cauda e passa do zero perto do fim
    const base = 0.92 * Math.exp(-i / 14) - 0.06
    const retorno = Number((base + (r() - 0.5) * 0.09).toFixed(4))
    const seguidores = Math.round((3_400 * Math.exp(-i / 11) + 40) * (0.65 + r() * 0.7))

    lista.push({
      simulado: true,
      posicao,
      nome: `${NOMES[i % NOMES.length]} ${INICIAIS[Math.floor(r() * INICIAIS.length)]}.`,
      apelido: `@${APELIDOS[Math.floor(r() * APELIDOS.length)]}${Math.floor(r() * 90 + 10)}`,
      uf: UFS[Math.floor(r() * UFS.length)],
      retorno30d: retorno,
      acerto: Number((0.28 + r() * 0.28).toFixed(3)),
      seguidores,
      operacoes: Math.round(400 + r() * 9_600),
      ativo: ATIVOS[Math.floor(r() * ATIVOS.length)],
      variacao: Math.round((r() - 0.5) * 18),
      sequencia: Math.floor(r() * 9),
    })
  }
  return lista
}
