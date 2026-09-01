import { useState } from 'react'
import type { Instrumento, MotorDeTicks } from '../core/motor/ticks'

/**
 * As abas dos ativos abertos.
 *
 * Todos os instrumentos já rodavam ao mesmo tempo por dentro — o que
 * faltava era a tela admitir isso. Trocar de aba não abre mercado nenhum:
 * o motor do outro ativo nunca parou, então o preço que aparece é o de
 * agora e não o de quando você saiu.
 */

interface Props {
  abertos: string[]
  ativo: string
  instrumentos: Instrumento[]
  motores: Record<string, MotorDeTicks>
  aoTrocar: (codigo: string) => void
  aoFechar: (codigo: string) => void
  aoAbrir: (codigo: string) => void
}

/** Variação desde o começo da janela que temos em memória. */
export function variacao(motor?: MotorDeTicks): number | null {
  if (!motor) return null
  const h = motor.historico(240)
  if (h.length < 2) return null
  const de = h[0].preco
  return de === 0 ? null : (h[h.length - 1].preco - de) / de
}

const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(2)}%`

export function AbasDeAtivos({
  abertos, ativo, instrumentos, motores, aoTrocar, aoFechar, aoAbrir,
}: Props) {
  const [abrindo, setAbrindo] = useState(false)
  const disponiveis = instrumentos.filter((i) => !abertos.includes(i.codigo))

  return (
    <div className="abas-ativos">
      <div className="abas-lista">
        {abertos.map((codigo) => {
          const i = instrumentos.find((x) => x.codigo === codigo)
          const motor = motores[codigo]
          const preco = motor?.ultimo?.preco
          const v = variacao(motor)
          return (
            <div key={codigo} className={`aba-ativo ${codigo === ativo ? 'on' : ''}`}>
              <button className="aba-corpo" onClick={() => aoTrocar(codigo)}>
                <span className="aba-cod">{codigo}</span>
                <span className="aba-preco">
                  {preco != null ? preco.toFixed(i?.casas ?? 2) : '—'}
                </span>
                {v !== null && (
                  <span className={`aba-var ${v >= 0 ? 'up' : 'down'}`}>{pct(v)}</span>
                )}
              </button>
              {abertos.length > 1 && (
                <button className="aba-fechar" onClick={() => aoFechar(codigo)}
                  title={`Fechar ${codigo}`} aria-label={`Fechar ${codigo}`}>×</button>
              )}
            </div>
          )
        })}

        <div className="aba-mais">
          <button className={`aba-add ${abrindo ? 'on' : ''}`}
            onClick={() => setAbrindo((a) => !a)}
            disabled={disponiveis.length === 0}
            title="Abrir outro ativo">+</button>
          {abrindo && disponiveis.length > 0 && (
            <div className="aba-menu">
              {disponiveis.map((i) => (
                <button key={i.codigo} onClick={() => { aoAbrir(i.codigo); setAbrindo(false) }}>
                  <b>{i.codigo}</b>
                  <em>{i.nome}</em>
                  <i>{motores[i.codigo]?.ultimo?.preco.toFixed(i.casas) ?? '—'}</i>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
