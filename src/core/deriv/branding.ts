/**
 * Identidade visual de cada robo.
 *
 * Cada um tem cor, emblema e uma frase propria — para o usuario reconhecer
 * pelo desenho antes de ler o nome.
 */

export type OndeRoda = 'servidor' | 'teeds'

export interface Identidade {
  id: string
  nome: string
  chamada: string
  descricao: string
  cor: string
  corSuave: string
  onde: OndeRoda
  /** Desenho do emblema, em coordenadas 0-40. */
  emblema: string
  /** Chance teorica de acerto, em %. */
  chance: number
  contrato: string
}

/**
 * Catalogo completo — inclui modelos que nao estao mais em oferta.
 * Serve para reconhecer robos ja criados na conta da Deriv, que continuam
 * aparecendo no historico mesmo depois de sairem da vitrine.
 */
export const CATALOGO: Identidade[] = [
  {
    id: 'acima', nome: 'Acima de 5', chamada: 'O otimista',
    descricao: 'Ganha quando o último dígito é 6, 7, 8 ou 9.',
    cor: '#0f9d55', corSuave: '#e7f6ee', onde: 'servidor',
    emblema: 'M8 30 L14 22 L20 25 L32 10 M32 10 L24 11 M32 10 L31 18',
    chance: 40, contrato: 'DIGITOVER',
  },
  {
    id: 'abaixo', nome: 'Abaixo de 5', chamada: 'O paciente',
    descricao: 'Ganha quando o último dígito é 0, 1, 2, 3 ou 4.',
    cor: '#e0424a', corSuave: '#fdecec', onde: 'servidor',
    emblema: 'M8 10 L14 18 L20 15 L32 30 M32 30 L24 29 M32 30 L31 22',
    chance: 50, contrato: 'DIGITUNDER',
  },
  {
    id: 'par', nome: 'Par', chamada: 'O simétrico',
    descricao: 'Ganha quando o último dígito é 0, 2, 4, 6 ou 8.',
    cor: '#4c6fff', corSuave: '#edf1ff', onde: 'servidor',
    emblema: 'M12 14 h16 M12 20 h16 M12 26 h16',
    chance: 50, contrato: 'DIGITEVEN',
  },
  {
    id: 'impar', nome: 'Ímpar', chamada: 'O contrário',
    descricao: 'Ganha quando o último dígito é 1, 3, 5, 7 ou 9.',
    cor: '#8b5cf6', corSuave: '#f2edff', onde: 'servidor',
    emblema: 'M12 14 h16 M12 20 h10 M12 26 h16',
    chance: 50, contrato: 'DIGITODD',
  },
  {
    id: 'superior5', nome: 'Teeds - AG7', chamada: 'O insistente',
    descricao: 'Entra em todas as operações. Depois de três perdas seguidas, liga o martingale.',
    cor: '#e8892b', corSuave: '#fdf0e2', onde: 'teeds',
    emblema: 'M20 8 a12 12 0 1 0 0.1 0 M20 14 a6 6 0 1 0 0.1 0 M20 19 v-3',
    chance: 40, contrato: 'DIGITOVER',
  },
  {
    id: 'superior5fixo', nome: 'AG7 sem martingale', chamada: 'O disciplinado',
    descricao: 'Entra em todas as operações com o valor sempre igual, sem progressão.',
    cor: '#0d9488', corSuave: '#e3f5f3', onde: 'teeds',
    emblema: 'M8 20 h6 M17 20 h6 M26 20 h6 M20 10 v20',
    chance: 40, contrato: 'DIGITOVER',
  },
]

/**
 * Robos oferecidos hoje na vitrine.
 * Por ora so o Teeds - AG7; os demais seguem no catalogo para leitura do
 * historico, mas nao podem mais ser criados.
 */
export const EM_OFERTA = ['superior5'] as const

export const IDENTIDADES: Identidade[] = CATALOGO.filter((i) =>
  (EM_OFERTA as readonly string[]).includes(i.id),
)

export function identidade(id: string): Identidade {
  return CATALOGO.find((i) => i.id === id) ?? IDENTIDADES[0]
}

/** Descobre a identidade a partir do tipo de contrato, para robôs já criados. */
export function identidadePorContrato(contrato: string): Identidade | null {
  return CATALOGO.find((i) => i.onde === 'servidor' && i.contrato === contrato) ?? null
}
