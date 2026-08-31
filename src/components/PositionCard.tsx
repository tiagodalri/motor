import { useEffect, useState } from 'react'
import type { OpenContract } from '../core/deriv/trading'
import { Progress } from './Progress'

/** Contagem regressiva ate a expiracao, atualizada a cada segundo. */
function useCountdown(expiryEpoch: number) {
  const [agora, setAgora] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setAgora(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  const restante = Math.max(0, expiryEpoch - agora)
  const mm = String(Math.floor(restante / 60)).padStart(2, '0')
  const ss = String(restante % 60).padStart(2, '0')
  return { restante, texto: `${mm}:${ss}` }
}

const NOMES: Record<string, string> = {
  CALL: 'Subir', PUT: 'Descer', HIGHER: 'Acima', LOWER: 'Abaixo',
  MULTUP: 'Multiplicador ↑', MULTDOWN: 'Multiplicador ↓', ACCU: 'Acumulador',
  ONETOUCH: 'Toca', NOTOUCH: 'Não toca',
}

interface Props {
  contrato: OpenContract
  nomeAtivo: string
  onVender: (id: number) => void
  vendendo: boolean
}

export function PositionCard({ contrato: c, nomeAtivo, onVender, vendendo }: Props) {
  const { restante, texto } = useCountdown(c.expiryTime)
  const subiu = c.contractType === 'CALL' || c.contractType === 'HIGHER' || c.contractType === 'MULTUP'
  const ganhando = c.profit >= 0
  const duracaoTotal = Math.max(1, c.expiryTime - c.startTime)
  const progresso = Math.min(100, Math.max(0, ((duracaoTotal - restante) / duracaoTotal) * 100))
  const fmt = (v: number | null, casas = 2) => (v === null ? '—' : v.toFixed(casas))
  const variacao =
    c.entrySpot !== null && c.currentSpot !== null ? c.currentSpot - c.entrySpot : null

  return (
    <div className={`pos ${ganhando ? 'pos-ganhando' : 'pos-perdendo'}`}>
      <div className="pos-cab">
        <span className={`pos-dir ${subiu ? 'up' : 'down'}`}>
          {subiu ? '▲' : '▼'} {NOMES[c.contractType] ?? c.contractType}
        </span>
        <span className="pos-ativo">{nomeAtivo}</span>
        <span className={`pos-tempo ${restante <= 15 ? 'urgente' : ''}`}>{texto}</span>
      </div>

      <div className="pos-progresso">
        <Progress valor={progresso} altura={5}
          cor={ganhando ? 'var(--up)' : 'var(--down)'} vivo={restante > 0} />
        <span className="pos-progresso-txt">
          {restante > 0
            ? `${Math.round(progresso)}% do contrato · faltam ${texto}`
            : 'liquidando…'}
        </span>
      </div>

      <div className="pos-resultado">
        <div>
          <span className="rot">Resultado agora</span>
          <strong className={ganhando ? 'ganho' : 'perda'}>
            {ganhando ? '+' : '−'}{c.currency} {Math.abs(c.profit).toFixed(2)}
          </strong>
          <span className={`pct ${ganhando ? 'ganho' : 'perda'}`}>
            {ganhando ? '+' : ''}{c.profitPercentage.toFixed(1)}%
          </span>
        </div>
        <div className="pos-alvo">
          <span className="rot">Se ganhar</span>
          <strong>{c.currency} {c.payout.toFixed(2)}</strong>
          <span className="sub">lucro {(c.payout - c.buyPrice).toFixed(2)}</span>
        </div>
      </div>

      <dl className="pos-dados">
        <div><dt>Investido</dt><dd>{c.currency} {c.buyPrice.toFixed(2)}</dd></div>
        <div><dt>Entrada</dt><dd>{fmt(c.entrySpot, c.pipSize)}</dd></div>
        <div><dt>Agora</dt><dd className={variacao === null ? '' : variacao >= 0 ? 'ganho' : 'perda'}>
          {fmt(c.currentSpot, c.pipSize)}
          {variacao !== null && (
            <em>{variacao >= 0 ? ' +' : ' '}{variacao.toFixed(c.pipSize)}</em>
          )}
        </dd></div>
        <div><dt>Valor de venda</dt><dd>{c.currency} {c.bidPrice.toFixed(2)}</dd></div>
      </dl>

      <button
        className="btn btn-vender"
        disabled={!c.isValidToSell || vendendo}
        onClick={() => onVender(c.contractId)}
      >
        {vendendo
          ? 'vendendo…'
          : c.isValidToSell
            ? `Vender agora por ${c.currency} ${c.bidPrice.toFixed(2)}`
            : 'Venda indisponível neste contrato'}
      </button>
    </div>
  )
}
