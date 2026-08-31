import { useEffect, useRef, useState } from 'react'
import type { TradingAccount } from '../core/deriv/account'
import { BalanceLive } from './BalanceLive'
import { AFILIADO } from '../core/deriv/config'
import { DerivNome } from './DerivMarca'

interface Props {
  contas: TradingAccount[]
  selecionada: string | null
  isDemo: boolean
  saldo: number | null
  moeda: string
  conectando: boolean
  onTrocar: (id: string) => void
  onRecarregar: () => void
  onSair: () => void
}

/**
 * Troca de conta.
 *
 * O gatilho fica discreto — é a barra do topo, não o assunto da tela — mas
 * demo e real nunca se confundem: a conta real ganha um traço vermelho na
 * lateral e a etiqueta muda. O número da conta sai do gatilho e vai para o
 * menu, onde tem espaço e faz falta.
 */
export function AccountSwitcher(props: Props) {
  const { contas, selecionada, isDemo, saldo, moeda, conectando, onTrocar, onRecarregar, onSair } = props
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  return (
    <div className="conta" ref={caixa}>
      <button
        className={`conta-chip ${isDemo ? 'demo' : 'real'} ${aberto ? 'aberto' : ''}`}
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="menu"
      >
        <span className={`selo ${isDemo ? 'demo' : 'real'}`}>{isDemo ? 'Demo' : 'Real'}</span>
        <BalanceLive valor={saldo} moeda={moeda} conectando={conectando} />
        <svg className="conta-seta" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
          <path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto && (
        <div className="menu" role="menu">
          <p className="menu-titulo">Suas contas na Deriv</p>

          {contas.map((c) => {
            const demo = c.type === 'demo'
            const ativa = c.accountId === selecionada
            return (
              <button
                key={c.accountId}
                role="menuitem"
                className={`menu-conta ${ativa ? 'ativa' : ''} ${demo ? 'demo' : 'real'}`}
                onClick={() => { onTrocar(c.accountId); setAberto(false) }}
              >
                <span className={`selo ${demo ? 'demo' : 'real'}`}>{demo ? 'Demo' : 'Real'}</span>
                <span className="menu-conta-info">
                  <b>{demo ? 'Dinheiro fictício' : 'Dinheiro real'}</b>
                  <em>{c.accountId}</em>
                </span>
                <span className="menu-conta-saldo">
                  {c.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  <i>{c.currency}</i>
                </span>
                <span className="menu-conta-marca" aria-hidden="true">
                  {ativa && (
                    <svg viewBox="0 0 12 12" width="13" height="13">
                      <path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor"
                        strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </button>
            )
          })}

          <div className="menu-linha" />

          {isDemo && (
            <button className="menu-acao" role="menuitem"
              onClick={() => { onRecarregar(); setAberto(false) }}>
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"
                fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.5 8a5.5 5.5 0 1 1-1.7-3.9" /><path d="M13.5 2v3h-3" />
              </svg>
              Recarregar saldo demo
            </button>
          )}

          <a className="menu-acao" role="menuitem" href={AFILIADO}
            target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
            Abrir outra conta na <DerivNome tamanho={12.5} />
          </a>

          <button className="menu-acao perigo" role="menuitem" onClick={onSair}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 13.5h-3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3" />
              <path d="M10 11l3-3-3-3M13 8H6" />
            </svg>
            Desconectar a <DerivNome tamanho={12.5} />
          </button>
        </div>
      )}
    </div>
  )
}
