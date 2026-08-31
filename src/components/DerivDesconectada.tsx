import { AFILIADO } from '../core/deriv/config'
import { DerivNome, IconeElo } from './DerivMarca'

interface Props {
  /** O que a pessoa estava tentando fazer, para o texto falar disso. */
  acao: string
  entrando: boolean
  onConectar: () => void
  /** Compacto cabe dentro de um painel; solto ocupa a tela. */
  compacto?: boolean
}

/**
 * Estado de "logado na Teeds, sem corretora conectada".
 *
 * A plataforma abre sem a Deriv — gráfico, dígitos e ativos são dados
 * públicos. O que falta é a conta onde o dinheiro fica.
 */
export function DerivDesconectada({ acao, entrando, onConectar, compacto = false }: Props) {
  return (
    <div className={`sem-deriv ${compacto ? 'compacto' : ''}`}>
      <div className="sem-deriv-icone" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="34" height="34" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 24 L11 29 a6 6 0 0 1-8-8 l5-5" />
          <path d="M24 16 l5-5 a6 6 0 0 1 8 8 l-5 5" />
          <path d="M15 25 l10-10" strokeDasharray="3 4" />
        </svg>
      </div>
      <b>Conecte a sua conta da <DerivNome tamanho={17} /></b>
      <p>
        {acao} Você está na Teeds, mas o dinheiro fica na corretora — e é
        preciso ligar as duas.
      </p>
      <div className="sem-deriv-acoes">
        <button className="btn-deriv" onClick={onConectar} disabled={entrando}>
          <IconeElo />
          {entrando ? 'Abrindo…' : <>Conectar minha <DerivNome tamanho={13.5} /></>}
        </button>
        <a href={AFILIADO} target="_blank" rel="noopener noreferrer">Ainda não tenho conta</a>
      </div>
    </div>
  )
}
