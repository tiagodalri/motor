import { useEffect, useMemo, useState } from 'react'
import { PriceChart, type ChartMode, type ContractMarker } from './components/PriceChart'
import { PositionCard } from './components/PositionCard'
import { DigitsPanel } from './components/DigitsPanel'
import { ManagementPanel } from './components/ManagementPanel'
import { RobotsPanel } from './components/RobotsPanel'
import { OperationsPanel } from './components/OperationsPanel'
import { AccountSwitcher } from './components/AccountSwitcher'
import { UserMenu } from './components/UserMenu'
import { ProfilePanel } from './components/ProfilePanel'
import { DerivNome, IconeElo } from './components/DerivMarca'
import { Brand } from './components/Brand'
import { LoginScreen } from './components/LoginScreen'
import { NovaSenha } from './components/NovaSenha'
import { AFILIADO } from './core/deriv/config'
import { startLogin } from './core/deriv/auth'
import type { DigitContract } from './core/deriv/digits'
import { useCandleSeries, useConnection, useLiveTick, useProposal, useSymbols } from './hooks/useMarket'
import { useAccount } from './hooks/useAccount'
import { useTeedsAuth } from './hooks/useTeedsAuth'
import { DerivDesconectada } from './components/DerivDesconectada'
import type { Granularity } from './core/deriv/types'
import { formatPrice } from './core/chart/scales'
import { buyFromProposal, requestProposal, sellContract } from './core/deriv/trading'

const TIMEFRAMES: { label: string; value: Granularity }[] = [
  { label: '1m', value: 60 }, { label: '5m', value: 300 }, { label: '15m', value: 900 },
  { label: '1h', value: 3600 }, { label: '4h', value: 14400 }, { label: '1d', value: 86400 },
]

const STATUS_LABEL: Record<string, string> = {
  idle: 'Iniciando', connecting: 'Conectando', open: 'Ao vivo',
  reconnecting: 'Reconectando', closed: 'Desconectado',
}

export default function App() {
  const connection = useConnection()
  const { symbols, loading: loadingSymbols, error: symbolsError } = useSymbols()
  const conta = useAccount()
  const teeds = useTeedsAuth()
  const [verPerfil, setVerPerfil] = useState(false)

  const [selected, setSelected] = useState<string | null>(null)
  const [granularity, setGranularity] = useState<Granularity>(60)
  const [mode, setMode] = useState<ChartMode>('candles')
  const [search, setSearch] = useState('')
  const [stake, setStake] = useState(10)
  const [duration, setDuration] = useState(5)
  const [comprando, setComprando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [confirmar, setConfirmar] = useState<'CALL' | 'PUT' | null>(null)
  const [vendendo, setVendendo] = useState<number | null>(null)
  const [modo, setModo] = useState<'direcao' | 'digitos'>('direcao')
  const [tela, setTela] = useState<'operar' | 'robos' | 'operacoes' | 'gestao'>('operar')
  const [payoutBase, setPayoutBase] = useState(19.55)

  const activeSymbol = useMemo(() => {
    if (selected) return symbols.find((s) => s.symbol === selected) ?? null
    return symbols.find((s) => s.isOpen && !s.isSuspended) ?? symbols[0] ?? null
  }, [symbols, selected])

  const symbolCode = activeSymbol?.symbol ?? null
  const { candles, loading: loadingCandles } = useCandleSeries(symbolCode, granularity)
  const { tick, direction } = useLiveTick(symbolCode)

  const call = useProposal({
    symbol: symbolCode, contractType: 'CALL', amount: stake,
    duration, durationUnit: 'm', socket: conta.socket,
    currency: conta.account?.currency ?? 'USD',
  })
  const put = useProposal({
    symbol: symbolCode, contractType: 'PUT', amount: stake,
    duration, durationUnit: 'm', socket: conta.socket,
    currency: conta.account?.currency ?? 'USD',
  })

  // referencia sem markup, para o simulador do painel de gestao
  const semMarkup = useProposal({
    symbol: symbolCode, contractType: 'CALL', amount: 10,
    duration: 5, durationUnit: 'm', enabled: tela === 'gestao',
  })
  useEffect(() => {
    if (semMarkup.payout) setPayoutBase(semMarkup.payout)
  }, [semMarkup.payout])

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = term
      ? symbols.filter((s) => s.name.toLowerCase().includes(term) || s.symbol.toLowerCase().includes(term))
      : symbols
    const map = new Map<string, typeof filtered>()
    for (const s of filtered) {
      const key = s.market || 'outros'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return [...map.entries()]
  }, [symbols, search])

  const pipSize = activeSymbol?.pipSize ?? tick?.pipSize ?? 2
  const price = tick?.quote ?? (candles.length ? candles[candles.length - 1].close : null)
  const doAtivo = useMemo(
    () => conta.contracts.filter((c) => c.symbol === symbolCode),
    [conta.contracts, symbolCode],
  )
  // memorizado por assinatura: o grafico so redesenha quando algo muda de verdade
  const chaveMarcadores = doAtivo
    .map((c) => `${c.contractId}:${c.entrySpot}:${c.expiryTime}:${c.profit.toFixed(2)}`)
    .join('|')
  const marcadores: ContractMarker[] = useMemo(
    () =>
      doAtivo.map((c) => ({
        id: c.contractId, type: c.contractType, entryEpoch: c.startTime,
        entryPrice: c.entrySpot, expiryEpoch: c.expiryTime, profit: c.profit,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chaveMarcadores],
  )
  const investido = conta.contracts.reduce((t, c) => t + c.buyPrice, 0)
  const resultadoAberto = conta.contracts.reduce((t, c) => t + c.profit, 0)

  const podeOperar = conta.status === 'logado' && !!conta.socket && !conta.connecting && !!symbolCode

  async function comprarDigito(tipo: DigitContract, barreira: string | undefined, ticks: number) {
    await executar(tipo, { duration: ticks, durationUnit: 't', barrier: barreira })
  }

  async function comprar(tipo: 'CALL' | 'PUT') {
    if (!conta.isDemo && confirmar !== tipo) { setConfirmar(tipo); return }
    setConfirmar(null)
    await executar(tipo, { duration, durationUnit: 'm' })
  }

  async function executar(
    tipo: string,
    extra: { duration: number; durationUnit: string; barrier?: string },
  ) {
    if (!conta.socket || !symbolCode) return
    setComprando(tipo)
    setAviso(null)
    try {
      const p = await requestProposal(conta.socket, {
        symbol: symbolCode, contractType: tipo, amount: stake,
        currency: conta.account?.currency ?? 'USD', ...extra,
      })
      const r = await buyFromProposal(conta.socket, p.id, p.askPrice)
      setAviso({ tipo: 'ok', texto: `Comprado por ${r.buyPrice.toFixed(2)} — pagamento potencial ${r.payout.toFixed(2)}` })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message })
    } finally {
      setComprando(null)
    }
  }

  async function vender(contractId: number) {
    if (!conta.socket) return
    setVendendo(contractId)
    setAviso(null)
    try {
      const r = await sellContract(conta.socket, contractId, 0)
      setAviso({ tipo: 'ok', texto: `Vendido por ${r.soldFor.toFixed(2)}` })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message })
    } finally {
      setVendendo(null)
    }
  }

  // ------------------------------------------------------------------
  // São dois logins. Este é o primeiro: a conta da Teeds, que abre a
  // plataforma. Conectar a Deriv é o segundo, e só faz falta na hora de
  // operar de verdade.
  // ------------------------------------------------------------------
  if (teeds.status === 'carregando') {
    return <div className="entrada"><div className="entrada-esperando">abrindo a Teeds…</div></div>
  }

  if (teeds.redefinindo) {
    return (
      <NovaSenha ocupado={teeds.ocupado} erro={teeds.erro} onDefinir={teeds.definirNovaSenha} />
    )
  }

  if (teeds.status === 'deslogado') {
    return (
      <LoginScreen
        ocupado={teeds.ocupado}
        erro={teeds.erro}
        limparErro={() => teeds.setErro(null)}
        onEntrar={teeds.entrar}
        onCadastrar={teeds.cadastrar}
        onEsqueci={teeds.esqueci}
      />
    )
  }

  const derivPronta = conta.status === 'logado'

  return (
    <div className="app">
      <header className="topbar">
        <Brand />

        <nav className="telas">
          <button className={tela === 'operar' ? 'on' : ''} onClick={() => setTela('operar')}>Operar</button>
          <button className={tela === 'robos' ? 'on' : ''} onClick={() => setTela('robos')}>Robôs</button>
          <button className={tela === 'operacoes' ? 'on' : ''} onClick={() => setTela('operacoes')}>Operações</button>
          <button className={tela === 'gestao' ? 'on' : ''} onClick={() => setTela('gestao')}>Gestão</button>
        </nav>

        <div className="topbar-right">
          {!derivPronta && (
            <button className="btn-deriv" onClick={conta.login}
              disabled={conta.status === 'entrando'}>
              <IconeElo />
              {conta.status === 'entrando' ? 'Abrindo…' : <>Conectar <DerivNome tamanho={13} /></>}
            </button>
          )}

          {conta.status === 'logado' && conta.accounts.length > 0 && (
            <AccountSwitcher
              contas={conta.accounts}
              selecionada={conta.accountId}
              isDemo={conta.isDemo}
              saldo={conta.balance ? conta.balance.amount : null}
              moeda={conta.balance?.currency ?? conta.account?.currency ?? 'USD'}
              conectando={conta.connecting}
              onTrocar={conta.setAccountId}
              onRecarregar={() => conta.recarregarDemo()}
              onSair={conta.logout}
            />
          )}

          {/* Conectado, o que importa e a conexao da conta: e por ela que o
              saldo anda e os robos operam. */}
          {(() => {
            const alvo = derivPronta ? conta.conexao : connection
            return (
              <div className={`status status-${alvo}`} title={
                derivPronta ? 'conexão da sua conta na Deriv' : 'conexão de mercado'
              }>
                <i /> {STATUS_LABEL[alvo] ?? alvo}
              </div>
            )
          })()}

          {teeds.usuario && (
            <UserMenu usuario={teeds.usuario} onSair={() => void teeds.sair()}
              onPerfil={() => setVerPerfil(true)} />
          )}
        </div>
      </header>

      {verPerfil && teeds.sessao && (
        <ProfilePanel
          sessao={teeds.sessao}
          onAtualizar={teeds.atualizarUsuario}
          onFechar={() => setVerPerfil(false)} />
      )}

      {teeds.recado && (
        <div className="faixa faixa-ok">
          {teeds.recado}
          <button onClick={() => teeds.setRecado(null)}>fechar</button>
        </div>
      )}

      {conta.aviso && (
        <div className="faixa faixa-ok">
          {conta.aviso}
          <button onClick={() => conta.setAviso(null)}>fechar</button>
        </div>
      )}

      {conta.error && (
        <div className="faixa faixa-erro">
          {conta.error}
          <button onClick={() => conta.setError(null)}>fechar</button>
        </div>
      )}

      {tela === 'robos' ? (
        <RobotsPanel
          socket={conta.socket}
          logado={conta.status === 'logado'}
          isDemo={conta.isDemo}
          moeda={conta.account?.currency ?? 'USD'}
          symbols={symbols}
          symbolPadrao={symbolCode}
          conexao={conta.conexao}
          entrandoNaDeriv={conta.status === 'entrando'}
          onConectarDeriv={conta.login}
        />
      ) : tela === 'operacoes' ? (
        <OperationsPanel
          socket={conta.socket}
          logado={conta.status === 'logado'}
          moeda={conta.account?.currency ?? 'USD'}
          symbols={symbols}
          pulso={conta.pulso}
          entrandoNaDeriv={conta.status === 'entrando'}
          onConectarDeriv={conta.login}
        />
      ) : tela === 'gestao' ? (
        <ManagementPanel
          session={conta.session}
          socket={conta.socket}
          isDemo={conta.isDemo}
          onReautorizar={() => startLogin()}
          payoutBase={payoutBase}
          moeda={conta.account?.currency ?? 'USD'}
          pulso={conta.pulso}
          entrandoNaDeriv={conta.status === 'entrando'}
          onConectarDeriv={conta.login}
        />
      ) : (
      <div className="layout">
        <aside className="sidebar">
          <input className="search" placeholder="Buscar ativo…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          <div className="symbol-list">
            {loadingSymbols && <p className="hint">carregando ativos…</p>}
            {symbolsError && <p className="hint error">{symbolsError}</p>}
            {groups.map(([market, list]) => (
              <section key={market}>
                <h4>{market.replace(/_/g, ' ')}</h4>
                {list.map((s) => (
                  <button key={s.symbol}
                    className={`symbol ${s.symbol === symbolCode ? 'is-active' : ''}`}
                    onClick={() => setSelected(s.symbol)}>
                    <span className="sym-name">{s.name}</span>
                    <span className={`dot ${s.isOpen && !s.isSuspended ? 'on' : 'off'}`} />
                  </button>
                ))}
              </section>
            ))}
          </div>
        </aside>

        <main className="main">
          <div className="chart-head">
            <div className="chart-title">
              <h2>{activeSymbol?.name ?? '—'}</h2>
              {price !== null && <span className={`price ${direction ?? ''}`}>{formatPrice(price, pipSize)}</span>}
            </div>
            <div className="controls">
              <div className="segmented">
                {TIMEFRAMES.map((tf) => (
                  <button key={tf.value} className={granularity === tf.value ? 'on' : ''}
                    onClick={() => setGranularity(tf.value)}>{tf.label}</button>
                ))}
              </div>
              <div className="segmented">
                <button className={mode === 'candles' ? 'on' : ''} onClick={() => setMode('candles')}>Velas</button>
                <button className={mode === 'line' ? 'on' : ''} onClick={() => setMode('line')}>Linha</button>
              </div>
            </div>
          </div>

          <PriceChart candles={candles} mode={mode} pipSize={pipSize}
            symbolName={activeSymbol?.name ?? ''} loading={loadingCandles}
            markers={marcadores} />
        </main>

        <aside className="trade">
          {!derivPronta && (
            <DerivDesconectada compacto
              acao="O gráfico e os dígitos são públicos, mas comprar exige a sua conta."
              entrando={conta.status === 'entrando'}
              onConectar={conta.login} />
          )}

          <div className="modo-troca">
            <button className={modo === 'direcao' ? 'on' : ''} onClick={() => setModo('direcao')}>
              Subir / Descer
            </button>
            <button className={modo === 'digitos' ? 'on' : ''} onClick={() => setModo('digitos')}>
              Dígitos
            </button>
          </div>

          <label className="field"><span>Valor</span>
            <div className="input-wrap"><em>US$</em>
              <input type="number" min={1} value={stake}
                onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 0))} />
            </div>
          </label>

          {modo === 'direcao' ? (
            <>
              <label className="field"><span>Duração</span>
                <div className="input-wrap">
                  <input type="number" min={1} value={duration}
                    onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 0))} />
                  <em>min</em>
                </div>
              </label>

              <div className="quotes">
                <QuoteCard kind="up" title="Subir" payout={call.payout} stake={stake}
                  loading={call.loading} error={call.error} podeOperar={podeOperar}
                  comprando={comprando === 'CALL'} confirmando={confirmar === 'CALL'}
                  onBuy={() => comprar('CALL')} logado={conta.status === 'logado'} />
                <QuoteCard kind="down" title="Descer" payout={put.payout} stake={stake}
                  loading={put.loading} error={put.error} podeOperar={podeOperar}
                  comprando={comprando === 'PUT'} confirmando={confirmar === 'PUT'}
                  onBuy={() => comprar('PUT')} logado={conta.status === 'logado'} />
              </div>
            </>
          ) : (
            <DigitsPanel
              symbol={symbolCode}
              pipSize={pipSize}
              stake={stake}
              moeda={conta.account?.currency ?? 'USD'}
              podeOperar={podeOperar}
              logado={conta.status === 'logado'}
              comprando={!!comprando && comprando.startsWith('DIGIT')}
              socket={conta.socket}
              onComprar={comprarDigito}
            />
          )}

          {aviso && (
            <p className={`aviso ${aviso.tipo === 'ok' ? 'aviso-ok' : 'aviso-erro'}`}>{aviso.texto}</p>
          )}

          <div className="pos-cabecalho">
            <h3 className="sec">Posições abertas</h3>
            {conta.contracts.length > 0 && (
              <div className="pos-resumo">
                <span>{conta.contracts.length} aberta{conta.contracts.length > 1 ? 's' : ''}</span>
                <span>investido <b>{investido.toFixed(2)}</b></span>
                <span className={resultadoAberto >= 0 ? 'ganho' : 'perda'}>
                  {resultadoAberto >= 0 ? '+' : '−'}{Math.abs(resultadoAberto).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {!derivPronta && <p className="note">Conecte a sua Deriv para ver as posições aqui.</p>}
          {conta.status === 'logado' && conta.contracts.length === 0 && (
            <p className="note">Nenhuma posição aberta. Suas operações aparecem aqui, com o resultado ao vivo.</p>
          )}

          <div className="posicoes">
            {conta.contracts.map((c) => (
              <PositionCard
                key={c.contractId}
                contrato={c}
                nomeAtivo={symbols.find((s) => s.symbol === c.symbol)?.name ?? c.symbol}
                onVender={vender}
                vendendo={vendendo === c.contractId}
              />
            ))}
          </div>
        </aside>
      </div>
      )}
    </div>
  )
}

function QuoteCard(props: {
  kind: 'up' | 'down'; title: string; payout: number | null; stake: number
  loading: boolean; error: string | null; podeOperar: boolean; logado: boolean
  comprando: boolean; confirmando: boolean; onBuy: () => void
}) {
  const { kind, title, payout, stake, loading, error, podeOperar, logado, comprando, confirmando, onBuy } = props
  const lucro = payout !== null ? payout - stake : null
  const pct = payout !== null && stake > 0 ? ((payout - stake) / stake) * 100 : null

  return (
    <div className={`quote quote-${kind}`}>
      <div className="quote-head">
        <span className="arrow">{kind === 'up' ? '▲' : '▼'}</span><span>{title}</span>
      </div>
      {error ? <p className="quote-error">indisponível</p>
        : loading && payout === null ? <p className="quote-loading">…</p>
        : payout !== null ? (
          <>
            <strong>US$ {payout.toFixed(2)}</strong>
            <span className="quote-sub">lucro US$ {lucro?.toFixed(2)}{pct !== null && ` · ${pct.toFixed(0)}%`}</span>
          </>
        ) : <p className="quote-loading">—</p>}
      <button className={`btn ${confirmando ? 'btn-confirmar' : ''}`}
        disabled={!podeOperar || comprando} onClick={onBuy}>
        {comprando ? 'comprando…'
          : confirmando ? 'Confirmar (dinheiro real)'
          : !logado ? 'Entre para operar'
          : 'Comprar'}
      </button>
    </div>
  )
}
