import { useMemo, useState } from 'react'
import { PriceChart, type ContractMarker } from './components/PriceChart'
import { PainelCasa } from './components/PainelCasa'
import { TorreDeControle } from './components/TorreDeControle'
import { PainelRobos } from './components/PainelRobos'
import { Brand } from './components/Brand'
import { useMotor } from './hooks/useMotor'
import { OrdemRecusada } from './core/motor/livro'
import {
  PARAMETROS, digitosQuePagam, regraEmPalavras, type TipoContrato,
} from './core/motor/precos'
import { DURACOES_TEMPO, DURACOES_TICK, relogio, ticksDe } from './core/motor/duracoes'
import { PERIODOS, agregar } from './core/motor/velas'

const TIPOS: Array<{ id: TipoContrato; nome: string; comBarreira: boolean }> = [
  { id: 'DIGITO_ACIMA', nome: 'Acima de', comBarreira: true },
  { id: 'DIGITO_ABAIXO', nome: 'Abaixo de', comBarreira: true },
  { id: 'DIGITO_IGUAL', nome: 'Igual a', comBarreira: true },
  { id: 'DIGITO_DIFERENTE', nome: 'Diferente de', comBarreira: true },
  { id: 'DIGITO_PAR', nome: 'Par', comBarreira: false },
  { id: 'DIGITO_IMPAR', nome: 'Ímpar', comBarreira: false },
]

const din = (v: number) =>
  Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const assinado = (v: number) => `${v >= 0 ? '+' : '−'}${din(v)}`

type Modalidade = 'digitos' | 'direcao'

export default function App() {
  const m = useMotor()
  const [tela, setTela] = useState<'operar' | 'casa' | 'torre'>('operar')
  const [modalidade, setModalidade] = useState<Modalidade>('digitos')
  const [tipo, setTipo] = useState<TipoContrato>('DIGITO_ACIMA')
  const [barreira, setBarreira] = useState(5)
  const [valor, setValor] = useState(PARAMETROS.valorMinimo)
  const [ticks, setTicks] = useState(1)
  const [segundos, setSegundos] = useState(300)
  const [periodo, setPeriodo] = useState(15)
  const [erro, setErro] = useState<string | null>(null)
  const [verProva, setVerProva] = useState(false)

  const direcao = modalidade === 'direcao'
  const modelo = TIPOS.find((t) => t.id === tipo)!
  // duração em ticks: por dentro a unidade é sempre o tick, mesmo quando a
  // tela fala em minutos
  const duracaoEmTicks = direcao ? ticksDe(segundos, m.instrumento.intervalo) : ticks

  // A cotação vale poucos segundos de propósito — cotação que não expira é
  // opção de graça para quem sabe esperar. Refeita a cada tick, que é o
  // ritmo em que o preço muda.
  const cotar = (t: TipoContrato) => m.livro.cotar({
    tipo: t,
    barreira: !direcao && modelo.comBarreira ? barreira : undefined,
    valor,
    ticks: duracaoEmTicks,
  })

  const cotacao = useMemo(
    () => cotar(direcao ? 'SUBIR' : tipo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tipo, barreira, valor, duracaoEmTicks, m.ultimo?.n, modelo.comBarreira, direcao],
  )

  const velas = useMemo(
    () => agregar(m.ticks, direcao ? periodo : 1),
    [m.ticks, periodo, direcao],
  )

  const marcadores: ContractMarker[] = useMemo(
    () => m.abertos.map((c) => {
      const entrada = Math.floor(c.quando / 1000)
      return {
        id: Number(c.id.replace(/\D/g, '')) || 0,
        type: c.tipo === 'DESCER' ? 'PUT' : 'CALL',
        entryEpoch: entrada,
        entryPrice: c.precoEntrada,
        expiryEpoch: entrada + (c.tickLiquidacao - c.tickEntrada) * m.instrumento.intervalo,
        profit: 0,
      }
    }),
    [m.abertos, m.instrumento.intervalo],
  )

  const pagam = digitosQuePagam(tipo, barreira)
  const digitos = m.ticks.slice(-30).map((t) => t.digito)

  function apostar(escolhido?: TipoContrato) {
    setErro(null)
    if (!m.motor) return
    try {
      m.livro.apostar({
        clienteId: m.cliente, motor: m.motor,
        cotacao: escolhido ? cotar(escolhido) : cotacao,
      })
      m.atualizar()
    } catch (e) {
      setErro(e instanceof OrdemRecusada ? `${e.veredito.motivo}` : (e as Error).message)
    }
  }

  const faltamPara = (tickLiquidacao: number) =>
    relogio(Math.max(0, tickLiquidacao - (m.ultimo?.n ?? 0)) * m.instrumento.intervalo)

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <nav className="telas">
          <button className={tela === 'operar' ? 'on' : ''} onClick={() => setTela('operar')}>Operar</button>
          <button className={tela === 'casa' ? 'on' : ''} onClick={() => setTela('casa')}>Livro da casa</button>
          <button className={tela === 'torre' ? 'on' : ''} onClick={() => setTela('torre')}>Torre de controle</button>
        </nav>
        <div className="topbar-right">
          <button className="prova-botao" onClick={() => setVerProva((v) => !v)}>
            Prova de honestidade
          </button>
          <div className="conta-chip demo">
            <span className="selo demo">Fictício</span>
            <b>{din(m.saldo)}</b>
          </div>
        </div>
      </header>

      {verProva && m.prova && (
        <div className="prova">
          <b>Compromisso desta rodada</b>
          <p>
            A casa sorteou uma semente e publicou o hash dela <em>antes</em> de o primeiro
            preço existir. No fim da rodada a semente é revelada: se o hash bater, ela não
            foi trocada no meio do caminho — e a série inteira pode ser recalculada.
          </p>
          <div className="prova-campos">
            <div><span className="rot">Hash da semente da casa</span><code>{m.prova.hash}</code></div>
            <div><span className="rot">Semente do cliente</span><code>{m.prova.sementeCliente}</code></div>
          </div>
        </div>
      )}

      {tela === 'torre' ? (
        <TorreDeControle livro={m.livro} torre={m.torre} motores={m.motores}
          auditoria={m.auditoria} pulso={m.pulso} aoMexer={m.atualizar} />
      ) : tela === 'casa' ? (
        <PainelCasa livro={m.livro} instrumento={m.instrumento.codigo} />
      ) : (
        <div className="motor-layout">
          <aside className="motor-lista">
            <span className="rot">Instrumentos</span>
            {m.instrumentos.map((i) => (
              <button key={i.codigo} className={i.codigo === m.instrumento.codigo ? 'on' : ''}
                onClick={() => m.setInstrumento(i)}>
                <b>{i.nome}</b>
                <em>volatilidade {(i.volatilidade * 100).toFixed(0)}% · {i.intervalo}s</em>
              </button>
            ))}
            <p className="motor-nota">
              Índices gerados aqui dentro por movimento browniano sem deriva.
              O preço não é puxado contra você — a casa ganha pela margem.
            </p>

            <PainelRobos robos={m.robos} aoMexer={m.atualizar} />
          </aside>

          <main className="motor-centro">
            <div className="motor-preco">
              <b>{m.instrumento.nome}</b>
              <strong>{m.ultimo ? m.ultimo.preco.toFixed(m.instrumento.casas) : '—'}</strong>
              <span>tick {m.ultimo?.n ?? 0}</span>
              {direcao && (
                <div className="motor-periodos">
                  {PERIODOS.map((p) => (
                    <button key={p.id} className={p.segundos === periodo ? 'on' : ''}
                      onClick={() => setPeriodo(p.segundos)}>{p.nome}</button>
                  ))}
                </div>
              )}
            </div>
            <PriceChart candles={velas} mode={direcao ? 'candles' : 'line'}
              pipSize={m.instrumento.casas} symbolName={m.instrumento.nome}
              loading={velas.length === 0} markers={marcadores} />
            {!direcao && (
              <div className="motor-fita">
                {digitos.map((d, i) => (
                  <span key={i} className={`${pagam.includes(d) ? 'up' : 'down'} ${i === digitos.length - 1 ? 'agora' : ''}`}>{d}</span>
                ))}
              </div>
            )}
          </main>

          <aside className="motor-aposta">
            <div className="modalidades">
              <button className={!direcao ? 'on' : ''} onClick={() => setModalidade('digitos')}>
                Dígitos
              </button>
              <button className={direcao ? 'on' : ''} onClick={() => setModalidade('direcao')}>
                Alta e baixa
              </button>
            </div>

            {direcao ? (
              <>
                <span className="rot">Expira em</span>
                <div className="motor-duracoes">
                  {DURACOES_TEMPO.map((d) => (
                    <button key={d.id} className={d.segundos === segundos ? 'on' : ''}
                      onClick={() => setSegundos(d.segundos)}>{d.nome}</button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <span className="rot">Contrato</span>
                <div className="motor-tipos">
                  {TIPOS.map((t) => (
                    <button key={t.id} className={t.id === tipo ? 'on' : ''} onClick={() => setTipo(t.id)}>
                      {t.nome}
                    </button>
                  ))}
                </div>

                {modelo.comBarreira && (
                  <>
                    <span className="rot">Dígito</span>
                    <div className="motor-digitos">
                      {[0,1,2,3,4,5,6,7,8,9].map((d) => (
                        <button key={d} className={d === barreira ? 'on' : ''} onClick={() => setBarreira(d)}>{d}</button>
                      ))}
                    </div>
                  </>
                )}

                <span className="rot">Duração</span>
                <div className="motor-duracoes">
                  {DURACOES_TICK.map((t) => (
                    <button key={t} className={t === ticks ? 'on' : ''} onClick={() => setTicks(t)}>
                      {t} tick{t > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </>
            )}

            <label><span className="rot">Valor</span>
              <input type="number" min={PARAMETROS.valorMinimo} step={0.5} value={valor}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setValor(Math.max(PARAMETROS.valorMinimo, Number(e.target.value) || 0))} />
            </label>

            <div className="motor-cotacao">
              <div><span className="rot">Chance real</span><b>{(cotacao.probabilidade * 100).toFixed(0)}%</b></div>
              <div><span className="rot">Paga</span><b>{din(cotacao.pagamento)}</b></div>
              <div><span className="rot">Margem da casa</span><b>{(cotacao.margem * 100).toFixed(1)}%</b></div>
            </div>

            {direcao ? (
              <>
                <p className="motor-regra">
                  Ganha se o preço estiver <b>acima</b> (ou <b>abaixo</b>) do preço de
                  entrada quando o contrato vencer, daqui a{' '}
                  <b>{DURACOES_TEMPO.find((d) => d.segundos === segundos)?.nome}</b>.
                </p>
                <div className="motor-direcao">
                  <button className="sobe" disabled={!m.ultimo || m.saldo < valor}
                    onClick={() => apostar('SUBIR')}>
                    <i>▲</i><span>Subir</span><em>paga {din(cotar('SUBIR').pagamento)}</em>
                  </button>
                  <button className="desce" disabled={!m.ultimo || m.saldo < valor}
                    onClick={() => apostar('DESCER')}>
                    <i>▼</i><span>Descer</span><em>paga {din(cotar('DESCER').pagamento)}</em>
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="motor-regra">
                  Ganha se o último dígito for <b>{regraEmPalavras(tipo, barreira)}</b>
                </p>
                <button className="motor-btn" onClick={() => apostar()}
                  disabled={!m.ultimo || m.saldo < valor}>
                  Apostar {din(valor)}
                </button>
              </>
            )}

            {erro && <p className="motor-erro">{erro}</p>}

            <span className="rot" style={{ marginTop: 14 }}>Em aberto</span>
            {m.abertos.length === 0 && <p className="motor-vazio">Nada aberto.</p>}
            {m.abertos.map((c) => (
              <div key={c.id} className={`motor-aberto ${c.tipo === 'SUBIR' ? 'sobe' : c.tipo === 'DESCER' ? 'desce' : ''}`}>
                <b>{regraEmPalavras(c.tipo, c.barreira ?? undefined)}</b>
                <span>{din(c.valor)} → {din(c.pagamento)}</span>
                <em>{faltamPara(c.tickLiquidacao)}</em>
              </div>
            ))}

            <span className="rot" style={{ marginTop: 14 }}>Últimas</span>
            <div className="motor-historico">
              {m.historico.slice(0, 8).map((c) => (
                <div key={c.id} className={c.ganhou ? 'ganhou' : 'perdeu'}>
                  <span>{c.digitoSaida}</span>
                  <b>{regraEmPalavras(c.tipo, c.barreira ?? undefined)}</b>
                  <em>{assinado(c.resultado ?? 0)}</em>
                </div>
              ))}
              {m.historico.length === 0 && <p className="motor-vazio">Nada ainda.</p>}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
