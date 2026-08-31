import { useEffect, useRef, useState } from 'react'
import type { Usuario } from '../core/teeds/conta'

interface Props {
  usuario: Usuario
  onSair: () => void
  onPerfil: () => void
}

/** Iniciais do nome — duas no máximo, que é o que cabe num círculo pequeno. */
function iniciais(nome: string, email: string): string {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (partes.length >= 2) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (email[0] ?? '?').toUpperCase()
}

/** A conta da Teeds — a da plataforma, não a da corretora. */
export function UserMenu({ usuario, onSair, onPerfil }: Props) {
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

  const primeiro = (usuario.nome || usuario.email).split(' ')[0]

  return (
    <div className="conta" ref={caixa}>
      <button className={`avatar-botao ${aberto ? 'aberto' : ''}`}
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto} aria-haspopup="menu"
        title={usuario.email}>
        <span className="avatar">{iniciais(usuario.nome ?? '', usuario.email)}</span>
        <svg className="conta-seta" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
          <path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto && (
        <div className="menu menu-curto" role="menu">
          <button className="menu-eu" role="menuitem"
            onClick={() => { setAberto(false); onPerfil() }}>
            <span className="avatar grande">{iniciais(usuario.nome ?? '', usuario.email)}</span>
            <div>
              <b>{usuario.nome || primeiro}</b>
              <em>{usuario.email}</em>
            </div>
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className="menu-eu-seta">
              <path d="M4.5 2.5 L8 6 L4.5 9.5" fill="none" stroke="currentColor"
                strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="menu-linha" />

          <button className="menu-acao" role="menuitem"
            onClick={() => { setAberto(false); onPerfil() }}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="5.5" r="2.5" /><path d="M2.8 13.5a5.2 5.2 0 0 1 10.4 0" />
            </svg>
            Minha conta
          </button>

          <button className="menu-acao perigo" role="menuitem" onClick={onSair}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 13.5h-3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3" />
              <path d="M10 11l3-3-3-3M13 8H6" />
            </svg>
            Sair da Teeds
          </button>
        </div>
      )}
    </div>
  )
}
