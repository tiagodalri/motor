import { useCallback, useEffect, useRef, useState } from 'react'
import { INSTRUMENTOS, MotorDeTicks, type Instrumento, type Tick } from '../core/motor/ticks'
import { Livro, type Contrato } from '../core/motor/livro'
import { Razao } from '../core/motor/razao'

/**
 * Liga o motor à interface.
 *
 * Um motor de tick por instrumento, um livro só. A liquidação é disparada
 * pelo evento de tick — o mesmo evento que atualiza o gráfico liquida os
 * contratos. É de propósito: nunca há um contrato "esperando o relógio".
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
  const motorRef = useRef<MotorDeTicks | null>(null)

  // livro único, criado uma vez
  if (!livroRef.current) {
    const razao = razaoGuardada()
    const livro = new Livro(razao)
    // primeira visita ganha uma banca fictícia para experimentar
    if (razao.total === 0) livro.depositar(CLIENTE, 1000, 'deposito-inicial')
    livroRef.current = livro
  }
  const livro = livroRef.current

  const atualizar = useCallback(() => {
    setSaldo(livro.saldo(CLIENTE))
    setAbertos(livro.abertos(CLIENTE))
    setHistorico(livro.historico(CLIENTE, 60))
    setPulso((n) => n + 1)
    try {
      localStorage.setItem(CHAVE_RAZAO, JSON.stringify(livro.razao.exportar()))
    } catch { /* sem armazenamento: a sessao vale so enquanto a aba viver */ }
  }, [livro])

  // troca de instrumento = rodada nova, com compromisso novo
  useEffect(() => {
    let vivo = true
    motorRef.current?.parar()
    const motor = new MotorDeTicks(instrumento)
    motorRef.current = motor
    setTicks([]); setUltimo(null)

    void (async () => {
      const compromisso = await motor.abrirRodada()
      if (!vivo) return
      setProva({ hash: compromisso.hash, sementeCliente: compromisso.sementeCliente })
      motor.escutar((t) => {
        setUltimo(t)
        setTicks((antes) => [...antes, t].slice(-600))
        // o mesmo tick que move o gráfico liquida os contratos
        if (livro.liquidarTick(t).length > 0) atualizar()
      })
      motor.ligar()
    })()

    return () => { vivo = false; motor.parar() }
  }, [instrumento, livro, atualizar])

  useEffect(() => { atualizar() }, [atualizar])

  return {
    instrumento, setInstrumento, instrumentos: INSTRUMENTOS,
    motor: motorRef.current, livro, cliente: CLIENTE,
    ticks, ultimo, abertos, historico, saldo, prova, pulso, atualizar,
  }
}
