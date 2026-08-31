import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import { DERIV } from '../core/deriv/config'
import {
  buscarExtrato, descreverContrato, resumirExtrato, rotuloTipo,
  type Movimento, type TipoMovimento,
} from '../core/deriv/statement'
import type { ActiveSymbol } from '../core/deriv/types'

interface Props {
  socket: TeedsSocket | null
  moeda: string
  symbols?: ActiveSymbol[]
}

const FILTROS: Array<{ id: TipoMovimento | 'todos'; nome: string }> = [
  { id: 'todos', nome: 'Tudo' },
  { id: 'buy', nome: 'Compras' },
  { id: 'sell', nome: 'Vendas' },
  { id: 'deposit', nome: 'Depósitos' },
  { id: 'withdrawal', nome: 'Saques' },
]

const din = (v: number, m = 'USD') =>
  `${m} ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const quando = (e: number) => {
  const d = new Date(e * 1000)
  return {
    hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    dia: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
  }
}

export function StatementPanel({ socket, moeda, symbols = [] }: Props) {
  const nomeAtivo = (codigo: string) =>
    symbols.find((s) => s.symbol === codigo)?.name ?? codigo
  const [movs, setMovs] = useState<Movimento[]>([])
  const [tipo, setTipo] = useState<TipoMovimento | 'todos'>('todos')
  const [limite, setLimite] = useState(50)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!socket) return
    setCarregando(true)
    setErro(null)
    try {
      const { movimentos } = await buscarExtrato(socket, { limite, tipo })
      setMovs(movimentos)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [socket, limite, tipo])

  useEffect(() => { carregar() }, [carregar])

  const r = useMemo(() => resumirExtrato(movs), [movs])

  function baixarCSV() {
    const cab = ['data', 'hora', 'tipo', 'descricao', 'valor', 'saldo_depois', 'origem']
    const linhas = movs.map((m) => {
      const q = quando(m.quando)
      return [
        q.dia, q.hora, rotuloTipo(m.tipo),
        `"${m.descricao.replace(/"/g, "'")}"`,
        m.valor.toFixed(2), m.saldoDepois.toFixed(2),
        m.appId === DERIV.appId ? 'Teeds' : (m.appId ?? ''),
      ].join(';')
    })
    const blob = new Blob(['﻿' + [cab.join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `teeds-extrato-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="ops-filtros">
        <div className="segmented">
          {FILTROS.map((f) => (
            <button key={f.id} className={tipo === f.id ? 'on' : ''} onClick={() => setTipo(f.id)}>
              {f.nome}
            </button>
          ))}
        </div>
        <div className="segmented">
          {[25, 50, 100].map((n) => (
            <button key={n} className={limite === n ? 'on' : ''} onClick={() => setLimite(n)}>{n}</button>
          ))}
        </div>
        <button className="ops-btn" onClick={carregar} disabled={carregando}>
          {carregando ? 'buscando…' : 'Atualizar'}
        </button>
        <button className="ops-btn" onClick={baixarCSV} disabled={!movs.length}>Baixar CSV</button>
      </div>

      {erro && <div className="ger-erro">{erro}</div>}

      <div className="kpis ops-kpis">
        <div className="kpi">
          <span className="rot">Saldo atual</span>
          <strong>{din(r.saldoFinal, moeda)}</strong>
        </div>
        <div className="kpi">
          <span className="rot">Entradas</span>
          <strong className="ganho">+{din(r.entradas, moeda)}</strong>
        </div>
        <div className="kpi">
          <span className="rot">Saídas</span>
          <strong className="perda">−{din(r.saidas, moeda)}</strong>
        </div>
        <div className="kpi">
          <span className="rot">Total movimentado</span>
          <strong>{din(r.movimentado, moeda)}</strong>
          <span className="kpi-nota">nas {movs.length} últimas movimentações</span>
        </div>
        <div className="kpi">
          <span className="rot">Resultado líquido</span>
          <strong className={r.liquido >= 0 ? 'ganho' : 'perda'}>
            {r.liquido >= 0 ? '+' : '−'}{din(r.liquido, moeda)}
          </strong>
        </div>
      </div>

      <div className="ops-tabela-caixa">
        <table className="ops-tabela ext-tabela">
          <thead>
            <tr>
              <th>Quando</th><th>Movimento</th><th>Descrição</th>
              <th>Origem</th><th className="num">Valor</th><th className="num">Saldo depois</th>
            </tr>
          </thead>
          <tbody>
            {movs.map((m) => {
              const q = quando(m.quando)
              const entrada = m.valor >= 0
              return (
                <tr key={m.id} className={entrada ? 'venceu' : 'perdeu'}>
                  <td className="ops-quando"><b>{q.hora}</b><span>{q.dia}</span></td>
                  <td><span className={`mov mov-${m.tipo}`}>{rotuloTipo(m.tipo)}</span></td>
                  <td className="ext-desc" title={m.descricao}>
                    {descreverContrato(m.shortcode, nomeAtivo)
                      || (m.tipo === 'deposit' ? 'Depósito na conta'
                        : m.tipo === 'withdrawal' ? 'Saque da conta'
                        : m.descricao || '—')}
                  </td>
                  <td>
                    {m.appId === DERIV.appId
                      ? <span className="tag-robo">Teeds</span>
                      : <span className="tag-manual">{m.appId === '2' ? 'Deriv' : (m.appId ?? '—')}</span>}
                  </td>
                  <td className={`num ${m.valor > 0 ? 'ganho' : m.valor < 0 ? 'perda' : ''}`}>
                    {m.valor === 0 ? '—' : `${entrada ? '+' : '−'}${din(m.valor, '').trim()}`}
                  </td>
                  <td className="num ext-saldo">{din(m.saldoDepois, '').trim()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!carregando && movs.length === 0 && (
          <p className="ger-nota" style={{ padding: 20, textAlign: 'center' }}>
            Nenhuma movimentação encontrada.
          </p>
        )}
      </div>
    </>
  )
}
