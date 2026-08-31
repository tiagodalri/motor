import { useEffect, useRef, useState } from 'react'
import { publicSocket } from '../core/deriv/client'
import { fetchTickHistory } from '../core/deriv/market'
import { subscribeTicks } from '../core/deriv/market'
import { distribuicao, ultimoDigito } from '../core/deriv/digits'

/**
 * Historico e estatistica dos ultimos digitos de um ativo.
 * Carrega uma janela do passado e continua atualizando a cada tick novo.
 */
/** Ultimo historico de digitos por ativo, para nao rebaixar tudo a cada troca de aba. */
const memoria = new Map<string, { digitos: number[]; quando: number }>()
const VALIDADE_MS = 60_000

export function useDigits(symbol: string | null, pipSize: number, janela = 500) {
  const [digitos, setDigitos] = useState<number[]>([])
  const [carregando, setCarregando] = useState(false)
  const janelaRef = useRef(janela)
  janelaRef.current = janela

  // historico inicial
  useEffect(() => {
    if (!symbol) return
    let alive = true

    // Trocar de aba e voltar nao precisa baixar mil ticks de novo.
    const guardado = memoria.get(symbol)
    if (guardado && Date.now() - guardado.quando < VALIDADE_MS) {
      setDigitos(guardado.digitos)
      setCarregando(false)
      return () => { alive = false }
    }

    setCarregando(true)
    setDigitos([])
    fetchTickHistory(symbol, 1000)
      .then((ticks) => {
        if (!alive) return
        const lista = ticks.map((t) => ultimoDigito(t.quote, t.pipSize || pipSize))
        memoria.set(symbol, { digitos: lista, quando: Date.now() })
        setDigitos(lista)
        setCarregando(false)
      })
      .catch(() => alive && setCarregando(false))
    return () => { alive = false }
  }, [symbol, pipSize])

  // atualizacao ao vivo
  useEffect(() => {
    if (!symbol) return
    return subscribeTicks(symbol, (t) => {
      const d = ultimoDigito(t.quote, t.pipSize || pipSize)
      setDigitos((prev) => {
        const next = prev.length >= 1000 ? prev.slice(1) : prev.slice()
        next.push(d)
        memoria.set(symbol, { digitos: next, quando: Date.now() })
        return next
      })
    }, publicSocket)
  }, [symbol, pipSize])

  const recorte = digitos.slice(-janela)
  const { conta, pct } = distribuicao(recorte)
  const ultimo = digitos.length ? digitos[digitos.length - 1] : null
  const recentes = digitos.slice(-24)

  return { digitos, recentes, ultimo, conta, pct, total: recorte.length, carregando }
}
