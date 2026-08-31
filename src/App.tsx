import { useMemo, useState } from 'react'
import { PriceChart } from './components/PriceChart'
import { PainelCasa } from './components/PainelCasa'
import { Brand } from './components/Brand'
import { useMotor } from './hooks/useMotor'
import { OrdemRecusada } from './core/motor/livro'
import {
  digitosQuePagam, regraEmPalavras, type TipoContrato,
} from './core/motor/precos'
import type { Candle } from './core/motor/tipos'

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

export default function App() {
  const m = useMotor()
  const [tela, setTela] = useState<'operar' | 'casa'>('operar')
  const [tipo, setTipo] = useState<TipoContrato>('DIGITO_ACIMA')
  const [barreira, setBarreira] = useState(5)
  const [valor, setValor] = useState(1)
  const [ticks, setTicks] = useState(1)
  const [erro, setErro] = useState<string | null>(null)
  const [verProva, setVerProva] = useState(false)

  const modelo = TIPOS.find((t) => t.id === tipo)!
  // A cotação vale poucos segundos de propósito — cotação que não expira é
  // opção de graça para quem sabe esperar. Então ela é refeita a cada tick,
  // que é justamente o ritmo em que o preço muda.
  const cotacao = useMemo(
    () => m.livro.cotar({ tipo, barreira: modelo.comBarreira ? barreira : undefined, valor, ticks }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tipo, barreira, valor, ticks, m.ultimo?.n, modelo.comBarreira],
  )

  const velas: Candle[] = useMemo(
    () => m.ticks.map((t) => ({
      epoch: t.epoch, open: t.preco, high: t.preco, low: t.preco, close: t.preco,
    })),
    [m.ticks],
  )

  const pagam = digitosQuePagam(tipo, barreira)
  const digitos = m.ticks.slice(-30).map((t) => t.digito)

  function apostar() {
    setErro(null)
    if (!m.motor) return
    try {
      m.livro.apostar({ clienteId: m.cliente, motor: m.motor, cotacao })
      m.atualizar()
    } catch (e) {
      setErro(e instanceof OrdemRecusada ? `${e.veredito.motivo}` : (e as Error).message)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <nav className="telas">
          <button className={tela === 'operar' ? 'on' : ''} onClick={() => setTela('operar')}>Operar</button>
          <button className={tela === 'casa' ? 'on' : ''} onClick={() => setTela('casa')}>Livro da casa</button>
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

      {tela === 'casa' ? (
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
          </aside>

          <main className="motor-centro">
            <div className="motor-preco">
              <b>{m.instrumento.nome}</b>
              <strong>{m.ultimo ? m.ultimo.preco.toFixed(m.instrumento.casas) : '—'}</strong>
              <span>tick {m.ultimo?.n ?? 0}</span>
            </div>
            <PriceChart candles={velas} mode="line" pipSize={m.instrumento.casas}
              symbolName={m.instrumento.nome} loading={velas.length === 0} />
            <div className="motor-fita">
              {digitos.map((d, i) => (
                <span key={i} className={`${pagam.includes(d) ? 'up' : 'down'} ${i === digitos.length - 1 ? 'agora' : ''}`}>{d}</span>
              ))}
            </div>
          </main>

          <aside className="motor-aposta">
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

            <label><span className="rot">Valor</span>
              <input type="number" min={0.35} step={0.5} value={valor}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setValor(Math.max(0.35, Number(e.target.value) || 0))} />
            </label>

            <label><span className="rot">Duração (ticks)</span>
              <input type="number" min={1} max={10} step={1} value={ticks}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setTicks(Math.min(10, Math.max(1, Math.round(Number(e.target.value) || 1))))} />
            </label>

            <div className="motor-cotacao">
              <div><span className="rot">Chance real</span><b>{(cotacao.probabilidade * 100).toFixed(0)}%</b></div>
              <div><span className="rot">Paga</span><b>{din(cotacao.pagamento)}</b></div>
              <div><span className="rot">Margem da casa</span><b>{(cotacao.margem * 100).toFixed(1)}%</b></div>
            </div>
            <p className="motor-regra">
              Ganha se o último dígito for <b>{regraEmPalavras(tipo, barreira)}</b>
            </p>

            <button className="motor-btn" onClick={apostar}
              disabled={!m.ultimo || m.saldo < valor}>
              Apostar {din(valor)}
            </button>
            {erro && <p className="motor-erro">{erro}</p>}

            <span className="rot" style={{ marginTop: 14 }}>Em aberto</span>
            {m.abertos.length === 0 && <p className="motor-vazio">Nada aberto.</p>}
            {m.abertos.map((c) => (
              <div key={c.id} className="motor-aberto">
                <b>{regraEmPalavras(c.tipo, c.barreira ?? undefined)}</b>
                <span>{din(c.valor)} → {din(c.pagamento)}</span>
                <em>liquida no tick {c.tickLiquidacao}</em>
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
