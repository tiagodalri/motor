import { useEffect, useMemo, useState } from 'react'
import type { ConfigEstrategia, EstadoMotor } from '../core/deriv/engine'

interface Props {
  estado: EstadoMotor
  config: ConfigEstrategia
  moeda: string
  nomeEstrategia: string
  /** Nome do ativo, por extenso. */
  ativo: string
  /** Como este bloco se chama na tela: "Robô 1", "Robô 2"... */
  titulo: string
  /** A regra em uma frase: "maior que 5", "par"... */
  regra: string
  cor?: string
  /** Digitos que fazem a operacao ganhar, para pintar a fita. */
  ganhaCom: (d: number) => boolean
  /** Os parametros escolhidos, escondidos atras de um botao. */
  parametros?: Array<{ rot: string; valor: string }>
  /** Estado da conexao autenticada — se cair, o robo para de receber preco. */
  conexao?: string
  onDesligar?: () => void
  onLigarDeNovo?: () => void
  onRemover?: () => void
}

const num = (v: number) =>
  Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const assinado = (v: number) => `${v >= 0 ? '+' : '−'}${num(v)}`

const relogio = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/* ------------------------------------------------------------------ curva */

function Curva({ pontos, positivo }: { pontos: number[]; positivo: boolean }) {
  const d = useMemo(() => {
    if (pontos.length < 2) return null
    const min = Math.min(...pontos, 0)
    const max = Math.max(...pontos, 0)
    const faixa = max - min || 1
    const L = 100, A = 34
    const px = (i: number) => (i / (pontos.length - 1)) * L
    const py = (v: number) => A - ((v - min) / faixa) * A
    const linha = pontos.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(2)} ${py(v).toFixed(2)}`).join(' ')
    return {
      linha,
      area: `${linha} L ${L} ${A} L 0 ${A} Z`,
      zero: py(0),
      temZero: min < 0 && max > 0,
      fimX: px(pontos.length - 1),
      fimY: py(pontos[pontos.length - 1]),
    }
  }, [pontos])

  if (!d) return <div className="tv-curva-vazia">a curva desenha na primeira operação</div>

  const cor = positivo ? 'var(--tv-up)' : 'var(--tv-down)'
  return (
    <svg className="tv-curva" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
      <path d={d.area} fill={cor} opacity="0.14" />
      {d.temZero && (
        <line x1="0" x2="100" y1={d.zero} y2={d.zero}
          stroke="var(--tv-linha)" strokeWidth="0.4" strokeDasharray="2 2" />
      )}
      <path d={d.linha} fill="none" stroke={cor} strokeWidth="1.5"
        strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={d.fimX} cy={d.fimY} r="1.6" fill={cor} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* --------------------------------------------------- contador de segundos */

function Cronometro({ desde }: { desde: number }) {
  const [, redesenha] = useState(0)
  useEffect(() => {
    const id = setInterval(() => redesenha((n) => n + 1), 200)
    return () => clearInterval(id)
  }, [])
  const s = Math.max(0, (Date.now() - desde) / 1000)
  return <span className="tv-crono">{s.toFixed(1)}s</span>
}

/* -------------------------------------------------------------- principal */

export function RobotLive({
  estado, config, moeda, nomeEstrategia, ativo, titulo, regra, ganhaCom,
  parametros = [], conexao = 'open', onDesligar, onLigarDeNovo, onRemover,
}: Props) {
  const [verParametros, setVerParametros] = useState(false)
  const [verRegistro, setVerRegistro] = useState(false)
  const acerto = estado.operacoes ? (estado.vitorias / estado.operacoes) * 100 : 0
  const positivo = estado.resultado >= 0
  const fita = estado.digitos.slice(-30)
  const emCurso = estado.emCurso

  // acumulado por operacao, para a coluna da direita da tabela
  const acumulados = useMemo(() => {
    const antigas = [...estado.historico].reverse()
    let soma = 0
    const mapa = new Map<number, number>()
    for (const o of antigas) { soma += o.lucro; mapa.set(o.n, soma) }
    return mapa
  }, [estado.historico])

  const teto = config.takeProfit || 1
  const piso = config.stopLoss || 1
  const pos = positivo
    ? 50 + Math.min(50, (estado.resultado / teto) * 50)
    : 50 - Math.min(50, (Math.abs(estado.resultado) / piso) * 50)

  const fase = !estado.rodando
    ? { chave: 'parado', texto: 'Robô parado' }
    : emCurso
      ? { chave: 'operando', texto: 'Operação em andamento' }
      : estado.emOperacao
        ? { chave: 'operando', texto: 'Enviando ordem…' }
        : estado.perdasSeguidas >= 1
          ? { chave: 'recuperando', texto: 'Recuperando' }
          : { chave: 'cacando', texto: 'Procurando entrada' }

  const prontoParaEntrar = !!estado.condicao?.itens.every((i) => i.ok)

  return (
    <div className={`tv ${fase.chave}`}>
      {/* ===================== faixa de estado ===================== */}
      <header className="tv-topo">
        <div className="tv-quem">
          <i className="tv-farol" />
          <div>
            <b>{titulo}<span className="tv-fase">{fase.texto}</span></b>
            <span className="tv-onde">{nomeEstrategia} · {ativo}</span>
          </div>
        </div>
        <div className="tv-placar">
          <span>Resultado da sessão</span>
          <strong className={positivo ? 'up' : 'down'}>
            {assinado(estado.resultado)} <em>{moeda}</em>
          </strong>
        </div>

        <div className="tv-acoes">
          {estado.registros.length > 0 && (
            <button className={`tv-btn ${verRegistro ? 'on' : ''}`}
              onClick={() => setVerRegistro((v) => !v)} aria-expanded={verRegistro}>
              Registro
            </button>
          )}
          {parametros.length > 0 && (
            <button className={`tv-btn ${verParametros ? 'on' : ''}`}
              onClick={() => setVerParametros((v) => !v)}
              aria-expanded={verParametros}>
              Parâmetros
            </button>
          )}
          {estado.rodando && onDesligar && (
            <button className="tv-btn parar" onClick={onDesligar}>Desligar</button>
          )}
          {!estado.rodando && onLigarDeNovo && (
            <button className="tv-btn ligar" onClick={onLigarDeNovo}>Ligar de novo</button>
          )}
          {onRemover && (
            <button className="tv-btn sair" onClick={onRemover}
              title="Fechar este bloco" aria-label="Fechar este bloco">×</button>
          )}
        </div>
      </header>

      {/* Uma compra recusada precisa aparecer. Antes ela ia só para um
          registro que a tela não mostrava — e o robô parecia travado. */}
      {estado.falha && (
        <div className="tv-alerta grave">
          <i />
          <span>
            <b>A Deriv recusou a compra.</b> {estado.falha.texto}
            {!estado.rodando && ' O robô foi desligado.'}
          </span>
        </div>
      )}

      {/* Sem conexão da conta não chega preço nem dá para comprar: melhor
          dizer isso do que deixar a tela parecendo travada. */}
      {estado.rodando && conexao !== 'open' && (
        <div className="tv-alerta">
          <i />
          <span>
            {conexao === 'reconnecting' || conexao === 'connecting'
              ? 'Sem conexão com a sua conta na Deriv — reconectando. O robô volta a operar sozinho assim que o sinal voltar.'
              : 'A conexão com a sua conta caiu. O robô está parado até ela voltar.'}
          </span>
        </div>
      )}

      {verParametros && parametros.length > 0 && (
        <div className="tv-params">
          {parametros.map((p) => (
            <span key={p.rot}><i>{p.rot}</i>{p.valor}</span>
          ))}
        </div>
      )}

      {/* ===================== palco ===================== */}
      {emCurso ? (
        <section className="tv-palco aposta">
          <div className="tv-mesa">
            {/* o que está em jogo */}
            <div className="tv-jogo">
              <span className="tv-rot">Aposta</span>
              <b>{num(emCurso.valor)}<i>{moeda}</i></b>
              <span className="tv-ganha">ganha +{num(emCurso.payout - emCurso.valor)}</span>
            </div>

            {/* a regra, desenhada: os dígitos que pagam ficam acesos */}
            <div className="tv-regra-bloco">
              <span className="tv-rot">O último dígito precisa ser {regra}</span>
              <div className="tv-escala">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                  <span key={d}
                    className={`tv-alvo ${ganhaCom(d) ? 'paga' : ''} ${
                      emCurso.digitoAtual === d ? 'caiu' : ''}`}>
                    {d}
                  </span>
                ))}
              </div>
            </div>

            {/* onde caiu */}
            <div className="tv-dial">
              <div className={`tv-anel ${
                emCurso.digitoAtual === null ? 'girando'
                  : ganhaCom(emCurso.digitoAtual) ? 'ganhou' : 'perdeu'
              }`}>
                <span>{emCurso.digitoAtual ?? ''}</span>
              </div>
              <span className="tv-sub"><Cronometro desde={emCurso.comprouEm} /></span>
            </div>
          </div>

          <div className="tv-esteira"><i /></div>
        </section>
      ) : estado.emOperacao ? (
        <section className="tv-palco">
          <div className="tv-enviando">
            <i className="tv-spin" />
            <div>
              <b>Comprando na Deriv…</b>
              <span>{moeda} {num(estado.valorAtual)} · {regra}</span>
            </div>
          </div>
          <div className="tv-esteira"><i /></div>
        </section>
      ) : estado.rodando ? (
        <section className="tv-palco caca">
          <div className="tv-caca-cond">
            <span className="tv-rot">{estado.condicao?.rotulo ?? estado.aguardando}</span>
            <div className="tv-slots">
              {(estado.condicao?.itens ?? []).map((it, i) => (
                <span key={i} className={`tv-slot ${it.ok ? 'ok' : it.valor === '–' ? 'vazio' : 'nao'}`}>
                  {it.valor}
                </span>
              ))}
              <em className="tv-seta">→</em>
              <span className={`tv-slot destino ${prontoParaEntrar ? 'pronto' : ''}`}>
                {prontoParaEntrar ? 'entra agora' : 'espera'}
              </span>
            </div>
          </div>
          <div className="tv-caca-num">
            <b>{num(estado.valorAtual)}</b>
            <span>valor da próxima entrada</span>
          </div>
        </section>
      ) : (
        <section className="tv-palco">
          <div className="tv-off">
            {estado.motivoParada ? `Parou porque ${estado.motivoParada}.` : 'Desligado.'}
          </div>
        </section>
      )}

      {/* ===================== fita de digitos ===================== */}
      <section className="tv-fita-bloco">
        <span className="tv-rot">Dígitos do mercado — os verdes fariam ganhar</span>
        <div className="tv-fita">
          {fita.map((d, i) => (
            <span key={i}
              className={`tv-d ${ganhaCom(d) ? 'up' : 'down'} ${i === fita.length - 1 ? 'agora' : ''}`}>
              {d}
            </span>
          ))}
          {fita.length === 0 && <span className="tv-nada">lendo o mercado…</span>}
        </div>
      </section>

      {/* ===================== sessao ===================== */}
      <section className="tv-sessao">
        <div className="tv-curva-caixa">
          <Curva pontos={estado.curva} positivo={positivo} />
          <div className="tv-trilho">
            <span className="down">−{num(config.stopLoss)}</span>
            <div className="tv-barra">
              <u />
              <i style={{ left: `${pos}%` }} className={positivo ? 'up' : 'down'} />
            </div>
            <span className="up">+{num(config.takeProfit)}</span>
          </div>
        </div>
        <div className="tv-nums">
          <div>
            <span>Operações</span>
            <b>{estado.operacoes}</b>
            <em>{estado.vitorias}G · {estado.derrotas}P</em>
          </div>
          <div>
            <span>Acerto</span>
            <b>{acerto.toFixed(0)}%</b>
            <em>{estado.perdasSeguidas > 0 ? `${estado.perdasSeguidas} perdas seguidas` : 'sem sequência'}</em>
          </div>
          <div>
            <span>Próxima entrada</span>
            <b>{num(estado.valorAtual)}</b>
            <em>{config.fatorGale === 0
              ? 'valor fixo'
              : estado.perdasSeguidas >= config.galeApos
                ? 'martingale ligado'
                : `valor base · ${estado.perdasSeguidas}/${config.galeApos} perdas`}</em>
          </div>
          <div>
            <span>Movimentado</span>
            <b>{num(estado.movimentado)}</b>
            <em>{estado.latenciaMedia !== null ? `compra em ${estado.latenciaMedia} ms` : '—'}</em>
          </div>
        </div>
      </section>

      {/* ===================== operacoes ===================== */}
      <section className="tv-ops">
        <div className="tv-ops-topo">
          <span className="tv-rot">{verRegistro ? 'Registro do robô' : 'Operações desta sessão'}</span>
          {estado.historico.length > 0 && <span className="tv-conta">{estado.historico.length}</span>}
        </div>

        {verRegistro ? (
          <div className="tv-rolo">
            <ul className="tv-registro">
              {estado.registros.map((r, i) => (
                <li key={i} className={r.tipo}>
                  <span>{relogio(r.hora * 1000)}</span>
                  <b>{r.texto}</b>
                </li>
              ))}
            </ul>
          </div>
        ) : estado.historico.length === 0 ? (
          <p className="tv-nada-ops">
            Nenhuma ainda. Cada entrada aparece aqui assim que for liquidada.
          </p>
        ) : (
          <div className="tv-rolo">
            <table className="tv-tabela">
              <thead>
                <tr>
                  <th>#</th><th>Hora</th><th>Valor</th>
                  <th>Entrada</th><th>Saída</th><th>Resultado</th><th>Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {estado.historico.map((o) => {
                  const ac = acumulados.get(o.n) ?? 0
                  return (
                    <tr key={o.contractId} className={o.ganhou ? 'ganhou' : 'perdeu'}>
                      <td className="tv-n">{o.n}</td>
                      <td className="tv-hora">{relogio(o.quando)}</td>
                      <td>{num(o.valor)}</td>
                      <td>
                        <span className="tv-par">
                          {o.entrada !== null ? o.entrada.toFixed(2) : '—'}
                          {o.digitoEntrada !== null && <b className="tv-chip">{o.digitoEntrada}</b>}
                        </span>
                      </td>
                      <td>
                        <span className="tv-par">
                          {o.saida !== null ? o.saida.toFixed(2) : '—'}
                          {o.digitoSaida !== null && (
                            <b className={`tv-chip ${o.ganhou ? 'up' : 'down'}`}>{o.digitoSaida}</b>
                          )}
                        </span>
                      </td>
                      <td className={o.ganhou ? 'up forte' : 'down forte'}>{assinado(o.lucro)}</td>
                      <td className={ac >= 0 ? 'up' : 'down'}>{assinado(ac)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
