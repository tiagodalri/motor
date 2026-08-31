import { useEffect, useState } from 'react'
import { publicSocket, type TeedsSocket } from '../core/deriv/client'
import { useDigits } from '../hooks/useDigits'
import type { Identidade } from '../core/deriv/branding'

interface Props {
  symbol: string | null
  pipSize: number
  ident: Identidade
  /** Dígitos que fazem este robô ganhar. */
  ganhaCom: (d: number) => boolean
  valor: number
  ticks: number
  moeda: string
  socket: TeedsSocket | null
}

/**
 * Monitor do ativo, ao lado da configuracao.
 * Mostra o que o robo veria: os ultimos digitos, a frequencia de cada um
 * e quanto o contrato configurado esta pagando agora.
 */
export function RobotScope(props: Props) {
  const { symbol, pipSize, ident, ganhaCom, valor, ticks, moeda, socket } = props
  const [janela, setJanela] = useState(100)
  const [pagamento, setPagamento] = useState<number | null>(null)
  const estat = useDigits(symbol, pipSize, janela)

  useEffect(() => {
    if (!symbol) return
    let vivo = true
    const id = setTimeout(async () => {
      try {
        const conexao = socket ?? publicSocket
        const res = await conexao.send({
          proposal: 1, amount: valor, basis: 'stake', currency: moeda,
          contract_type: ident.contrato, duration: ticks, duration_unit: 't',
          underlying_symbol: symbol,
          ...(ident.contrato.startsWith('DIGIT') && !['DIGITEVEN', 'DIGITODD'].includes(ident.contrato)
            ? { barrier: '5' } : {}),
        })
        if (vivo) setPagamento(Number((res.proposal as any).payout))
      } catch { if (vivo) setPagamento(null) }
    }, 450)
    return () => { vivo = false; clearTimeout(id) }
  }, [symbol, valor, ticks, moeda, ident.contrato, socket])

  const max = Math.max(...estat.pct, 1)
  const naZona = estat.pct.reduce((t, p, d) => (ganhaCom(d) ? t + p : t), 0)
  const lucro = pagamento !== null ? pagamento - valor : null

  return (
    <section className="ger-bloco escopo">
      <div className="ger-bloco-topo">
        <span className="rot">O que o robô está vendo</span>
        <div className="segmented mini">
          {[50, 100, 500].map((j) => (
            <button key={j} className={janela === j ? 'on' : ''} onClick={() => setJanela(j)}>{j}</button>
          ))}
        </div>
      </div>

      {/* último dígito em destaque */}
      <div className="esc-agora">
        <div className="esc-digitao" style={{
          background: estat.ultimo !== null && ganhaCom(estat.ultimo) ? ident.cor : 'var(--surface)',
          color: estat.ultimo !== null && ganhaCom(estat.ultimo) ? '#fff' : 'var(--muted)',
        }}>
          {estat.ultimo ?? '–'}
        </div>
        <div className="esc-fita">
          {estat.recentes.slice(-16).map((d, i, arr) => (
            <span key={i}
              className={`esc-d ${ganhaCom(d) ? 'alvo' : ''} ${i === arr.length - 1 ? 'ultimo' : ''}`}
              style={ganhaCom(d) ? { background: ident.corSuave, color: ident.cor } : undefined}>
              {d}
            </span>
          ))}
          {estat.recentes.length === 0 && <span className="viv-nada">lendo o mercado…</span>}
        </div>
      </div>

      {/* frequência */}
      <div className="esc-barras">
        {estat.pct.map((p, d) => (
          <div key={d} className="esc-col" title={`${estat.conta[d]} vezes em ${estat.total}`}>
            <span className="esc-val">{p.toFixed(0)}</span>
            <span className="esc-barra"
              style={{
                height: `${(p / max) * 100}%`,
                background: ganhaCom(d) ? ident.cor : '#dfe5ee',
              }} />
            <b style={ganhaCom(d) ? { color: ident.cor } : undefined}>{d}</b>
          </div>
        ))}
      </div>

      <p className="esc-nota">
        {estat.carregando
          ? 'lendo o histórico…'
          : <>Nos últimos <b>{estat.total}</b> ticks, os dígitos que este robô precisa
              saíram <b style={{ color: ident.cor }}>{naZona.toFixed(1)}%</b> das vezes.</>}
      </p>

      <div className="esc-cotacao">
        <div>
          <span className="rot">Entrada</span>
          <b>{moeda} {valor.toFixed(2)}</b>
        </div>
        <div>
          <span className="rot">Paga</span>
          <b style={{ color: ident.cor }}>
            {pagamento !== null ? `${moeda} ${pagamento.toFixed(2)}` : '…'}
          </b>
        </div>
        <div>
          <span className="rot">Lucro</span>
          <b className={lucro !== null && lucro > 0 ? 'ganho' : ''}>
            {lucro !== null ? `+${lucro.toFixed(2)}` : '—'}
          </b>
        </div>
      </div>
    </section>
  )
}
