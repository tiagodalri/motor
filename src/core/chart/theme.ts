/**
 * Paleta do gráfico.
 *
 * O canvas não enxerga variável de CSS, então a alternativa preguiçosa é
 * ter duas paletas — uma no CSS, outra em JavaScript — e passar o resto da
 * vida esquecendo de mudar as duas. Aqui a folha de estilo continua sendo
 * a única fonte: a paleta é lida do `:root` na hora de pintar, e o modo
 * claro/escuro cai no gráfico de graça.
 */

export interface Paleta {
  bg: string
  surface: string
  border: string
  grid: string
  text: string
  muted: string
  primary: string
  up: string
  down: string
  upFraco: string
  downFraco: string
  crosshair: string
  futuro: string
  contraste: string
}

const PADRAO: Paleta = {
  bg: '#ffffff', surface: '#f7f9fc', border: '#e4e9f2', grid: '#eef2f7',
  text: '#1a2233', muted: '#7a8699', primary: '#4c6fff',
  up: '#12a150', down: '#e5484d',
  upFraco: 'rgba(18,161,80,0.10)', downFraco: 'rgba(229,72,77,0.10)',
  crosshair: '#98a2b3', futuro: 'rgba(122,134,153,0.04)', contraste: '#ffffff',
}

let cache: { chave: string; paleta: Paleta } | null = null

export function paleta(): Paleta {
  if (typeof window === 'undefined') return PADRAO
  const raiz = document.documentElement
  const chave = raiz.dataset.tema ?? 'claro'
  if (cache && cache.chave === chave) return cache.paleta

  const css = getComputedStyle(raiz)
  const ler = (nome: string, alt: string) => css.getPropertyValue(nome).trim() || alt
  const p: Paleta = {
    bg: ler('--bg', PADRAO.bg),
    surface: ler('--surface', PADRAO.surface),
    border: ler('--border', PADRAO.border),
    grid: ler('--grid', PADRAO.grid),
    text: ler('--text', PADRAO.text),
    muted: ler('--muted', PADRAO.muted),
    primary: ler('--primary', PADRAO.primary),
    up: ler('--up', PADRAO.up),
    down: ler('--down', PADRAO.down),
    upFraco: ler('--up-fraco', PADRAO.upFraco),
    downFraco: ler('--down-fraco', PADRAO.downFraco),
    crosshair: ler('--crosshair', PADRAO.crosshair),
    futuro: ler('--futuro', PADRAO.futuro),
    contraste: ler('--contraste', PADRAO.contraste),
  }
  cache = { chave, paleta: p }
  return p
}

/** Chamado quando o tema muda, para a próxima pintura reler o CSS. */
export function esquecerPaleta(): void {
  cache = null
}

/** Compatibilidade com o código que ainda importa `T`. */
export const T = new Proxy({} as Paleta & { surfaceAlt: string; primarySoft: string; upSoft: string; downSoft: string }, {
  get(_alvo, chave: string) {
    const p = paleta() as unknown as Record<string, string>
    if (chave === 'surfaceAlt') return p.surface
    if (chave === 'primarySoft') return p.surface
    if (chave === 'upSoft') return p.upFraco
    if (chave === 'downSoft') return p.downFraco
    return p[chave]
  },
})

export const CHART = {
  padRight: 70,
  padBottom: 28,
  padTop: 14,
  padLeft: 10,
  minCandles: 20,
  maxCandles: 400,
  defaultCandles: 70,
  /** Largura máxima de uma vela. Sem isto, poucas velas viram tijolos. */
  larguraMaxima: 13,
  /** Fatia do gráfico reservada ao futuro, para a expiração caber na tela. */
  fatiaDoFuturo: 0.22,
} as const
