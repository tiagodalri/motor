import { DERIV } from './config'
import type { AuthSession } from './auth'

export interface TradingAccount {
  accountId: string
  balance: number
  currency: string
  group: string
  status: 'active' | 'inactive' | string
  type: 'demo' | 'real' | string
}

function headers(session: AuthSession): HeadersInit {
  return {
    'Deriv-App-ID': DERIV.appId,
    Authorization: `Bearer ${session.accessToken}`,
    'Content-Type': 'application/json',
  }
}

async function call<T>(path: string, session: AuthSession, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${DERIV.restBase}${path}`, { ...init, headers: headers(session) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const first = body?.errors?.[0]
    throw new Error(first?.message || body?.message || `Erro ${res.status} em ${path}`)
  }
  return body as T
}

/** Contas de opcoes do usuario autenticado (demo e real). */
export async function fetchAccounts(session: AuthSession): Promise<TradingAccount[]> {
  const body = await call<{ data?: any[] }>('/trading/v1/options/accounts', session)
  return (body.data ?? []).map((a) => ({
    accountId: a.account_id,
    balance: Number(a.balance ?? 0),
    currency: a.currency ?? 'USD',
    group: a.group ?? '',
    status: a.status ?? 'active',
    type: a.account_type ?? 'demo',
  }))
}

/**
 * Troca o token por uma URL de WebSocket de uso unico (OTP).
 * E assim que a Teeds entra na sala de operacoes de uma conta especifica.
 */
export async function fetchTradingSocketUrl(session: AuthSession, accountId: string): Promise<string> {
  const body = await call<{ data?: { url?: string } }>(
    `/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
    session,
    { method: 'POST' },
  )
  const url = body.data?.url
  if (!url) throw new Error('A Deriv nao devolveu o endereco de conexao')
  return url
}

/** Cria uma conta de opcoes (demo ou real) caso o usuario ainda nao tenha. */
export async function createAccount(
  session: AuthSession,
  accountType: 'demo' | 'real' = 'demo',
): Promise<TradingAccount> {
  const body = await call<{ data?: any }>('/trading/v1/options/accounts', session, {
    method: 'POST',
    body: JSON.stringify({ currency: 'USD', group: 'row', account_type: accountType }),
  })
  const a = body.data ?? {}
  return {
    accountId: a.account_id,
    balance: Number(a.balance ?? 0),
    currency: a.currency ?? 'USD',
    group: a.group ?? 'row',
    status: a.status ?? 'active',
    type: a.account_type ?? accountType,
  }
}

/** Recarrega o saldo ficticio de uma conta demo. Devolve o novo saldo. */
export async function resetDemoBalance(session: AuthSession, accountId: string): Promise<number> {
  const body = await call<{ data?: { balance?: string | number } }>(
    `/trading/v1/options/accounts/${encodeURIComponent(accountId)}/reset-demo-balance`,
    session,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return Number(body.data?.balance ?? 0)
}
