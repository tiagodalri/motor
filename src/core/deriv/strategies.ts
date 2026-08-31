import type { Estrategia } from './engine'

/**
 * Estrategias que rodam no motor da Teeds.
 *
 * O AG7 nasceu de um arquivo XML do Deriv Bot (SUPERIOR 5 VIP), traduzido
 * bloco a bloco. A regra de entrada mudou depois, a pedido: o filtro de
 * tres digitos <= 6 saiu e o robo passou a entrar em toda operacao.
 */

export const SUPERIOR_5: Estrategia = {
  id: 'superior5',
  nome: 'Teeds - AG7',
  origem: 'baseado no Deriv Bot SUPERIOR 5 VIP',
  descricao:
    'Entra em todas as operações. Mantém o valor da entrada enquanto as perdas ' +
    'seguidas não chegam ao gatilho; a partir daí liga o martingale para recuperar.',
  contractType: 'DIGITOVER',
  barreira: 5,
  ticks: 1,

  // Sem filtro: emenda uma operacao na outra.
  entradaContinua: true,
  entrar: () => true,

  aguardando: ({ perdasSeguidas, config }) =>
    perdasSeguidas >= config.galeApos
      ? 'recuperando — martingale ligado'
      : 'entrando na próxima',

  /**
   * A tela mostra a escada ate o martingale: um degrau por perda seguida
   * permitida no valor base. Quando todos acendem, a recuperacao comeca.
   */
  progresso: ({ perdasSeguidas, config }) => {
    const gatilho = Math.max(1, Math.round(config.galeApos))
    const ligado = perdasSeguidas >= gatilho
    return {
      rotulo: ligado
        ? 'Martingale ligado — recuperando'
        : `Valor base até ${gatilho} perdas seguidas`,
      itens: Array.from({ length: gatilho }, (_, i) => ({
        valor: i < perdasSeguidas ? '✕' : '·',
        ok: i >= perdasSeguidas,
      })),
    }
  },

  proximoValor: ({ ganhou, valorAoVencer, perdasSeguidas, prejuizoDaSequencia, config }) => {
    // ganhou: a sequencia fecha e tudo volta ao valor base
    if (ganhou) return valorAoVencer
    // ainda dentro das entradas de valor fixo
    if (perdasSeguidas < config.galeApos) return valorAoVencer
    // martingale: o valor base mais o que a sequencia inteira ja custou
    return valorAoVencer + prejuizoDaSequencia * config.fatorGale
  },
}

/** Variacao conservadora: entra igual, mas a entrada nunca muda. */
export const SUPERIOR_5_FIXO: Estrategia = {
  ...SUPERIOR_5,
  id: 'superior5fixo',
  nome: 'AG7 sem martingale',
  origem: 'variação de valor fixo',
  descricao: 'Entra em todas as operações com o valor sempre igual, sem progressão.',
  progresso: undefined,
  aguardando: () => 'entrando na próxima',
  proximoValor: ({ valorAoVencer }) => valorAoVencer,
}

export const ESTRATEGIAS_LOCAIS: Estrategia[] = [SUPERIOR_5, SUPERIOR_5_FIXO]
