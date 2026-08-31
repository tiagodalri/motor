import { useEffect, useMemo, useRef, useState } from 'react'
import type { AuthSession } from '../core/deriv/auth'
import { AFILIADO, DERIV } from '../core/deriv/config'
import {
  buscarResumo, buscarSerieDiaria, periodo, simular, simularComissao, SemPermissao,
  type DiaMarkup, type MarkupResumo, type MarkupSimulado,
} from '../core/deriv/markup'
import type { TeedsSocket } from '../core/deriv/client'
import { DerivDesconectada } from './DerivDesconectada'

interface Props {
  session: AuthSession | null
  socket: TeedsSocket | null
  isDemo: boolean
  onReautorizar: () => void
  /** Pagamento de referencia sem markup, para o simulador. */
  payoutBase: number
  moeda: string
  /** Sobe a cada transacao na conta: dispara o recalculo ao vivo. */
  pulso?: number
  entrandoNaDeriv?: boolean
  onConectarDeriv?: () => void
}

const PERIODOS = [
  { label: 'Hoje', dias: 1 },
  { label: '7 dias', dias: 7 },
  { label: '30 dias', dias: 30 },
  { label: '90 dias', dias: 90 },
]

const dinheiro = (v: number, moeda = 'USD') =>
  `${moeda} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function ManagementPanel({
  session, socket, isDemo, onReautorizar, payoutBase, moeda, pulso = 0,
  entrandoNaDeriv = false, onConectarDeriv,
}: Props) {
  const [sim, setSim] = useState<MarkupSimulado | null>(null)
  const [simCarregando, setSimCarregando] = useState(false)
  const [simErro, setSimErro] = useState<string | null>(null)
  const [dias, setDias] = useState(30)
  const [resumo, setResumo] = useState<MarkupResumo | null>(null)
  const [serie, setSerie] = useState<DiaMarkup[]>([])
  const [carregando, setCarregando] = useState(false)
  const [semPermissao, setSemPermissao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [markupSim, setMarkupSim] = useState(3)

  useEffect(() => {
    if (!session) return
    let vivo = true
    setCarregando(true)
    setErro(null)
    setSemPermissao(false)
    const { de, ate } = periodo(dias)

    buscarResumo(session, de, ate)
      .then(async (r) => {
        if (!vivo) return
        setResumo(r)
        if (dias > 1 && dias <= 30) {
          const s = await buscarSerieDiaria(session, dias)
          if (vivo) setSerie(s)
        } else {
          setSerie([])
        }
      })
      .catch((e: Error) => {
        if (!vivo) return
        if (e instanceof SemPermissao) setSemPermissao(true)
        else setErro(e.message)
      })
      .finally(() => vivo && setCarregando(false))

    return () => { vivo = false }
  }, [session, dias])

  /**
   * Comissao ao vivo.
   *
   * Cada transacao na conta faz o pulso subir. Recalcular a cada uma seria
   * varrer o extrato inteiro varias vezes por segundo com um robo ligado —
   * entao o recalculo espera um respiro de 4 s depois da ultima movimentacao.
   */
  const ultimoCalculo = useRef(0)
  useEffect(() => {
    if (!socket) return
    let vivo = true

    const calcular = () => {
      if (!vivo) return
      ultimoCalculo.current = Date.now()
      setSimCarregando(true)
      setSimErro(null)
      simularComissao(socket, 0.03, dias)
        .then((r) => vivo && setSim(r))
        .catch((e: Error) => vivo && setSimErro(e.message))
        .finally(() => vivo && setSimCarregando(false))
    }

    // a primeira carga e imediata; as seguintes esperam o mercado acalmar
    const espera = ultimoCalculo.current === 0 ? 0 : 4000
    const id = setTimeout(calcular, espera)
    return () => { vivo = false; clearTimeout(id) }
  }, [socket, pulso, dias])

  const [copiado, setCopiado] = useState(false)
  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(AFILIADO)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // sem permissao de area de transferencia: o link fica visivel para copiar a mao
    }
  }

  const simulacao = useMemo(() => simular(payoutBase, markupSim), [payoutBase, markupSim])
  const simAtual = useMemo(() => simular(payoutBase, 3), [payoutBase])
  const maxSerie = Math.max(0.01, ...serie.map((d) => d.comissao))

  // projecao simples: media diaria do periodo aplicada a 30 dias
  const projecao = resumo && dias > 1 ? (resumo.comissao / dias) * 30 : null

  if (!session) {
    return (
      <div className="ger">
        <div className="ger-topo"><div><h2>Painel de gestão</h2></div></div>
        <DerivDesconectada
          acao="A comissão é calculada sobre as operações da sua conta."
          entrando={entrandoNaDeriv}
          onConectar={() => onConectarDeriv?.()} />

        <section className="ger-bloco convite">
          <div className="convite-texto">
            <span className="rot">Traga clientes para a Teeds</span>
            <p>
              Isto funciona mesmo sem a corretora conectada: toda conta aberta
              por este link fica ligada a você.
            </p>
          </div>
          <div className="convite-acao">
            <code>{AFILIADO}</code>
            <div className="convite-botoes">
              <button onClick={copiarLink}>{copiado ? 'copiado!' : 'Copiar link'}</button>
              <a href={AFILIADO} target="_blank" rel="noopener noreferrer">Abrir</a>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="ger">
      <div className="ger-topo">
        <div>
          <h2>Painel de gestão</h2>
          <p className="ger-sub">Sua comissão sobre as operações feitas na Teeds</p>
        </div>
        <div className="segmented">
          {PERIODOS.map((p) => (
            <button key={p.dias} className={dias === p.dias ? 'on' : ''} onClick={() => setDias(p.dias)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {semPermissao && (
        <div className="ger-aviso">
          <div>
            <strong>Falta uma permissão</strong>
            <p>
              Seu login atual autoriza negociar e gerenciar conta, mas não ler as estatísticas
              de faturamento. É um clique para liberar — você volta para a Teeds em seguida.
            </p>
          </div>
          <button className="btn-login" onClick={onReautorizar}>Liberar acesso</button>
        </div>
      )}

      {erro && <div className="ger-erro">{erro}</div>}

      {/* ---------------- números do período ---------------- */}
      <div className="kpis">
        <div className="kpi kpi-grande">
          <span className="rot">Sua comissão</span>
          <strong>{carregando && !resumo ? '…' : dinheiro(resumo?.comissao ?? 0, 'USD')}</strong>
          {projecao !== null && (
            <span className="kpi-nota">≈ {dinheiro(projecao)} por mês neste ritmo</span>
          )}
        </div>
        <div className="kpi">
          <span className="rot">Volume negociado</span>
          <strong>{dinheiro(resumo?.volume ?? 0)}</strong>
        </div>
        <div className="kpi">
          <span className="rot">Operações</span>
          <strong>{(resumo?.contratos ?? 0).toLocaleString('pt-BR')}</strong>
        </div>
        <div className="kpi">
          <span className="rot">Clientes</span>
          <strong>{(resumo?.clientes ?? 0).toLocaleString('pt-BR')}</strong>
        </div>
      </div>

      {/* -------- comissão calculada sobre as operações reais -------- */}
      <section className="ger-bloco">
        <div className="ger-bloco-topo">
          <span className="rot">Comissão gerada pelas suas operações</span>
          {isDemo && <span className="ger-tag">conta demo · simulação</span>}
        </div>
        <p className="ger-texto">
          Calculado operação por operação, com a regra real da Deriv: <b>3% do pagamento</b> de
          cada contrato comprado pela Teeds. {isDemo && 'Como a conta é demo, o dinheiro é fictício — mas o cálculo é o mesmo que valeria numa conta real.'}
          {' '}O período é o mesmo que você escolheu aí em cima.
        </p>

        {simErro && <div className="ger-erro">{simErro}</div>}
        {simCarregando && !sim && <p className="ger-nota">somando suas operações…</p>}

        {sim && (
          <>
            <div className="kpis">
              <div className="kpi kpi-grande">
                <span className="rot">Comissão que teria gerado</span>
                <strong>{dinheiro(sim.comissao, 'USD')}</strong>
                <span className="kpi-nota">
                  em {sim.operacoes.toLocaleString('pt-BR')} operações{' '}
                  {sim.dias === 1 ? 'hoje' : `nos últimos ${sim.dias} dias`}
                  {' · '}média de {dinheiro(sim.comissaoMedia)} por operação
                </span>
              </div>
              <div className="kpi">
                <span className="rot">Movimentado</span>
                <strong>{dinheiro(sim.movimentado)}</strong>
              </div>
              <div className="kpi">
                <span className="rot">Pagamentos contratados</span>
                <strong>{dinheiro(sim.pagamentoTotal)}</strong>
                <span className="kpi-nota">base do cálculo</span>
              </div>
            </div>

            {sim.truncado && (
              <p className="ger-nota">
                São tantas operações que parei em {sim.operacoes.toLocaleString('pt-BR')} —
                há mais coisa nesse período que não entrou nesta conta.
              </p>
            )}

            {sim.porDia.length > 0 && (
              <div className="sim-dias">
                <span className="rot">Por dia</span>
                {sim.porDia.map((d) => {
                  const maior = Math.max(...sim.porDia.map((x) => x.comissao), 0.01)
                  return (
                    <div key={d.data} className="sim-dia">
                      <span>{d.data.slice(8)}/{d.data.slice(5, 7)}</span>
                      <div className="sim-dia-barra">
                        <i style={{ width: `${(d.comissao / maior) * 100}%` }} />
                      </div>
                      <b>{dinheiro(d.comissao)}</b>
                      <em>{d.operacoes} op.</em>
                    </div>
                  )
                })}
              </div>
            )}

            {sim.operacoes === 0 && (
              <p className="ger-nota">
                Nenhuma compra pela Teeds ainda no período carregado. Opere um pouco
                (na demo mesmo) e os números aparecem aqui.
              </p>
            )}
          </>
        )}
      </section>

      {/* ---------------- gráfico diário ---------------- */}
      {serie.length > 0 && (
        <section className="ger-bloco">
          <span className="rot">Comissão por dia</span>
          <div className="serie">
            {serie.map((d) => (
              <div key={d.data} className="serie-col" title={`${d.data}: ${dinheiro(d.comissao)} · ${d.contratos} operações`}>
                <span style={{ height: `${(d.comissao / maxSerie) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="serie-eixo">
            <span>{serie[0]?.data.slice(8) + '/' + serie[0]?.data.slice(5, 7)}</span>
            <span>hoje</span>
          </div>
          {resumo?.contratos === 0 && (
            <p className="ger-nota">
              Nada ainda — o faturamento aparece quando clientes operarem com dinheiro real
              pela Teeds. Operações em conta demo não geram comissão.
            </p>
          )}
        </section>
      )}

      {/* ---------------- convite ---------------- */}
      <section className="ger-bloco convite">
        <div className="convite-texto">
          <span className="rot">Traga clientes para a Teeds</span>
          <p>
            Toda conta aberta por este link fica ligada a você. As operações
            que essas pessoas fizerem pela Teeds geram os 3% de comissão que
            aparecem aqui em cima.
          </p>
        </div>
        <div className="convite-acao">
          <code>{AFILIADO}</code>
          <div className="convite-botoes">
            <button onClick={copiarLink}>{copiado ? 'copiado!' : 'Copiar link'}</button>
            <a href={AFILIADO} target="_blank" rel="noopener noreferrer">Abrir</a>
          </div>
        </div>
      </section>

      {/* ---------------- simulador ---------------- */}
      <section className="ger-bloco">
        <div className="ger-bloco-topo">
          <span className="rot">Simulador de markup</span>
          <span className="ger-tag">medido na Deriv, não estimado no escuro</span>
        </div>
        <p className="ger-texto">
          Quanto maior sua comissão, menor o pagamento que seu cliente enxerga — e mais fácil
          ele comparar a Teeds com a concorrência. Arraste para ver os dois lados.
        </p>

        <div className="sim-controle">
          <input
            type="range" min={0} max={3} step={0.25}
            value={markupSim}
            onChange={(e) => setMarkupSim(Number(e.target.value))}
          />
          <div className="sim-valor">
            <strong>{markupSim.toFixed(2).replace('.', ',')}%</strong>
            {markupSim === 3 && <span className="sim-tag">seu ajuste atual</span>}
          </div>
        </div>

        <div className="sim-grade">
          <div className="sim-card">
            <span className="rot">Cliente opera</span>
            <strong>{dinheiro(10, moeda)}</strong>
          </div>
          <div className="sim-card">
            <span className="rot">Ele recebe se ganhar</span>
            <strong>{dinheiro(simulacao.payoutCliente, moeda)}</strong>
            <span className="sim-sub perda">
              −{dinheiro(simulacao.clientePerde, moeda)} vs. sem markup
            </span>
          </div>
          <div className="sim-card destaque">
            <span className="rot">Você ganha</span>
            <strong className="ganho">{dinheiro(simulacao.suaComissao, moeda)}</strong>
            <span className="sim-sub">por operação de {dinheiro(10, moeda)}</span>
          </div>
        </div>

        <div className="sim-escala">
          <div className="sim-linha">
            <span>A cada {dinheiro(10000)} movimentados</span>
            <strong className="ganho">{dinheiro(simulacao.suaComissao * 1000)}</strong>
          </div>
          <div className="sim-linha">
            <span>Diferença de pagamento que o cliente percebe</span>
            <strong>{((simulacao.clientePerde / (payoutBase || 1)) * 100).toFixed(1)}%</strong>
          </div>
        </div>

        {markupSim !== 3 && (
          <p className="ger-nota">
            Para valer, o ajuste precisa ser feito no painel da Deriv — aqui é só simulação.
            Hoje você está em 3%, rendendo {dinheiro(simAtual.suaComissao, moeda)} por operação de {dinheiro(10, moeda)}.
          </p>
        )}
      </section>

      {/* ---------------- ficha do app ---------------- */}
      <section className="ger-bloco">
        <span className="rot">Aplicação registrada</span>
        <dl className="ficha">
          <div><dt>Nome</dt><dd>Teeds</dd></div>
          <div><dt>App ID</dt><dd className="mono">{DERIV.appId}</dd></div>
          <div><dt>Markup</dt><dd>3,00%</dd></div>
          <div><dt>Endereço de retorno</dt><dd className="mono quebra">{DERIV.redirectUri}</dd></div>
          <div><dt>Permissões</dt><dd>{DERIV.scopes.join(', ')}</dd></div>
        </dl>
      </section>
    </div>
  )
}
