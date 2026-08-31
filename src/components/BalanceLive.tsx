import { useEffect, useRef, useState } from 'react'

interface Props {
  valor: number | null
  moeda: string
  conectando: boolean
}

/**
 * Saldo em tempo real. Pulsa em verde quando sobe e em vermelho quando cai,
 * e mostra a variacao da ultima mudanca por alguns segundos.
 */
export function BalanceLive({ valor, moeda, conectando }: Props) {
  const anterior = useRef<number | null>(null)
  const [direcao, setDirecao] = useState<'sobe' | 'cai' | null>(null)
  const [delta, setDelta] = useState<number | null>(null)

  useEffect(() => {
    if (valor === null) return
    const antes = anterior.current
    anterior.current = valor
    if (antes === null || antes === valor) return

    const d = valor - antes
    setDirecao(d > 0 ? 'sobe' : 'cai')
    setDelta(d)
    const t1 = setTimeout(() => setDirecao(null), 900)
    const t2 = setTimeout(() => setDelta(null), 4000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [valor])

  if (valor === null) {
    return <strong className="saldo saldo-vazio">{conectando ? 'conectando…' : '—'}</strong>
  }

  return (
    <span className="saldo-caixa">
      <strong className={`saldo ${direcao ?? ''}`}>
        <em>{moeda}</em>{' '}
        {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </strong>
      {delta !== null && (
        <span className={`saldo-delta ${delta > 0 ? 'sobe' : 'cai'}`}>
          {delta > 0 ? '+' : '−'}{Math.abs(delta).toFixed(2)}
        </span>
      )}
    </span>
  )
}
