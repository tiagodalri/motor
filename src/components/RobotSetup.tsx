import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConfigEstrategia } from '../core/deriv/engine'
import type { Identidade } from '../core/deriv/branding'
import type { ActiveSymbol } from '../core/deriv/types'
import { Emblema } from './RobotCard'

/**
 * Preparo do robo, uma pergunta por vez.
 *
 * A configuracao so aparece na hora de ligar: fora daqui a tela inteira e
 * da operacao. As respostas ficam guardadas para a proxima vez.
 */

interface Props {
  identidade: Identidade
  nomeEstrategia: string
  symbols: ActiveSymbol[]
  symbolInicial: string
  configInicial: ConfigEstrategia
  moeda: string
  isDemo: boolean
  onCancelar: () => void
  onLigar: (cfg: ConfigEstrategia, symbol: string) => void
}

const CHAVE = 'teeds.robo.preparo'

const din = (v: number, m = 'USD') =>
  `${m} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function lerPreparo(): { cfg?: Partial<ConfigEstrategia>; symbol?: string } {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || '{}')
  } catch {
    return {}
  }
}

function guardarPreparo(cfg: ConfigEstrategia, symbol: string) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ cfg, symbol }))
  } catch {
    /* sem armazenamento: na proxima vez os valores voltam ao padrao */
  }
}

/* ------------------------------------------------------------ campo numero */

function Numero({
  valor, aoMudar, sufixo, passo = 0.05, minimo = 0, maximo = Infinity, auto,
}: {
  valor: number
  aoMudar: (n: number) => void
  sufixo?: string
  passo?: number
  minimo?: number
  maximo?: number
  auto?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (auto) ref.current?.select() }, [auto])
  return (
    <div className="qz-campo">
      <input
        ref={ref} type="number" inputMode="decimal" step={passo}
        min={minimo} max={Number.isFinite(maximo) ? maximo : undefined}
        value={valor}
        // Sem isto, clicar no campo deixa o valor antigo e o que a pessoa
        // digita e inserido no meio dele: 10 vira 1080000.
        onFocus={(e) => e.currentTarget.select()}
        onMouseUp={(e) => e.preventDefault()}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isFinite(n)) return
          aoMudar(Math.min(maximo, Math.max(minimo, n)))
        }}
      />
      {sufixo && <span>{sufixo}</span>}
    </div>
  )
}

/**
 * Limites de sanidade para o que volta do navegador.
 *
 * Um valor fora da faixa quase sempre e erro de digitacao, e um freio
 * gigante e o mesmo que freio nenhum — entao esses voltam para o padrao
 * em vez de serem só aparados.
 */
const FAIXAS: Record<keyof ConfigEstrategia, [number, number]> = {
  valorInicial: [0.35, 10_000],
  valorAoVencer: [0.35, 10_000],
  fatorGale: [0, 3],
  galeApos: [1, 20],
  valorMaximo: [0.35, 50_000],
  takeProfit: [0, 10_000],
  stopLoss: [0, 10_000],
  maxOperacoes: [1, 5_000],
}

function sanear(cfg: ConfigEstrategia, padrao: ConfigEstrategia): ConfigEstrategia {
  const limpo = { ...cfg }
  for (const chave of Object.keys(FAIXAS) as Array<keyof ConfigEstrategia>) {
    const [min, max] = FAIXAS[chave]
    const v = Number(limpo[chave])
    if (!Number.isFinite(v) || v < min || v > max) limpo[chave] = padrao[chave]
  }
  if (limpo.valorMaximo < limpo.valorAoVencer) limpo.valorMaximo = limpo.valorAoVencer
  return limpo
}

/* ------------------------------------------------------------- assistente */

export function RobotSetup({
  identidade, nomeEstrategia, symbols, symbolInicial, configInicial,
  moeda, isDemo, onCancelar, onLigar,
}: Props) {
  const guardado = useMemo(lerPreparo, [])
  const [cfg, setCfg] = useState<ConfigEstrategia>(
    sanear({ ...configInicial, ...guardado.cfg }, configInicial),
  )
  const [symbol, setSymbol] = useState(
    symbols.some((s) => s.symbol === guardado.symbol) ? guardado.symbol! : symbolInicial,
  )
  const [passo, setPasso] = useState(0)
  const [confirmaReal, setConfirmaReal] = useState(false)

  const abertos = symbols.filter((s) => s.isOpen)
  const nomeAtivo = symbols.find((s) => s.symbol === symbol)?.name ?? symbol
  const muda = (p: Partial<ConfigEstrategia>) => setCfg((c) => ({ ...c, ...p }))

  const passos = [
    {
      chave: 'ativo',
      titulo: 'Onde ele vai operar?',
      ajuda: 'Cada índice tem seu próprio ritmo. Os de 1 segundo dão um dígito novo por segundo.',
      valido: !!symbol,
      corpo: (
        <div className="qz-opcoes">
          {abertos.map((s) => (
            <button key={s.symbol}
              className={`qz-opcao ${symbol === s.symbol ? 'on' : ''}`}
              onClick={() => { setSymbol(s.symbol); setPasso(1) }}>
              {s.name.replace(' Index', '')}
            </button>
          ))}
        </div>
      ),
    },
    {
      chave: 'valor',
      titulo: 'Quanto vale cada entrada?',
      ajuda: `O mínimo da Deriv é ${din(0.35, moeda)}. É o valor de partida — e o valor para o qual ele volta toda vez que ganha.`,
      valido: cfg.valorAoVencer >= 0.35,
      corpo: (
        <>
          <Numero auto valor={cfg.valorAoVencer} sufixo={moeda} minimo={0.35} maximo={10_000}
            aoMudar={(n) => muda({ valorAoVencer: n, valorInicial: n })} />
          <div className="qz-atalhos">
            {[0.35, 1, 2, 5].map((v) => (
              <button key={v} className={cfg.valorAoVencer === v ? 'on' : ''}
                onClick={() => muda({ valorAoVencer: v, valorInicial: v })}>
                {din(v, '')}
              </button>
            ))}
          </div>
        </>
      ),
    },
    {
      chave: 'gale',
      titulo: 'Quando ele deve tentar recuperar?',
      ajuda: `Ele entra em todas as operações. Até ${cfg.galeApos} ${cfg.galeApos === 1 ? 'perda seguida' : 'perdas seguidas'} a entrada continua no valor base; a partir daí o martingale soma o prejuízo da sequência à próxima entrada. O fator diz quanto desse prejuízo ele persegue de uma vez.`,
      valido: cfg.valorMaximo >= cfg.valorAoVencer,
      corpo: (
        <>
          <div className="qz-atalhos largo">
            <button className={cfg.fatorGale === 0 ? 'on' : ''} onClick={() => muda({ fatorGale: 0 })}>
              Nunca aumentar
            </button>
            <button className={cfg.fatorGale === 0.7 ? 'on' : ''} onClick={() => muda({ fatorGale: 0.7 })}>
              Suave (0,7)
            </button>
            <button className={cfg.fatorGale === 1 ? 'on' : ''} onClick={() => muda({ fatorGale: 1 })}>
              Cheio (1,0)
            </button>
          </div>
          <div className="qz-dupla">
            <label>
              <span className="rot">Fator</span>
              <Numero valor={cfg.fatorGale} passo={0.1} maximo={3}
                aoMudar={(n) => muda({ fatorGale: n })} />
            </label>
            <label>
              <span className="rot">Ligar após quantas perdas</span>
              <Numero valor={cfg.galeApos} passo={1} minimo={1} maximo={20}
                aoMudar={(n) => muda({ galeApos: Math.round(n) })} />
            </label>
            <label>
              <span className="rot">Entrada máxima</span>
              <Numero valor={cfg.valorMaximo} passo={1} minimo={cfg.valorAoVencer} maximo={50_000}
                sufixo={moeda} aoMudar={(n) => muda({ valorMaximo: n })} />
            </label>
          </div>
          {cfg.valorMaximo < cfg.valorAoVencer && (
            <p className="qz-erro">A entrada máxima não pode ser menor que o valor da entrada.</p>
          )}
        </>
      ),
    },
    {
      chave: 'freios',
      titulo: 'Quando ele deve parar sozinho?',
      ajuda: 'Os dois freios contam o resultado da sessão. Ele desliga assim que qualquer um for atingido.',
      valido: true,
      corpo: (
        <div className="qz-dupla">
          <label>
            <span className="rot">Parar se ganhar</span>
            <Numero auto valor={cfg.takeProfit} passo={1} sufixo={moeda} maximo={10_000}
              aoMudar={(n) => muda({ takeProfit: n })} />
          </label>
          <label>
            <span className="rot">Parar se perder</span>
            <Numero valor={cfg.stopLoss} passo={1} sufixo={moeda} maximo={10_000}
              aoMudar={(n) => muda({ stopLoss: n })} />
          </label>
          <label>
            <span className="rot">Máximo de operações</span>
            <Numero valor={cfg.maxOperacoes} passo={10} minimo={1} maximo={5_000}
              aoMudar={(n) => muda({ maxOperacoes: Math.round(n) })} />
          </label>
        </div>
      ),
    },
    {
      chave: 'conferir',
      titulo: 'Tudo certo?',
      ajuda: 'Confira antes de soltar o robô. Dá para voltar e mudar qualquer coisa.',
      valido: true,
      corpo: (
        <>
          <dl className="qz-resumo">
            <div><dt>Ativo</dt><dd>{nomeAtivo}</dd></div>
            <div><dt>Entrada</dt><dd>{din(cfg.valorAoVencer, moeda)}</dd></div>
            <div><dt>Entradas</dt><dd>em todas as operações</dd></div>
            <div>
              <dt>Martingale</dt>
              <dd>
                {cfg.fatorGale === 0
                  ? 'desligado — entrada sempre igual'
                  : `liga na ${cfg.galeApos}ª perda seguida, recuperando ${(cfg.fatorGale * 100).toFixed(0)}%, até ${din(cfg.valorMaximo, moeda)}`}
              </dd>
            </div>
            <div><dt>Para se ganhar</dt><dd>{din(cfg.takeProfit, moeda)}</dd></div>
            <div><dt>Para se perder</dt><dd>{din(cfg.stopLoss, moeda)}</dd></div>
            <div><dt>Máximo de operações</dt><dd>{cfg.maxOperacoes}</dd></div>
          </dl>
          {!isDemo && (
            <p className="qz-alerta">
              Esta é a sua <strong>conta real</strong>. O robô vai operar com dinheiro de verdade.
            </p>
          )}
        </>
      ),
    },
  ]

  const atual = passos[passo]
  const ultimo = passo === passos.length - 1

  function avancar() {
    if (!atual.valido) return
    if (!ultimo) { setPasso(passo + 1); return }
    if (!isDemo && !confirmaReal) { setConfirmaReal(true); return }
    guardarPreparo(cfg, symbol)
    onLigar(cfg, symbol)
  }

  // teclado: Enter avanca, Esc desiste
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancelar(); return }
      if (e.key === 'Enter') { e.preventDefault(); avancar() }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  })

  return (
    <div className="qz-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancelar() }}>
      <div className="qz" style={{ ['--robo' as any]: identidade.cor, ['--robo-suave' as any]: identidade.corSuave }}
        role="dialog" aria-modal="true" aria-label={`Preparar ${nomeEstrategia}`}>

        <header className="qz-topo">
          <Emblema id={identidade} tamanho={34} />
          <div>
            <b>{nomeEstrategia}</b>
            <span>preparando para operar</span>
          </div>
          <button className="qz-fechar" onClick={onCancelar} aria-label="Fechar">×</button>
        </header>

        <div className="qz-passos" aria-hidden="true">
          {passos.map((p, i) => (
            <i key={p.chave} className={i < passo ? 'feito' : i === passo ? 'agora' : ''} />
          ))}
        </div>

        <div className="qz-corpo" key={atual.chave}>
          <span className="qz-conta">Passo {passo + 1} de {passos.length}</span>
          <h3>{atual.titulo}</h3>
          <p className="qz-ajuda">{atual.ajuda}</p>
          {atual.corpo}
        </div>

        <footer className="qz-rodape">
          <button className="qz-voltar" disabled={passo === 0} onClick={() => setPasso(passo - 1)}>
            Voltar
          </button>
          <button className={`qz-seguir ${confirmaReal ? 'confirmar' : ''}`}
            disabled={!atual.valido} onClick={avancar}>
            {ultimo
              ? (confirmaReal ? 'Confirmar com dinheiro real' : `Ligar ${nomeEstrategia}`)
              : 'Continuar'}
          </button>
        </footer>
      </div>
    </div>
  )
}
