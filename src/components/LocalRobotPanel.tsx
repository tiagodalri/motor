import { useEffect, useRef, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import { MotorTeeds, type ConfigEstrategia, type EstadoMotor } from '../core/deriv/engine'
import { ESTRATEGIAS_LOCAIS } from '../core/deriv/strategies'
import type { ActiveSymbol } from '../core/deriv/types'
import { RobotLive } from './RobotLive'
import { RobotSetup, lerPreparo } from './RobotSetup'
import { Emblema } from './RobotCard'
import type { Identidade } from '../core/deriv/branding'

interface Props {
  socket: TeedsSocket | null
  isDemo: boolean
  moeda: string
  symbols: ActiveSymbol[]
  symbolPadrao: string | null
  identidade: Identidade
  /** Estado da conexao autenticada. */
  conexao?: string
  /** Fecha este bloco. Ausente quando so ha um robo na tela. */
  onRemover?: () => void
  /** Como este bloco se chama: "Robô 1", "Robô 2"... */
  titulo: string
}

const PADRAO: ConfigEstrategia = {
  valorInicial: 0.35,
  valorAoVencer: 0.35,
  fatorGale: 0.7,
  galeApos: 3,
  valorMaximo: 10,
  takeProfit: 5,
  stopLoss: 10,
  maxOperacoes: 100,
}

const din = (v: number, m = 'USD') =>
  `${m} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function LocalRobotPanel({
  socket, isDemo, moeda, symbols, symbolPadrao, identidade, conexao = 'open',
  onRemover, titulo,
}: Props) {
  const estrategia = ESTRATEGIAS_LOCAIS.find((e) => e.id === identidade.id) ?? ESTRATEGIAS_LOCAIS[0]
  const [cfg, setCfg] = useState<ConfigEstrategia>(PADRAO)
  const [symbol, setSymbol] = useState(symbolPadrao ?? '1HZ10V')
  const [estado, setEstado] = useState<EstadoMotor | null>(null)
  const [preparando, setPreparando] = useState(false)
  const motorRef = useRef<MotorTeeds | null>(null)

  useEffect(() => { if (symbolPadrao) setSymbol(symbolPadrao) }, [symbolPadrao])
  useEffect(() => () => { motorRef.current?.desligar('página fechada') }, [])

  /**
   * Trocar de conta cria uma conexão nova na Deriv e derruba a antiga.
   * Um robô ligado ficaria segurando a conexão morta: sem receber preço e
   * sem conseguir comprar — parado, sem dizer por quê. Pior ainda seria
   * ele continuar comprando na conta que você acabou de deixar.
   */
  useEffect(() => {
    const motor = motorRef.current
    if (!motor || !motor.estadoAtual.rodando) return
    if (socket && motor.conexao === socket) return
    motor.desligar('você trocou de conta — ligue de novo para operar na conta atual')
  }, [socket])

  const nomeAtivo = symbols.find((s) => s.symbol === symbol)?.name ?? symbol
  const rodando = estado?.rodando ?? false

  // a regra do contrato dita em uma frase, para a tela nao falar em codigo
  const b = estrategia.barreira ?? 5
  const regra = {
    DIGITOVER: `maior que ${b}`,
    DIGITUNDER: `menor que ${b}`,
    DIGITMATCH: `igual a ${b}`,
    DIGITDIFF: `diferente de ${b}`,
    DIGITEVEN: 'par',
    DIGITODD: 'ímpar',
  }[estrategia.contractType] ?? estrategia.contractType

  const ganhaCom = (d: number) => {
    switch (estrategia.contractType) {
      case 'DIGITOVER': return d > b
      case 'DIGITUNDER': return d < b
      case 'DIGITMATCH': return d === b
      case 'DIGITDIFF': return d !== b
      case 'DIGITEVEN': return d % 2 === 0
      case 'DIGITODD': return d % 2 === 1
      default: return false
    }
  }

  function ligar(config: ConfigEstrategia, ativo: string) {
    if (!socket) return
    setPreparando(false)
    setCfg(config)
    setSymbol(ativo)
    const pip = symbols.find((s) => s.symbol === ativo)?.pipSize ?? 2
    const motor = new MotorTeeds({
      socket, estrategia, config, symbol: ativo, moeda, pipSize: pip,
    })
    motorRef.current = motor
    motor.escutar(setEstado)
    motor.ligar()
  }

  const parametros = [
    { rot: 'Ativo', valor: nomeAtivo.replace(' Index', '') },
    { rot: 'Entrada', valor: din(cfg.valorAoVencer, moeda) },
    {
      rot: 'Martingale',
      valor: cfg.fatorGale === 0
        ? 'desligado'
        : `${(cfg.fatorGale * 100).toFixed(0)}% após ${cfg.galeApos} perdas`,
    },
    { rot: 'Teto', valor: din(cfg.valorMaximo, moeda) },
    { rot: 'Para se ganhar', valor: din(cfg.takeProfit, moeda) },
    { rot: 'Para se perder', valor: din(cfg.stopLoss, moeda) },
  ]

  // ------------------------------------------------------------ sem sessão
  if (!estado) {
    const ultimo = lerPreparo()
    const ativoUltimo = symbols.find((s) => s.symbol === ultimo.symbol)?.name
    return (
      <>
        <div className="pronto" style={{ ['--robo' as any]: identidade.cor, ['--robo-suave' as any]: identidade.corSuave }}>
          <Emblema id={identidade} tamanho={56} />
          {onRemover && <span className="pronto-tag">{titulo}</span>}
          <h3>{estrategia.nome}</h3>
          <p>{estrategia.descricao}</p>
          <button className="pronto-btn" disabled={!socket} onClick={() => setPreparando(true)}>
            Ligar robô
          </button>
          {onRemover && (
            <button className="pronto-fechar" onClick={onRemover}>Fechar este bloco</button>
          )}
          <span className="pronto-nota">
            {ultimo.cfg
              ? `da última vez: ${din(ultimo.cfg.valorAoVencer ?? 0.35, moeda)} por entrada${ativoUltimo ? ` em ${ativoUltimo.replace(' Index', '')}` : ''}`
              : 'você escolhe os valores no próximo passo'}
          </span>
        </div>

        {preparando && (
          <RobotSetup
            identidade={identidade}
            nomeEstrategia={estrategia.nome}
            symbols={symbols}
            symbolInicial={symbol}
            configInicial={cfg}
            moeda={moeda}
            isDemo={isDemo}
            onCancelar={() => setPreparando(false)}
            onLigar={ligar}
          />
        )}
      </>
    )
  }

  // ------------------------------------------------------------ com sessão
  return (
    <div className="cabine-caixa"
      style={{ ['--robo' as any]: identidade.cor, ['--robo-suave' as any]: identidade.corSuave }}>
      <RobotLive
        estado={estado}
        config={cfg}
        moeda={moeda}
        nomeEstrategia={estrategia.nome}
        ativo={nomeAtivo}
        titulo={titulo}
        regra={regra}
        cor={identidade.cor}
        ganhaCom={ganhaCom}
        parametros={parametros}
        conexao={conexao}
        onDesligar={rodando ? () => motorRef.current?.desligar() : undefined}
        onLigarDeNovo={!rodando ? () => setPreparando(true) : undefined}
        onRemover={onRemover ? () => { motorRef.current?.desligar('bloco fechado'); onRemover() } : undefined}
      />

      {preparando && (
        <RobotSetup
          identidade={identidade}
          nomeEstrategia={estrategia.nome}
          symbols={symbols}
          symbolInicial={symbol}
          configInicial={cfg}
          moeda={moeda}
          isDemo={isDemo}
          onCancelar={() => setPreparando(false)}
          onLigar={ligar}
        />
      )}
    </div>
  )
}
