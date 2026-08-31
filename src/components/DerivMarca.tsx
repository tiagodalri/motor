/**
 * A cara da Deriv dentro da Teeds.
 *
 * Botão que fala da corretora usa a cor dela (#FF444F) e o nome dela. Não
 * reproduzimos o logotipo: cor e nome bastam para a pessoa reconhecer de
 * quem é a conta, sem imitar marca de terceiro.
 */
export const DERIV_VERMELHO = '#ff444f'

export function DerivNome({ tamanho = 13 }: { tamanho?: number }) {
  return (
    <span className="deriv-nome" style={{ fontSize: tamanho }}>
      Deriv
    </span>
  )
}

/** Elo de ligação — usado nos botões de conectar. */
export function IconeElo({ tamanho = 15 }: { tamanho?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={tamanho} height={tamanho} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.6 9.4 4.5 11.5a2.5 2.5 0 0 1-3.5-3.5l2.1-2.1" />
      <path d="M9.4 6.6l2.1-2.1a2.5 2.5 0 0 1 3.5 3.5l-2.1 2.1" />
      <path d="M5.9 10.1l4.2-4.2" />
    </svg>
  )
}
