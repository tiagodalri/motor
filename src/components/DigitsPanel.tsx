import { useEffect, useMemo, useState } from 'react'
import { publicSocket, type TeedsSocket } from '../core/deriv/client'
import { chanceTeorica, TIPOS_DIGITO, type DigitContract } from '../core/deriv/digits'
import { useDigits } from '../hooks/useDigits'

interface Props {
  symbol: string | null
  pipSize: number
  stake: number
  moeda: string
  podeOperar: boolean
  logado: boolean
  comprando: boolean
  /** Conexao da conta: cota com o markup real do app. */
  socket?: TeedsSocket | null
  onComprar: (tipo: DigitContract, barreira: string | undefined, ticks: number) => void
}

const JANELAS = [50, 100, 500, 1000]

export function DigitsPanel(props: Props) {
  const { symbol, pipSize, stake, moeda, podeOperar, logado, comprando, socket, onComprar } = props
  const [janela, setJanela] = useState(100)
  const [tipoSel, setTipoSel] = useState<DigitContract>('DIGITUNDER')
  const [digito, setDigito] = useState(5)
  const [ticks, setTicks] = useState(5)
  const [payout, setPayout] = useState<number | null>(null)
  const [erroCotacao, setErroCotacao] = useState<string | null>(null)
  const [cotando, setCotando] = useState(false)

  const estat = useDigits(symbol, pipSize, janela)
  const kind = TIPOS_DIGITO.find((t) => t.tipo === tipoSel)!

  // mantem o digito dentro do que o tipo aceita
  useEffect(() => {
    if (kind.usaDigito && !kind.digitosValidos.includes(digito)) {
      setDigito(kind.digitosValidos[Math.floor(kind.digitosValidos.length / 2)])
    }
  }, [kind, digito])

  // cotacao ao vivo (conexao publica, nao exige login)
  useEffect(() => {
    if (!symbol) return
    let vivo = true
    const id = setTimeout(async () => {
      setCotando(true)
      setErroCotacao(null)
      try {
        const conexao = socket ?? publicSocket
        const res = await conexao.send({
          proposal: 1, amount: stake, basis: 'stake', currency: moeda,
          contract_type: tipoSel, duration: ticks, duration_unit: 't',
          underlying_symbol: symbol,
          ...(kind.usaDigito ? { barrier: String(digito) } : {}),
        })
        if (!vivo) return
        setPayout(Number((res.proposal as any).payout))
      } catch (e) {
        if (!vivo) return
        setPayout(null)
        setErroCotacao((e as Error).message)
      } finally {
        if (vivo) setCotando(false)
      }
    }, 350)
    return () => { vivo = false; clearTimeout(id) }
  }, [symbol, stake, moeda, tipoSel, digito, ticks, kind.usaDigito, socket])

  const lucro = payout !== null ? payout - stake : null
  const chance = chanceTeorica(kind, digito)
  const ganhaCom = useMemo(() => {
    const alvo = new Set<number>()
    for (let d = 0; d <= 9; d++) {
      if (tipoSel === 'DIGITOVER' && d > digito) alvo.add(d)
      if (tipoSel === 'DIGITUNDER' && d < digito) alvo.add(d)
      if (tipoSel === 'DIGITMATCH' && d === digito) alvo.add(d)
      if (tipoSel === 'DIGITDIFF' && d !== digito) alvo.add(d)
      if (tipoSel === 'DIGITEVEN' && d % 2 === 0) alvo.add(d)
      if (tipoSel === 'DIGITODD' && d % 2 === 1) alvo.add(d)
    }
    return alvo
  }, [tipoSel, digito])

  const maxPct = Math.max(...estat.pct, 1)

  return (
    <div className="dig">
      {/* ---------- ultimo digito e fita recente ---------- */}
      <div className="dig-agora">
        <div className="dig-atual">
          <span className="rot">Último dígito</span>
          <strong className={estat.ultimo !== null && ganhaCom.has(estat.ultimo) ? 'ganho' : ''}>
            {estat.ultimo ?? '—'}
          </strong>
        </div>
        <div className="dig-fita">
          {estat.recentes.map((d, i) => (
            <span key={i} className={`fita-d ${ganhaCom.has(d) ? 'alvo' : ''} ${i === estat.recentes.length - 1 ? 'ultimo' : ''}`}>
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* ---------- distribuicao ---------- */}
      <div className="dig-sec">
        <div className="dig-sec-topo">
          <span className="rot">Frequência dos dígitos</span>
          <div className="segmented mini">
            {JANELAS.map((j) => (
              <button key={j} className={janela === j ? 'on' : ''} onClick={() => setJanela(j)}>{j}</button>
            ))}
          </div>
        </div>
        <div className="dig-barras">
          {estat.pct.map((p, d) => (
            <button
              key={d}
              className={`dig-barra ${ganhaCom.has(d) ? 'alvo' : ''} ${kind.usaDigito && d === digito ? 'sel' : ''}`}
              onClick={() => kind.usaDigito && kind.digitosValidos.includes(d) && setDigito(d)}
              title={`${estat.conta[d]} vezes em ${estat.total}`}
            >
              <span className="col" style={{ height: `${(p / maxPct) * 100}%` }} />
              <em>{p.toFixed(1)}%</em>
              <b>{d}</b>
            </button>
          ))}
        </div>
        <p className="dig-nota">
          {estat.carregando ? 'lendo o histórico…' : `últimos ${estat.total} ticks · cada dígito tende a 10% no longo prazo`}
        </p>
      </div>

      {/* ---------- tipo de operação ---------- */}
      <div className="dig-sec">
        <span className="rot">Tipo de operação</span>
        <div className="dig-tipos">
          {TIPOS_DIGITO.map((t) => (
            <button key={t.tipo} className={tipoSel === t.tipo ? 'on' : ''} onClick={() => setTipoSel(t.tipo)}>
              {t.nome}
            </button>
          ))}
        </div>
      </div>

      {kind.usaDigito && (
        <div className="dig-sec">
          <span className="rot">Dígito</span>
          <div className="dig-escolha">
            {[0,1,2,3,4,5,6,7,8,9].map((d) => (
              <button
                key={d}
                disabled={!kind.digitosValidos.includes(d)}
                className={d === digito ? 'on' : ''}
                onClick={() => setDigito(d)}
              >{d}</button>
            ))}
          </div>
        </div>
      )}

      <div className="dig-sec">
        <span className="rot">Duração</span>
        <div className="dig-ticks">
          {[1,2,3,4,5,6,7,8,9,10].map((t) => (
            <button key={t} className={ticks === t ? 'on' : ''} onClick={() => setTicks(t)}>{t}</button>
          ))}
        </div>
        <p className="dig-nota">em ticks — cada tick é uma nova cotação</p>
      </div>

      {/* ---------- resumo e compra ---------- */}
      <div className="dig-resumo">
        <p className="dig-frase">
          Resultado positivo se <strong>{kind.descricao(digito)}</strong> depois de {ticks} {ticks === 1 ? 'tick' : 'ticks'}.
        </p>
        <div className="dig-numeros">
          <div>
            <span className="rot">Chance</span>
            <strong>{chance}%</strong>
          </div>
          <div>
            <span className="rot">Se ganhar</span>
            <strong>{payout !== null ? `${moeda} ${payout.toFixed(2)}` : erroCotacao ? '—' : '…'}</strong>
          </div>
          <div>
            <span className="rot">Lucro</span>
            <strong className={lucro !== null && lucro > 0 ? 'ganho' : ''}>
              {lucro !== null ? `+${lucro.toFixed(2)}` : '—'}
            </strong>
          </div>
        </div>
        {erroCotacao && <p className="dig-erro">{erroCotacao}</p>}
        <button
          className="btn btn-dig"
          disabled={!podeOperar || comprando || cotando || payout === null}
          onClick={() => onComprar(tipoSel, kind.usaDigito ? String(digito) : undefined, ticks)}
        >
          {comprando ? 'comprando…' : !logado ? 'Entre para operar' : `Comprar por ${moeda} ${stake.toFixed(2)}`}
        </button>
      </div>
    </div>
  )
}
