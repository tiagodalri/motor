import { useCallback, useEffect, useState } from 'react'
import { esquecerPaleta } from '../core/chart/theme'

/**
 * Claro ou escuro.
 *
 * O tema vive num atributo do `<html>`, não numa classe do React: assim a
 * folha de estilo inteira responde de uma vez, e o gráfico — que lê a
 * paleta do CSS — vem junto sem paleta paralela.
 *
 * Sem escolha guardada, segue o sistema. Quem escolheu na mão manda mais
 * que o sistema, para sempre — mudar o tema do computador no meio da
 * sessão não pode virar a tela de quem já decidiu.
 */

export type Tema = 'claro' | 'escuro'
const CHAVE = 'motor.tema'

function inicial(): Tema {
  try {
    const guardado = localStorage.getItem(CHAVE)
    if (guardado === 'claro' || guardado === 'escuro') return guardado
  } catch { /* sem armazenamento: decide pelo sistema */ }
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'escuro' : 'claro'
}

export function useTema() {
  const [tema, definir] = useState<Tema>(inicial)

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    // o canvas guarda a paleta em cache: precisa reler depois da troca
    esquecerPaleta()
    try { localStorage.setItem(CHAVE, tema) } catch { /* tudo bem */ }
  }, [tema])

  const alternar = useCallback(
    () => definir((t) => (t === 'claro' ? 'escuro' : 'claro')),
    [],
  )

  return { tema, definir, alternar }
}
