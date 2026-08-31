import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import { buscarOperacoes, paraCSV, resumir, type Operacao } from '../core/deriv/history'
import { MODELOS } from '../core/deriv/robots'
import { nomeDoRobo, todasAsOrigens } from '../core/deriv/robotNames'
import { StatementPanel } from './StatementPanel'
import { DerivDesconectada } from './DerivDesconectada'

interface Props {
  socket: TeedsSocket | null
  logado: boolean
  moeda: string
  symbols?: import('../core/deriv/types').ActiveSymbol[]
  /** Sobe a cada transacao na conta: recarrega a lista sozinha. */
  pulso?: number
  entrandoNaDeriv?: boolean
  onConectarDeriv?: () => void
}

const NOMES: Record<string, string> = {
  DIGITOVER: 'Acima de', DIGITUNDER: 'Abaixo de', DIGITMATCH: 'Igual a',
  DIGITDIFF: 'Diferente de', DIGITEVEN: 'Par', DIGITODD: 'Ímpar',
  CALL: 'Subir', PUT: 'Descer', ONETOUCH: 'Toca', NOTOUCH: 'Não toca',
}

const din = (v: number, m = 'USD') =>
  `${m} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const hora = (e: number) =>
  new Date(e * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const dia = (e: number) =>
  new Date(e * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export function OperationsPanel({
  socket, logado, moeda, symbols = [], pulso = 0,
  entrandoNaDeriv = false, onConectarDeriv,
}: Props) {
  const [ops, setOps] = useState<Operacao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtroRobo, setFiltroRobo] = useState<string>('todos')
  const [filtroResultado, setFiltroResultado] = useState<'todos' | 'ganhos' | 'perdas'>('todos')
  const [limite, setLimite] = useState(60)
  const [aba, setAba] = useState<'contratos' | 'extrato'>('contratos')

  const carregar = useCallback(async () => {
    if (!socket) return
    setCarregando(true)
    setErro(null)
    setProgresso(null)
    try {
      const lista = await buscarOperacoes(socket, limite, (feitas, total, parciais) => {
        setProgresso({ feitas, total })
        // mostra o que ja chegou em vez de deixar a tela vazia ate o fim
        setOps(parciais)
      })
      setOps(lista)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
      setProgresso(null)
    }
  }, [socket, limite])

  // Recarrega ao abrir e, depois, sempre que a conta se movimenta — com um
  // respiro de 4 s para nao varrer o historico a cada tick de um robo ligado.
  const jaCarregou = useRef(false)
  useEffect(() => {
    const espera = jaCarregou.current ? 4000 : 0
    jaCarregou.current = true
    const id = setTimeout(() => { void carregar() }, espera)
    return () => clearTimeout(id)
  }, [carregar, pulso])

  // Nome legivel do ativo: a API devolve o codigo (1HZ10V), nao o nome.
  const nomeAtivo = useMemo(() => {
    const m = new Map(symbols.map((x) => [x.symbol, x.name]))
    return (codigo: string) => m.get(codigo) ?? codigo
  }, [symbols])

  // De quem foi cada operacao: robo de servidor (runId), robo da Teeds
  // (marcado no navegador na hora da compra) ou entrada manual.
  const origem = useMemo(() => {
    const marcas = todasAsOrigens()
    return (o: Operacao) => {
      if (o.runId) return { chave: o.runId, nome: nomeDoRobo(o.runId, 'Robô ' + o.runId.slice(-4)), robo: true }
      const local = marcas[String(o.contractId)]
      if (local) return { chave: 'teeds:' + local, nome: local, robo: true }
      return { chave: 'manual', nome: 'Manual', robo: false }
    }
  }, [ops])

  const origens = useMemo(() => {
    const set = new Map<string, { nome: string; n: number }>()
    for (const o of ops) {
      const g = origem(o)
      const at = set.get(g.chave)
      set.set(g.chave, { nome: g.nome, n: (at?.n ?? 0) + 1 })
    }
    return [...set.entries()].sort((a, b) => b[1].n - a[1].n)
  }, [ops, origem])

  const filtradas = useMemo(() => {
    return ops.filter((o) => {
      if (filtroRobo !== 'todos' && origem(o).chave !== filtroRobo) return false
      if (filtroResultado === 'ganhos' && !o.ganhou) return false
      if (filtroResultado === 'perdas' && o.ganhou) return false
      return true
    })
  }, [ops, filtroRobo, filtroResultado, origem])

  const r = useMemo(() => resumir(filtradas), [filtradas])

  function baixarCSV() {
    const blob = new Blob(['﻿' + paraCSV(filtradas)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `teeds-operacoes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!logado) {
    return (
      <div className="ger">
        <div className="ger-topo"><div><h2>Operações</h2></div></div>
        <DerivDesconectada
          acao="O histórico vem da sua conta na corretora."
          entrando={entrandoNaDeriv}
          onConectar={() => onConectarDeriv?.()} />
      </div>
    )
  }

  return (
    <div className="ger ops">
      <div className="ger-topo">
        <div>
          <h2>Operações</h2>
          <p className="ger-sub">
            {aba === 'contratos'
              ? 'Cada contrato negociado — pelos robôs e por você'
              : 'Todo o dinheiro que entrou e saiu da conta'}
          </p>
          <div className="segmented sub-abas">
            <button className={aba === 'contratos' ? 'on' : ''} onClick={() => setAba('contratos')}>Contratos</button>
            <button className={aba === 'extrato' ? 'on' : ''} onClick={() => setAba('extrato')}>Extrato</button>
          </div>
        </div>
        <div className="ops-acoes" hidden={aba === 'extrato'}>
          <div className="segmented">
            {[30, 60, 120].map((n) => (
              <button key={n} className={limite === n ? 'on' : ''} onClick={() => setLimite(n)}>{n}</button>
            ))}
          </div>
          <button className="ops-btn" onClick={carregar} disabled={carregando}>
            {carregando ? 'buscando…' : 'Atualizar'}
          </button>
          <button className="ops-btn" onClick={baixarCSV} disabled={!filtradas.length}>Baixar CSV</button>
        </div>
      </div>

      {aba === 'extrato' && <StatementPanel socket={socket} moeda={moeda} symbols={symbols} />}

      {aba === 'contratos' && <>
      {erro && <div className="ger-erro">{erro}</div>}
      {progresso && (
        <div className="ops-progresso">
          buscando detalhes {progresso.feitas} de {progresso.total}
          <span style={{ width: `${(progresso.feitas / progresso.total) * 100}%` }} />
        </div>
      )}

      {/* -------- resumo -------- */}
      <div className="kpis ops-kpis">
        <div className="kpi">
          <span className="rot">Operações</span>
          <strong>{r.total}</strong>
          <span className="kpi-nota">{r.ganhos} ganhas · {r.perdas} perdidas</span>
        </div>
        <div className="kpi">
          <span className="rot">Total movimentado</span>
          <strong>{din(r.movimentado, moeda)}</strong>
        </div>
        <div className="kpi">
          <span className="rot">Resultado</span>
          <strong className={r.resultado >= 0 ? 'ganho' : 'perda'}>
            {r.resultado >= 0 ? '+' : '−'}{din(Math.abs(r.resultado), moeda)}
          </strong>
          <span className="kpi-nota">{r.retorno >= 0 ? '+' : ''}{r.retorno.toFixed(1)}% do movimentado</span>
        </div>
      </div>

      {/* -------- filtros -------- */}
      <div className="ops-filtros">
        <label className="ops-seletor">
          <span className="rot">Origem</span>
          <select value={filtroRobo} onChange={(e) => setFiltroRobo(e.target.value)}>
            <option value="todos">Todas as origens ({ops.length})</option>
            {origens.map(([chave, o]) => (
              <option key={chave} value={chave}>{o.nome} ({o.n})</option>
            ))}
          </select>
        </label>
        <div className="segmented">
          <button className={filtroResultado === 'todos' ? 'on' : ''} onClick={() => setFiltroResultado('todos')}>Todas</button>
          <button className={filtroResultado === 'ganhos' ? 'on' : ''} onClick={() => setFiltroResultado('ganhos')}>Ganhas</button>
          <button className={filtroResultado === 'perdas' ? 'on' : ''} onClick={() => setFiltroResultado('perdas')}>Perdidas</button>
        </div>
      </div>

      {/* -------- tabela -------- */}
      <div className="ops-tabela-caixa">
        <table className="ops-tabela">
          <thead>
            <tr>
              <th>Quando</th><th>Origem</th><th>Operação</th><th>Ativo</th>
              <th className="num">Valor</th><th className="num">Entrada</th>
              <th className="num">Saída</th>
              <th className="meio">Resultado</th><th className="num">Lucro</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((o) => {
              const nome = NOMES[o.tipo] ?? o.tipo
              const comBarreira = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'].includes(o.tipo)
              const ehDigito = o.tipo.startsWith('DIGIT')
              return (
                <tr key={o.contractId} className={o.ganhou ? 'venceu' : 'perdeu'}>
                  <td className="ops-quando">
                    <b>{hora(o.compra)}</b><span>{dia(o.compra)}</span>
                  </td>
                  <td>
                    {(() => {
                      const g = origem(o)
                      return g.robo
                        ? <span className="tag-robo">{g.nome}</span>
                        : <span className="tag-manual">manual</span>
                    })()}
                  </td>
                  <td className="ops-operação">
                    {nome}{comBarreira && o.barreira !== null ? ` ${o.barreira}` : ''}
                    {o.ticks > 0 && <em> · {o.ticks}t</em>}
                  </td>
                  <td className="ops-ativo">{nomeAtivo(o.ativo)}</td>
                  <td className="num">{o.valor.toFixed(2)}</td>
                  <td className="num ops-spot">
                    {o.entrada?.toFixed(o.pipSize) ?? '—'}
                    {ehDigito && o.digitoEntrada !== null && <b className="dig-chip">{o.digitoEntrada}</b>}
                  </td>
                  <td className="num ops-spot">
                    {o.saida?.toFixed(o.pipSize) ?? '—'}
                    {ehDigito && o.digitoSaida !== null && (
                      <b className={`dig-chip ${o.ganhou ? 'ok' : 'nao'}`}>{o.digitoSaida}</b>
                    )}
                  </td>
                  <td className="meio">
                    <span className={`ops-res ${o.ganhou ? 'ok' : 'nao'}`}>
                      {o.ganhou ? 'ganhou' : 'perdeu'}
                    </span>
                  </td>
                  <td className={`num ${o.lucro >= 0 ? 'ganho' : 'perda'}`}>
                    {o.lucro >= 0 ? '+' : '−'}{Math.abs(o.lucro).toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {!carregando && filtradas.length === 0 && (
          <p className="ger-nota" style={{ padding: 20, textAlign: 'center' }}>
            {ops.length === 0
              ? 'Nenhum contrato encontrado nesta conta ainda.'
              : `Nenhum contrato com esses filtros (${ops.length} carregados no total).`}
          </p>
        )}
      </div>
      </>}
    </div>
  )
}
