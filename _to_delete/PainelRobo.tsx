import { useEffect, useState } from 'react'
import { AG7_PADRAO, type ConfigRobo, type EstadoRobo, type RoboAG7 } from '../core/motor/robo'
import { PARAMETROS } from '../core/motor/precos'

/**
 * O AG7 operando contra a casa própria.
 *
 * Não é enfeite: um martingale é o padrão de aposta que quebra casa —
 * entra pequeno quase sempre e grande justamente quando a casa está
 * perdendo. É o teste mais duro que existe para a cobertura, e agora dá
 * para ver os dois lados na mesma tela.
 */

const din = (v: number) =>
  `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Props {
  /** Criado e mantido pelo hook, não por esta tela: ele sobrevive à troca de aba. */
  robo: RoboAG7 | null
  aoMexer: () => void
}

export function PainelRobo({ robo, aoMexer }: Props) {
  const [config, setConfig] = useState<ConfigRobo>({ ...AG7_PADRAO })
  const [estado, setEstado] = useState<EstadoRobo | null>(null)

  useEffect(() => {
    if (!robo) return
    setConfig({ ...robo.config })
    return robo.escutar((e) => { setEstado(e); aoMexer() })
  }, [robo, aoMexer])

  const mexer = (patch: Partial<ConfigRobo>) => {
    setConfig((c) => {
      const novo = { ...c, ...patch }
      if (robo) robo.config = novo
      return novo
    })
  }

  const ligado = estado?.ligado ?? false
  const acertos = estado && estado.operacoes > 0
    ? (estado.ganhos / (estado.ganhos + estado.perdas || 1)) * 100 : 0

  return (
    <section className="robo">
      <div className="robo-topo">
        <div>
          <b>AG7</b>
          <em>dígito acima de {config.barreira} · 1 tick</em>
        </div>
        <button className={`robo-play ${ligado ? 'on' : ''}`}
          disabled={!robo}
          onClick={() => {
            if (!robo) return
            if (ligado) robo.desligar()
            else robo.ligar()
          }}>
          {ligado ? 'Parar' : 'Operar'}
        </button>
      </div>

      <div className="robo-campos">
        <label><span>Entrada</span>
          <input type="number" min={PARAMETROS.valorMinimo} step={0.1} value={config.valorBase}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => mexer({ valorBase: Math.max(PARAMETROS.valorMinimo, Number(e.target.value) || 0) })} />
        </label>
        <label><span>Gale após</span>
          <input type="number" min={1} max={20} step={1} value={config.galeApos}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => mexer({ galeApos: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
        </label>
        <label><span>Fator</span>
          <input type="number" min={0} max={3} step={0.1} value={config.fatorGale}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => mexer({ fatorGale: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
        <label><span>Teto</span>
          <input type="number" min={1} step={10} value={config.valorMaximo}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => mexer({ valorMaximo: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
      </div>

      {estado && (
        <>
          <div className="robo-numeros">
            <div>
              <span>Resultado</span>
              <b className={estado.resultado >= 0 ? 'up' : 'down'}>{din(estado.resultado)}</b>
            </div>
            <div>
              <span>Operações</span>
              <b>{estado.operacoes}</b>
            </div>
            <div>
              <span>Acerto</span>
              <b>{estado.operacoes > 0 ? `${acertos.toFixed(0)}%` : '—'}</b>
            </div>
            <div>
              <span>Próxima</span>
              <b>{din(Math.min(estado.proximaEntrada, config.valorMaximo))}</b>
            </div>
          </div>

          {estado.perdasSeguidas > 0 && (
            <p className="robo-sequencia">
              {estado.perdasSeguidas} perda{estado.perdasSeguidas > 1 ? 's' : ''} seguida{estado.perdasSeguidas > 1 ? 's' : ''}
              {estado.perdasSeguidas >= config.galeApos
                ? ` · recuperando ${din(estado.prejuizoDaSequencia)}`
                : ` · ainda na entrada base`}
            </p>
          )}

          {estado.recusadas > 0 && (
            <p className="robo-recusa">
              <b>{estado.recusadas} ordem(ns) recusada(s) pela casa.</b>{' '}
              {estado.ultimaRecusa}
            </p>
          )}

          {estado.motivoDaParada && (
            <p className="robo-parou">Parou: {estado.motivoDaParada}</p>
          )}
        </>
      )}
    </section>
  )
}
