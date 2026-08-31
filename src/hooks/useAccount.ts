import { useCallback, useEffect, useRef, useState } from 'react'
import { completeLogin, loadSession, logout as clearSession, startLogin, type AuthSession } from '../core/deriv/auth'
import { fetchAccounts, fetchTradingSocketUrl, resetDemoBalance, type TradingAccount } from '../core/deriv/account'
import { TeedsSocket } from '../core/deriv/client'
import type { ConnectionState } from '../core/deriv/types'
import { limparCacheOperacoes } from '../core/deriv/history'
import {
  assinarContratos, fetchPortfolio, subscribeBalance, subscribeTransactions,
  type Balance, type OpenContract,
} from '../core/deriv/trading'

export type AuthStatus = 'deslogado' | 'entrando' | 'logado' | 'erro'

/**
 * Cuida de todo o ciclo de conta: login, escolha da conta,
 * conexao autenticada, saldo e posicoes abertas.
 */
export function useAccount() {
  const [status, setStatus] = useState<AuthStatus>('deslogado')
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [accounts, setAccounts] = useState<TradingAccount[]>([])
  const [accountId, setAccountId] = useState<string | null>(null)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [contracts, setContracts] = useState<Map<number, OpenContract>>(new Map())
  const [connecting, setConnecting] = useState(false)
  /** Sobe a cada transacao na conta — quem depende do historico se atualiza. */
  const [pulso, setPulso] = useState(0)
  /** Estado da conexao autenticada — diferente da conexao publica do grafico. */
  const [conexao, setConexao] = useState<ConnectionState>('idle')

  const socketRef = useRef<TeedsSocket | null>(null)
  const [, setTick] = useState(0)

  // --- retorno da Deriv + sessao guardada
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const fresh = await completeLogin()
        const s = fresh ?? loadSession()
        if (!alive) return
        if (s) {
          setSession(s)
          setStatus('logado')
        }
      } catch (e) {
        if (!alive) return
        setError((e as Error).message)
        setStatus('erro')
      }
    })()
    return () => { alive = false }
  }, [])

  // --- lista de contas
  useEffect(() => {
    if (!session) return
    let alive = true
    fetchAccounts(session)
      .then((list) => {
        if (!alive) return
        setAccounts(list)
        // comeca sempre pela demo: dinheiro ficticio por padrao
        const demo = list.find((a) => a.type === 'demo')
        setAccountId((prev) => prev ?? (demo?.accountId ?? list[0]?.accountId ?? null))
      })
      .catch((e: Error) => {
        if (!alive) return
        setError(e.message)
        if (/401|token/i.test(e.message)) {
          clearSession()
          setSession(null)
          setStatus('deslogado')
        }
      })
    return () => { alive = false }
  }, [session])

  // --- conexao autenticada da conta escolhida
  useEffect(() => {
    if (!session || !accountId) return
    let alive = true
    const paradas: Array<() => void> = []


    setConnecting(true)
    setBalance(null)
    setContracts(new Map())
    // historico de outra conta nao vale para esta
    limparCacheOperacoes()

    /**
     * Guarda um contrato na lista de posicoes abertas.
     *
     * Uma unica assinatura cobre todos os contratos da conta. Antes era uma
     * por contrato, que nunca era cancelada: a Deriv permite 100 por conexao
     * e um robo comprando a cada segundo estourava esse teto em menos de dois
     * minutos — dali em diante nada mais era acompanhado.
     */
    const guardar = (c: OpenContract) => {
      if (!alive) return
      const fechou = c.status !== 'open' || c.isExpired
      setContracts((prev) => {
        if (fechou && !prev.has(c.contractId)) return prev
        const next = new Map(prev)
        if (fechou) next.delete(c.contractId)
        else next.set(c.contractId, c)
        return next
      })
    }

    fetchTradingSocketUrl(session, accountId)
      .then(async (url) => {
        if (!alive) return
        socketRef.current?.disconnect()
        // O OTP da URL e de uso unico: cada reconexao precisa de um novo.
        const sock = new TeedsSocket({
          url,
          renovarUrl: () => fetchTradingSocketUrl(session, accountId),
        })
        socketRef.current = sock
        paradas.push(sock.onStateChange((e) => { if (alive) setConexao(e) }))
        sock.connect()

        paradas.push(subscribeBalance(sock, (b) => alive && setBalance(b)))

        // uma assinatura so, para todos os contratos da conta
        paradas.push(assinarContratos(sock, guardar))

        // contratos que ja estavam abertos quando conectamos
        try {
          const abertos = await fetchPortfolio(sock)
          if (!alive) return
          for (const c of abertos) guardar(c)
        } catch { /* portfolio vazio ou indisponivel: o stream cobre daqui */ }

        // qualquer compra nova entra na lista automaticamente
        paradas.push(
          subscribeTransactions(sock, () => {
            if (!alive) return
            setPulso((n) => n + 1)
          }),
        )

        setConnecting(false)
        setTick((n) => n + 1)
      })
      .catch((e: Error) => {
        if (!alive) return
        setError(e.message)
        setConnecting(false)
      })

    return () => {
      alive = false
      paradas.forEach((p) => p())
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [session, accountId])

  const login = useCallback(() => {
    setStatus('entrando')
    startLogin().catch((e: Error) => {
      setError(e.message)
      setStatus('erro')
    })
  }, [])

  const logout = useCallback(() => {
    socketRef.current?.disconnect()
    socketRef.current = null
    clearSession()
    setSession(null)
    setAccounts([])
    setAccountId(null)
    setBalance(null)
    setContracts(new Map())
    setStatus('deslogado')
    setError(null)
  }, [])

  const [aviso, setAviso] = useState<string | null>(null)

  const recarregarDemo = useCallback(async () => {
    if (!session || !accountId) return
    const conta = accounts.find((a) => a.accountId === accountId)
    if (conta?.type !== 'demo') {
      setAviso('Só a conta demo pode ser recarregada.')
      return
    }
    try {
      const novo = await resetDemoBalance(session, accountId)
      // a assinatura de saldo pode demorar a empurrar o valor novo:
      // usamos o que a propria resposta devolveu
      setBalance((b) => (b ? { ...b, amount: novo } : { amount: novo, currency: conta.currency, loginId: accountId }))
      setAccounts((lista) => lista.map((a) => (a.accountId === accountId ? { ...a, balance: novo } : a)))
      setAviso(`Saldo demo recarregado para ${conta.currency} ${novo.toFixed(2)}.`)
    } catch (e) {
      setAviso(`Não consegui recarregar: ${(e as Error).message}`)
    }
  }, [session, accountId, accounts])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 5000)
    return () => clearTimeout(t)
  }, [aviso])

  const account = accounts.find((a) => a.accountId === accountId) ?? null
  const isDemo = account?.type === 'demo'

  return {
    status, error, setError, session,
    accounts, account, accountId, setAccountId, isDemo,
    balance, contracts: [...contracts.values()],
    socket: socketRef.current, connecting, aviso, setAviso, pulso, conexao,
    login, logout, recarregarDemo,
  }
}
