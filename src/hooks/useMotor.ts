import { useCallback, useEffect, useRef, useState } from 'react'
import { INSTRUMENTOS, MotorDeTicks, type Instrumento, type Tick } from '../core/motor/ticks'
import { Livro, type Contrato } from '../core/motor/livro'
import { Razao } from '../core/motor/razao'
import { Torre, type Motores } from '../core/motor/torre'
import { auditoria } from '../core/motor/auditoria'
import { ESTRATEGIAS, Robo } from '../core/motor/robo'

/**
 * Liga o motor à interface.
 *
 * Um motor de tick **por instrumento**, todos rodando ao mesmo tempo, e um
 * livro só. Antes só existia o instrumento que estava na tela; a torre de
 * controle precisa da casa inteira — exposição de V10 e de V100 somam no
 * mesmo caixa, e um disjuntor que só existe onde alguém está olhando não é
 * um disjuntor.
 *
 * A liquidação é disparada pelo evento de tick — o mesmo evento que
 * atualiza o gráfico liquida os contratos. É de propósito: nunca há um
 * contrato "esperando o relógio".
 */

const CLIENTE = 'eu'
const CHAVE_RAZAO = 'motor.razao'

function razaoGuardada(): Razao {
  try {
    const bruto = localStorage.getItem(CHAVE_RAZAO)
    if (bruto) return Razao.importar(JSON.parse(bruto))
  } catch { /* comeca do zero */ }
  return new Razao()
}

export function useMotor() {
  const [instrumento, setInstrumento] = useState<Instrumento>(INSTRUMENTOS[3])
  const [ticks, setTicks] = useState<Tick[]>([])
  const [ultimo, setUltimo] = useState<Tick | null>(null)
  const [abertos, setAbertos] = useState<Contrato[]>([])
  const [historico, setHistorico] = useState<Contrato[]>([])
  const [saldo, setSaldo] = useState(0)
  const [prova, setProva] = useState<{ hash: string; sementeCliente: string } | null>(null)
  const [pulso, setPulso] = useState(0)

  const livroRef = useRef<Livro | null>(null)
  const motoresRef = useRef<Motores>({})
  const torreRef = useRef<Torre | null>(null)
  const robosRef = useRef<Record<string, Robo[]>>({})
  const ativoRef = useRef<string>(instrumento.codigo)

  if (!livroRef.current) {
    const razao = razaoGuardada()
    const livro = new Livro(razao)
    // primeira visita ganha uma banca fictícia para experimentar
    if (razao.total === 0) livro.depositar(CLIENTE, 1000, 'deposito-inicial')
    livroRef.current = livro
    torreRef.current = new Torre(livro, () => motoresRef.current)
  }
  const livro = livroRef.current
  const torre = torreRef.current!

  const atualizar = useCallback(() => {
    setSaldo(livro.saldo(CLIENTE))
    setAbertos(livro.abertos(CLIENTE))
    setHistorico(livro.historico(CLIENTE, 60))
    setPulso((n) => n + 1)
    try {
      localStorage.setItem(CHAVE_RAZAO, JSON.stringify(livro.razao.exportar()))
    } catch { /* sem armazenamento: a sessao vale so enquanto a aba viver */ }
  }, [livro])

  // um motor por instrumento, criados uma vez e vivos enquanto a aba viver
  const iniciadoRef = useRef(false)
  useEffect(() => {
    // sem desmontagem de propósito: os motores acompanham a aba, não o
    // componente. O StrictMode monta duas vezes em desenvolvimento e uma
    // rodada abortada no meio deixaria um instrumento mudo para sempre.
    if (iniciadoRef.current) return
    iniciadoRef.current = true

    void (async () => {
      for (const i of INSTRUMENTOS) {
        const motor = new MotorDeTicks(i)
        motoresRef.current[i.codigo] = motor
        const compromisso = await motor.abrirRodada()
        if (i.codigo === ativoRef.current) {
          setProva({ hash: compromisso.hash, sementeCliente: compromisso.sementeCliente })
        }
        motor.escutar((t) => {
          if (t.instrumento === ativoRef.current) {
            setUltimo(t)
            setTicks((antes) => [...antes, t].slice(-600))
          }
          // o mesmo tick que move o gráfico liquida os contratos
          if (livro.liquidarTick(t).length > 0) atualizar()
          // um pulso por segundo, não quatro: só o instrumento em tela
          // dispara o re-render. A torre lê os objetos vivos a cada render,
          // então ela continua mostrando a casa inteira atualizada.
          else if (t.instrumento === ativoRef.current) setPulso((n) => n + 1)
        })
        motor.ligar()

        // O robô vive junto com o motor, não com a tela. Se ele nascesse
        // dentro do componente, trocar para a torre de controle o mataria
        // no meio da sequência de gale — e é justamente na torre que se
        // quer olhar a cobertura enquanto ele opera.
        robosRef.current[i.codigo] = ESTRATEGIAS.map(
          (estrategia) => new Robo({ livro, motor, clienteId: CLIENTE, estrategia }),
        )
      }
    })()
  }, [livro, atualizar])

  // trocar de instrumento é só trocar o que a tela olha: os outros seguem
  // rodando, e a casa continua exposta a eles
  useEffect(() => {
    ativoRef.current = instrumento.codigo
    const motor = motoresRef.current[instrumento.codigo]
    setTicks(motor?.historico(600) ?? [])
    setUltimo(motor?.ultimo ?? null)
    const p = motor?.provaPublica
    setProva(p ? { hash: p.hash, sementeCliente: p.sementeCliente } : null)
  }, [instrumento])

  useEffect(() => { atualizar() }, [atualizar])

  return {
    instrumento, setInstrumento, instrumentos: INSTRUMENTOS,
    motor: motoresRef.current[instrumento.codigo] ?? null,
    motores: motoresRef.current,
    robos: robosRef.current[instrumento.codigo] ?? [],
    livro, torre, auditoria, cliente: CLIENTE,
    ticks, ultimo, abertos, historico, saldo, prova, pulso, atualizar,
  }
}
