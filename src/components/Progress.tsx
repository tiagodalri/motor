interface Props {
  /** 0 a 100. Deixe indefinido para a barra de espera. */
  valor?: number
  cor?: string
  altura?: number
  /** Mostra o brilho animado por cima. */
  vivo?: boolean
}

/**
 * Barra de progresso. Com valor, ela avança suavemente; sem valor, entra
 * no modo de espera, com um traço que percorre a barra.
 */
export function Progress({ valor, cor = 'var(--primary)', altura = 6, vivo = true }: Props) {
  const indeterminada = valor === undefined

  return (
    <div className={`prog ${indeterminada ? 'prog-espera' : ''}`}
      style={{ height: altura, ['--prog-cor' as any]: cor }}
      role="progressbar"
      aria-valuenow={indeterminada ? undefined : Math.round(valor)}
      aria-valuemin={0} aria-valuemax={100}>
      <span className={`prog-fill ${vivo ? 'vivo' : ''}`}
        style={indeterminada ? undefined : { width: `${Math.min(100, Math.max(0, valor))}%` }} />
    </div>
  )
}
