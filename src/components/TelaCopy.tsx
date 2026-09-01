import { useEffect, useMemo, useState } from 'react'
import { PERFIS, historicoDemo, type HistoricoDemo, type Perfil } from '../core/motor/estrategias'
import type { Copiador, ConfigCopia, EstadoCopia } from '../core/motor/copiar'
import type { Robo } from '../core/motor/robo'
import { PARAMETROS } from '../core/motor/precos'

/**
 * Copy trade.
 *
 * A tela tem duas metades que precisam ficar distintas o tempo todo:
 *
 *  - o **histórico de seis meses**, que é gerado para a vitrine ter
 *    conteúdo e está marcado como simulado em todo lugar onde aparece;
 *  - o que acontece **quando você copia**, que é real: a estratégia opera
 *    contra o livro da casa, e cada ordem aceita é espelhada na sua conta
 *    com contrato, liquidação e razão como qualquer outra.
 *
 * Misturar as duas seria transformar uma maquete numa promessa de
 * rentabilidade, que é outra coisa inteiramente.
 */

const din = (v: number) =>
  `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`

interface Props {
  traders: Record<string, Robo>
  copiadores: Record<string, Copiador>
  saldo: number
  aoMexer: () => void
}

export function TelaCopy({ traders, copiadores, saldo, aoMexer }: Props) {
  const [aberto, setAberto] = useState<string | null>(null)
  const [ordem, setOrdem] = useState<'retorno' | 'risco' | 'seguidores'>('retorno')
  const [, setEco] = useState(0)

  const historicos = useMemo(() => {
    const mapa: Record<string, HistoricoDemo> = {}
    for (const p of PERFIS) mapa[p.id] = historicoDemo(p)
    return mapa
  }, [])

  // enquanto esta tela está aberta, as estratégias operam de verdade — é o
  // que faz o "copiar" ter o que espelhar
  useEffect(() => {
    const meus = Object.values(traders)
    meus.forEach((t) => t.ligar())
    const soltar = meus.map((t) => t.escutar(() => setEco((n) => n + 1)))
    return () => {
      soltar.forEach((f) => f())
      meus.forEach((t) => {
        const copiando = copiadores[t.estrategia.id]?.instantaneo.copiando
        if (!copiando) t.desligar()
      })
    }
  }, [traders, copiadores])

  const ordenados = useMemo(() => {
    const nivel = { baixo: 0, 'médio': 1, alto: 2 } as const
    return [...PERFIS].sort((a, b) => {
      if (ordem === 'seguidores') return b.seguidores - a.seguidores
      if (ordem === 'risco') return nivel[a.risco] - nivel[b.risco]
      return historicos[b.id].retorno - historicos[a.id].retorno
    })
  }, [ordem, historicos])

  return (
    <div className="copy">
      <div className="copy-topo">
        <div>
          <h2>Copy trade</h2>
          <p>
            Vincule sua conta a uma estratégia. Cada ordem que ela abrir é aberta na sua
            conta também, dimensionada pelo valor que você alocar.
          </p>
        </div>
        <div className="copy-ordem">
          <span className="rot">Ordenar por</span>
          <div>
            {([['retorno', 'Retorno'], ['risco', 'Risco'], ['seguidores', 'Seguidores']] as const)
              .map(([id, nome]) => (
                <button key={id} className={ordem === id ? 'on' : ''} onClick={() => setOrdem(id)}>
                  {nome}
                </button>
              ))}
          </div>
        </div>
      </div>

      <div className="copy-aviso">
        <b>Histórico de vitrine, gerado para esta maquete.</b> Os seis meses de resultado
        abaixo não aconteceram — são números criados para a tela ter conteúdo enquanto não
        existem traders reais operando por seis meses. O que é real é o que acontece
        depois que você copia: aí a estratégia opera contra o livro da casa de verdade.
      </div>

      <div className="copy-lista">
        {ordenados.map((p) => (
          <Cartao key={p.id} perfil={p} historico={historicos[p.id]}
            trader={traders[p.id]} copiador={copiadores[p.id]}
            saldo={saldo} aoMexer={aoMexer}
            aberto={aberto === p.id}
            aoAbrir={() => setAberto((a) => (a === p.id ? null : p.id))} />
        ))}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- cartão */

function Cartao({ perfil, historico, trader, copiador, saldo, aoMexer, aberto, aoAbrir }: {
  perfil: Perfil; historico: HistoricoDemo
  trader?: Robo; copiador?: Copiador
  saldo: number; aoMexer: () => void
  aberto: boolean; aoAbrir: () => void
}) {
  const [estado, setEstado] = useState<EstadoCopia | null>(null)
  const [config, setConfig] = useState<ConfigCopia>(
    () => copiador?.config ?? {
      alocado: 100, modo: 'proporcional', valorFixo: 0.3, tetoPorOperacao: 20, stopLoss: 0,
    },
  )

  useEffect(() => {
    if (!copiador) return
    return copiador.escutar((e) => { setEstado(e); aoMexer() })
  }, [copiador, aoMexer])

  const copiando = estado?.copiando ?? false
  const positivo = historico.resultado >= 0

  const mexer = (patch: Partial<ConfigCopia>) => {
    setConfig((c) => {
      const novo = { ...c, ...patch }
      if (copiador) copiador.config = novo
      return novo
    })
  }

  function alternar() {
    if (!copiador || !trader) return
    if (copiando) {
      copiador.parar()
    } else {
      trader.ligar()
      copiador.seguir(trader.sinais, perfil.nome)
    }
    aoMexer()
  }

  return (
    <article className={`copy-cartao ${copiando ? 'copiando' : ''}`}>
      <header>
        <div className="copy-id">
          <div className="copy-avatar" data-risco={perfil.risco}>{perfil.nome.slice(0, 2)}</div>
          <div>
            <b>{perfil.nome}</b>
            <em>{perfil.autor} · {perfil.instrumento} · {perfil.modalidade}</em>
          </div>
        </div>
        <div className="copy-retorno">
          <strong className={positivo ? 'up' : 'down'}>{pct(historico.retorno)}</strong>
          <span>6 meses</span>
        </div>
      </header>

      <Curva curva={historico.curva} positivo={positivo} />

      <div className="copy-numeros">
        <div><span>Resultado</span><b className={positivo ? 'up' : 'down'}>{din(historico.resultado)}</b></div>
        <div><span>Acerto</span><b>{(historico.acerto * 100).toFixed(1)}%</b></div>
        <div><span>Operações</span><b>{historico.operacoes.toLocaleString('pt-BR')}</b></div>
        <div><span>Pior queda</span><b className="down">{din(-historico.piorQueda)}</b></div>
        <div><span>Dias no azul</span><b>{Math.round((historico.diasPositivos / historico.dias.length) * 100)}%</b></div>
        <div><span>Seguidores</span><b>{perfil.seguidores.toLocaleString('pt-BR')}</b></div>
      </div>

      <div className="copy-meses">
        {historico.meses.map((mes) => {
          const escala = Math.max(...historico.meses.map((x) => Math.abs(x.resultado)), 1)
          const alt = Math.max(4, (Math.abs(mes.resultado) / escala) * 34)
          return (
            <div key={mes.mes} title={`${mes.rotulo}: ${din(mes.resultado)}`}>
              <i className={mes.resultado >= 0 ? 'up' : 'down'} style={{ height: alt }} />
              <span>{mes.rotulo}</span>
            </div>
          )
        })}
      </div>

      <p className="copy-desc">{perfil.descricao}</p>
      <p className="copy-gestao">
        <span className={`copy-risco ${perfil.risco}`}>risco {perfil.risco}</span>
        {perfil.gestao}
      </p>

      {copiando && estado && (
        <div className="copy-ativo">
          <div><span>Copiadas</span><b>{estado.copiadas}</b></div>
          <div><span>Resultado</span>
            <b className={estado.resultado >= 0 ? 'up' : 'down'}>{din(estado.resultado)}</b></div>
          <div><span>Recusadas</span><b>{estado.recusadas}</b></div>
          <div><span>Sem saldo</span><b>{estado.ignoradas}</b></div>
        </div>
      )}

      {copiando && estado?.ultimaRecusa && (
        <p className="copy-recusa">
          A casa recusou a última cópia — {estado.ultimaRecusa}
        </p>
      )}

      <div className="copy-acoes">
        <button className={`copy-btn ${copiando ? 'parar' : ''}`} onClick={alternar}
          disabled={!copiador || !trader || (!copiando && saldo < PARAMETROS.valorMinimo)}>
          {copiando ? 'Parar de copiar' : 'Copiar esta estratégia'}
        </button>
        <button className="copy-config" onClick={aoAbrir}>
          {aberto ? 'fechar' : 'quanto alocar'}
        </button>
      </div>

      {aberto && (
        <div className="copy-form">
          <label><span>Alocado</span>
            <input type="number" min={1} step={10} value={config.alocado}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => mexer({ alocado: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <label><span>Teto por operação</span>
            <input type="number" min={PARAMETROS.valorMinimo} step={1} value={config.tetoPorOperacao}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => mexer({ tetoPorOperacao: Math.max(PARAMETROS.valorMinimo, Number(e.target.value) || 0) })} />
          </label>
          <label><span>Parar se perder</span>
            <input type="number" min={0} step={10} value={config.stopLoss}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => mexer({ stopLoss: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <div className="copy-modo">
            <span>Como dimensionar</span>
            <div>
              <button className={config.modo === 'proporcional' ? 'on' : ''}
                onClick={() => mexer({ modo: 'proporcional' })}>Proporcional</button>
              <button className={config.modo === 'fixo' ? 'on' : ''}
                onClick={() => mexer({ modo: 'fixo' })}>Valor fixo</button>
            </div>
          </div>
          <p className="copy-nota">
            {config.modo === 'proporcional'
              ? 'Copia na mesma proporção da banca do trader: alocar metade do que ele tem significa correr metade do risco dele — inclusive nas recuperações.'
              : 'Todo sinal vira o mesmo valor. Mais previsível, mas descaracteriza gale: numa estratégia de recuperação você copia a direção, não o método.'}
          </p>
        </div>
      )}
    </article>
  )
}

/* ---------------------------------------------------------------- curva */

function Curva({ curva, positivo }: { curva: number[]; positivo: boolean }) {
  const l = 100
  const a = 40
  const min = Math.min(...curva, 0)
  const max = Math.max(...curva, 0)
  const faixa = max - min || 1
  const px = (i: number) => (i / Math.max(1, curva.length - 1)) * l
  const py = (v: number) => a - ((v - min) / faixa) * a
  const linha = curva.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(2)},${py(v).toFixed(2)}`).join(' ')
  const area = `${linha} L${l},${py(min).toFixed(2)} L0,${py(min).toFixed(2)} Z`
  const zero = py(0)
  const cor = positivo ? 'var(--up)' : 'var(--down)'

  return (
    <svg className="copy-curva" viewBox={`0 0 ${l} ${a}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1={zero} x2={l} y2={zero} stroke="var(--border)" strokeWidth="0.4" />
      <path d={area} fill={cor} opacity="0.12" />
      <path d={linha} fill="none" stroke={cor} strokeWidth="0.9"
        vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
