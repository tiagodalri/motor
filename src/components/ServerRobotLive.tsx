import { useEffect, useMemo, useRef, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import type { Robo } from '../core/deriv/robots'
import type { Identidade } from '../core/deriv/branding'
import { Emblema } from './RobotCard'
import { Progress } from './Progress'

interface Props {
  robo: Robo
  ident: Identidade
  nome: string
  moeda: string
  socket: TeedsSocket | null
  onPausar: () => void
  onRetomar: () => void
  onParar: () => void
}

interface Operacao {
  id: number
  valor: number
  recebido: number
  lucro: number
  ganhou: boolean
  compra: number
  venda: number
  aberta: boolean
  entrada: number | null
  saida: number | null
  digitoSaida: number | null
  pip: number
}

const din = (v: number, m = 'USD') =>
  `${m} ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const hora = (e: number) =>
  new Date(e * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Curva do resultado acumulado. */
function Curva({ pontos, cor }: { pontos: number[]; cor: string }) {
  const d = useMemo(() => {
    if (pontos.length < 2) return null
    const min = Math.min(...pontos, 0), max = Math.max(...pontos, 0)
    const faixa = max - min || 1
    const px = (i: number) => (i / (pontos.length - 1)) * 100
    const py = (v: number) => 40 - ((v - min) / faixa) * 40
    const linha = pontos.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(2)} ${py(v).toFixed(2)}`).join(' ')
    return { linha, area: `${linha} L 100 40 L 0 40 Z`, zero: py(0), temZero: min < 0 && max > 0 }
  }, [pontos])
  if (!d) return null
  return (
    <svg className="curva" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path d={d.area} fill={cor} opacity="0.12" />
      {d.temZero && <line x1="0" x2="100" y1={d.zero} y2={d.zero} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 2" />}
      <path d={d.linha} fill="none" stroke={cor} strokeWidth="1.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function ServerRobotLive(props: Props) {
  const { robo, ident, nome, moeda, socket, onPausar, onRetomar, onParar } = props
  const [detalhes, setDetalhes] = useState<Record<number, Partial<Operacao>>>({})
  const [verHistorico, setVerHistorico] = useState(false)
  const buscados = useRef(new Set<number>())

  const brutos = (robo.contratosDetalhe ?? []) as Array<Record<string, any>>

  // busca entrada, saida e digito de cada contrato novo
  useEffect(() => {
    if (!socket) return
    const novos = brutos.map((c) => Number(c.contract_id))
      .filter((id) => id && !buscados.current.has(id))
      .slice(-12)
    if (!novos.length) return
    let vivo = true
    novos.forEach((id) => buscados.current.add(id))
    ;(async () => {
      for (const id of novos) {
        try {
          const r = await socket.send({ proposal_open_contract: 1, contract_id: id })
          const p = r.proposal_open_contract as Record<string, any> | undefined
          if (!p || !vivo) continue
          const pip = Number(p.pip_size ?? 2)
          const saida = p.exit_spot != null ? Number(p.exit_spot) : null
          const txt = saida !== null ? saida.toFixed(pip) : ''
          setDetalhes((d) => ({
            ...d,
            [id]: {
              entrada: p.entry_spot != null ? Number(p.entry_spot) : null,
              saida, pip,
              digitoSaida: txt ? Number(txt[txt.length - 1]) : null,
            },
          }))
        } catch { /* segue sem o detalhe */ }
      }
    })()
    return () => { vivo = false }
  }, [socket, brutos.length])

  const operacoes: Operacao[] = useMemo(() => {
    return brutos.map((c) => {
      const id = Number(c.contract_id)
      const valor = Number(c.buy_price ?? 0)
      const recebido = Number(c.sell_price ?? 0)
      const aberta = !c.sell_time
      const det = detalhes[id] ?? {}
      return {
        id, valor, recebido, aberta,
        lucro: aberta ? 0 : recebido - valor,
        ganhou: recebido > valor,
        compra: Number(c.purchase_time ?? 0),
        venda: Number(c.sell_time ?? 0),
        entrada: det.entrada ?? null,
        saida: det.saida ?? null,
        digitoSaida: det.digitoSaida ?? null,
        pip: det.pip ?? 2,
      }
    }).sort((a, b) => b.compra - a.compra)
  }, [brutos, detalhes])

  const fechadas = operacoes.filter((o) => !o.aberta)
  const emAndamento = operacoes.find((o) => o.aberta) ?? null
  const vitorias = fechadas.filter((o) => o.ganhou).length
  const acerto = fechadas.length ? (vitorias / fechadas.length) * 100 : 0

  const curva = useMemo(() => {
    const pts = [0]
    let acc = 0
    ;[...fechadas].reverse().forEach((o) => { acc += o.lucro; pts.push(acc) })
    return pts
  }, [fechadas])

  const rodando = robo.status === 'running'
  const pausado = robo.status === 'paused'
  const situacao = !rodando && !pausado ? 'parado' : emAndamento ? 'operando' : pausado ? 'pausado' : 'cacando'
  const rotulo = { operando: 'Comprou — aguardando resultado', cacando: 'Procurando entrada',
    pausado: 'Pausado', parado: 'Parado' }[situacao]

  // progresso entre os freios
  const tp = Number(robo.parametros?.take_profit ?? 0) || 1
  const sl = Number(robo.parametros?.stop_loss ?? 0) || 1
  const pos = robo.resultado >= 0
    ? 50 + Math.min(50, (robo.resultado / tp) * 50)
    : 50 - Math.min(50, (Math.abs(robo.resultado) / sl) * 50)

  return (
    <div className="teatro" style={{ ['--robo' as any]: ident.cor, ['--robo-suave' as any]: ident.corSuave }}>
      <div className={`teatro-cab ${situacao}`}>
        <Emblema id={ident} tamanho={38} />
        <div className="teatro-id">
          <b>{nome}</b>
          <span><i className="teatro-pulso" /> {rotulo}</span>
        </div>
        <div className="teatro-res">
          <span className="rot">Resultado</span>
          <strong className={robo.resultado >= 0 ? 'ganho' : 'perda'}>
            {robo.resultado >= 0 ? '+' : '−'}{din(robo.resultado, moeda)}
          </strong>
        </div>
        <div className="teatro-acoes">
          {rodando && <button onClick={onPausar}>Pausar</button>}
          {pausado && <button onClick={onRetomar}>Retomar</button>}
          {(rodando || pausado) && <button className="parar" onClick={onParar}>Desligar</button>}
        </div>
      </div>

      {/* a operação acontecendo agora ocupa a tela sozinha */}
      {emAndamento && (
        <div className="foco">
          <span className="foco-tag">operação em andamento</span>
          <div className="foco-valor">
            <span className="rot">Entrou com</span>
            <strong>{din(emAndamento.valor, moeda)}</strong>
          </div>
          <div className="foco-linha">
            <span>{ident.nome}</span>
            <em>·</em>
            <span>{robo.contrato.duration ?? 1} {(robo.contrato.duration ?? 1) === 1 ? 'tick' : 'ticks'}</span>
            <em>·</em>
            <span>desde {hora(emAndamento.compra)}</span>
          </div>
          <Progress cor={ident.cor} altura={6} />
          <p className="foco-espera">aguardando o resultado…</p>
          {emAndamento.entrada !== null && (
            <p className="foco-entrada">preço de entrada {emAndamento.entrada.toFixed(emAndamento.pip)}</p>
          )}
        </div>
      )}

      {emAndamento && (
        <button className="teatro-abrir" onClick={() => setVerHistorico((v) => !v)}>
          {verHistorico ? 'Ocultar' : 'Ver'} histórico da corrida
          <i className={verHistorico ? 'aberta' : ''} />
        </button>
      )}

      {(!emAndamento || verHistorico) && <>
      <div className="teatro-curva">
        {curva.length >= 2 && <Curva pontos={curva} cor={ident.cor} />}
        <div className="viv-trilho">
          <span className="lado perda">−{din(sl, '')}</span>
          <div className="barra">
            <i style={{ left: `${pos}%` }} className={robo.resultado >= 0 ? 'ganho' : 'perda'} />
            <u style={{ left: '50%' }} />
          </div>
          <span className="lado ganho">+{din(tp, '')}</span>
        </div>
      </div>

      <div className="teatro-nums">
        <div><span className="rot">Operações</span><b>{fechadas.length}</b><em>{vitorias}G · {fechadas.length - vitorias}P</em></div>
        <div><span className="rot">Acerto</span><b>{acerto.toFixed(0)}%</b><em>nesta corrida</em></div>
        <div><span className="rot">Movimentado</span><b>{din(robo.totalMovimentado, moeda)}</b><em>total das entradas</em></div>
        <div><span className="rot">Recebido</span><b>{din(robo.totalRecebido, moeda)}</b><em>total dos ganhos</em></div>
      </div>

      <div className="teatro-feed">
        {operacoes.length === 0 && <p className="ger-nota" style={{ padding: 14 }}>Nenhuma operação ainda.</p>}
        {(emAndamento ? fechadas : operacoes).map((o) => (
          <div key={o.id} className={`op ${o.aberta ? 'aberta' : o.ganhou ? 'ganhou' : 'perdeu'}`}>
            <span className="op-hora">{hora(o.compra)}</span>
            <span className="op-valor">{din(o.valor, '')}</span>
            <span className="op-spots">
              {o.entrada !== null ? o.entrada.toFixed(o.pip) : '—'}
              <em>→</em>
              {o.saida !== null ? o.saida.toFixed(o.pip) : (o.aberta ? '…' : '—')}
              {o.digitoSaida !== null && !o.aberta && (
                <b className={`dig-chip ${o.ganhou ? 'ok' : 'nao'}`}>{o.digitoSaida}</b>
              )}
            </span>
            <span className="op-res">
              {o.aberta
                ? <em className="op-rodando">em andamento</em>
                : <b className={o.ganhou ? 'ganho' : 'perda'}>
                    {o.ganhou ? '+' : '−'}{din(o.lucro, '')}
                  </b>}
            </span>
          </div>
        ))}
      </div>
      </>}
    </div>
  )
}
