import type { Instrumento, MotorDeTicks } from '../core/motor/ticks'
import { variacao } from './AbasDeAtivos'

/**
 * A lista de ativos.
 *
 * Era uma lista de botões com o nome e a volatilidade — informação que não
 * muda e que ninguém consulta. O que se olha numa lista de ativos é preço,
 * direção e movimento, então é isso que ela mostra agora: preço ao vivo,
 * variação da janela e o desenho dos últimos minutos.
 */

const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(2)}%`

interface Props {
  instrumentos: Instrumento[]
  motores: Record<string, MotorDeTicks>
  ativo: string
  abertos: string[]
  aoEscolher: (codigo: string) => void
}

export function Watchlist({ instrumentos, motores, ativo, abertos, aoEscolher }: Props) {
  return (
    <div className="watch">
      <div className="watch-topo">
        <span className="rot">Ativos</span>
        <em>sintéticos · 24h</em>
      </div>
      {instrumentos.map((i) => {
        const motor = motores[i.codigo]
        const preco = motor?.ultimo?.preco
        const v = variacao(motor)
        return (
          <button key={i.codigo}
            className={`watch-item ${i.codigo === ativo ? 'on' : ''} ${abertos.includes(i.codigo) ? 'aberto' : ''}`}
            onClick={() => aoEscolher(i.codigo)}>
            <span className="watch-id">
              <b>{i.codigo}</b>
              <em>{i.nome.replace('Volatilidade ', 'Vol. ')}</em>
            </span>
            <Faisca motor={motor} positivo={(v ?? 0) >= 0} />
            <span className="watch-num">
              <b>{preco != null ? preco.toFixed(i.casas) : '—'}</b>
              {v !== null && <em className={v >= 0 ? 'up' : 'down'}>{pct(v)}</em>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Faisca({ motor, positivo }: { motor?: MotorDeTicks; positivo: boolean }) {
  const h = motor?.historico(60) ?? []
  if (h.length < 2) return <span className="watch-faisca" />
  const precos = h.map((t) => t.preco)
  const min = Math.min(...precos)
  const max = Math.max(...precos)
  const faixa = max - min || 1
  const d = precos
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${((i / (precos.length - 1)) * 46).toFixed(1)},${(16 - ((p - min) / faixa) * 14).toFixed(1)}`)
    .join(' ')
  return (
    <svg className="watch-faisca" viewBox="0 0 46 18" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" strokeWidth="1.3" vectorEffect="non-scaling-stroke"
        stroke={positivo ? 'var(--up)' : 'var(--down)'} strokeLinejoin="round" />
    </svg>
  )
}
