import { useEffect, useState } from 'react'
import type { ConfigRobo, EstadoRobo, Robo } from '../core/motor/robo'
import { PARAMETROS } from '../core/motor/precos'

/**
 * Os robôs operando contra a casa própria.
 *
 * Um martingale é o padrão de aposta que quebra casa — entra pequeno quase
 * sempre e grande justamente quando a casa está perdendo. Ter os dois
 * rodando na mesma tela em que se vê a cobertura é o ponto: dá para
 * assistir a trava trabalhando contra a pior carga possível.
 *
 * AG7 e AG2 pagam nos mesmos 30% de chance, em lados opostos da faixa.
 * Rodando juntos, um cobre parte do outro no livro de cenários da casa —
 * que é exatamente o que a cobertura precisa para poder aceitar ordem.
 */

const din = (v: number) =>
  `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PainelRobos({ robos, aoMexer }: { robos: Robo[]; aoMexer: () => void }) {
  if (robos.length === 0) return null
  return (
    <section className="robos">
      <span className="rot">Robôs</span>
      {robos.map((r) => <Cartao key={r.estrategia.id} robo={r} aoMexer={aoMexer} />)}
    </section>
  )
}

function Cartao({ robo, aoMexer }: { robo: Robo; aoMexer: () => void }) {
  const [config, setConfig] = useState<ConfigRobo>({ ...robo.config })
  const [estado, setEstado] = useState<EstadoRobo | null>(null)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    setConfig({ ...robo.config })
    return robo.escutar((e) => { setEstado(e); aoMexer() })
  }, [robo, aoMexer])

  const mexer = (patch: Partial<ConfigRobo>) => {
    setConfig((c) => {
      const novo = { ...c, ...patch }
      robo.config = novo
      return novo
    })
  }

  const e = robo.estrategia
  const ligado = estado?.ligado ?? false
  const jogadas = (estado?.ganhos ?? 0) + (estado?.perdas ?? 0)
  const acerto = jogadas > 0 ? ((estado?.ganhos ?? 0) / jogadas) * 100 : null

  return (
    <div className={`robo ${ligado ? 'ligado' : ''}`}>
      <div className="robo-topo">
        <div className="robo-nome">
          <b>{e.nome}</b>
          <div className="robo-digitos">
            {[0,1,2,3,4,5,6,7,8,9].map((d) => (
              <i key={d} className={e.digitos.includes(d) ? 'paga' : ''}>{d}</i>
            ))}
          </div>
        </div>
        <button className={`robo-play ${ligado ? 'on' : ''}`}
          onClick={() => (ligado ? robo.desligar() : robo.ligar())}>
          {ligado ? 'Parar' : 'Operar'}
        </button>
      </div>

      {estado && estado.operacoes > 0 && (
        <div className="robo-numeros">
          <div><span>Resultado</span>
            <b className={estado.resultado >= 0 ? 'up' : 'down'}>{din(estado.resultado)}</b></div>
          <div><span>Operações</span><b>{estado.operacoes}</b></div>
          <div><span>Acerto</span><b>{acerto === null ? '—' : `${acerto.toFixed(0)}%`}</b></div>
          <div><span>Próxima</span>
            <b>{din(Math.min(estado.proximaEntrada, config.valorMaximo))}</b></div>
        </div>
      )}

      {estado && estado.perdasSeguidas > 0 && (
        <p className="robo-sequencia">
          {estado.perdasSeguidas} perda{estado.perdasSeguidas > 1 ? 's' : ''} seguida{estado.perdasSeguidas > 1 ? 's' : ''}
          {estado.perdasSeguidas >= config.galeApos
            ? ` · recuperando ${din(estado.prejuizoDaSequencia)}`
            : ' · ainda na entrada base'}
        </p>
      )}

      {estado && estado.recusadas > 0 && (
        <p className="robo-recusa">
          <b>{estado.recusadas} recusada(s).</b> {estado.ultimaRecusa}
        </p>
      )}

      {estado?.motivoDaParada && <p className="robo-parou">Parou: {estado.motivoDaParada}</p>}

      <button className="robo-mais" onClick={() => setAberto((v) => !v)}>
        {aberto ? 'esconder gestão' : 'gestão'}
      </button>

      {aberto && (
        <div className="robo-campos">
          <label><span>Entrada</span>
            <input type="number" min={PARAMETROS.valorMinimo} step={0.1} value={config.valorBase}
              onFocus={(ev) => ev.currentTarget.select()}
              onChange={(ev) => mexer({ valorBase: Math.max(PARAMETROS.valorMinimo, Number(ev.target.value) || 0) })} />
          </label>
          <label><span>Gale após</span>
            <input type="number" min={1} max={20} step={1} value={config.galeApos}
              onFocus={(ev) => ev.currentTarget.select()}
              onChange={(ev) => mexer({ galeApos: Math.max(1, Math.round(Number(ev.target.value) || 1)) })} />
          </label>
          <label><span>Fator</span>
            <input type="number" min={0} max={3} step={0.1} value={config.fatorGale}
              onFocus={(ev) => ev.currentTarget.select()}
              onChange={(ev) => mexer({ fatorGale: Math.max(0, Number(ev.target.value) || 0) })} />
          </label>
          <label><span>Teto</span>
            <input type="number" min={1} step={10} value={config.valorMaximo}
              onFocus={(ev) => ev.currentTarget.select()}
              onChange={(ev) => mexer({ valorMaximo: Math.max(1, Number(ev.target.value) || 1) })} />
          </label>
        </div>
      )}
    </div>
  )
}
