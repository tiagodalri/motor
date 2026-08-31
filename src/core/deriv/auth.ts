import { DERIV } from './config'

/**
 * Login da Teeds - OAuth 2.0 com PKCE, inteiramente no navegador.
 *
 * PKCE existe justamente para aplicacoes sem servidor: em vez de um segredo
 * fixo, cada login gera um par verificador/desafio de uso unico. Sem segredo
 * embutido, nao ha o que vazar no codigo publico.
 */

const KEY_VERIFIER = 'teeds.pkce.verifier'
const KEY_STATE = 'teeds.pkce.state'
const KEY_TOKEN = 'teeds.auth'

export interface AuthSession {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

// ---------------------------------------------------------------- PKCE

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(length = 64): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => ('0' + b.toString(16)).slice(-2)).join('').slice(0, length)
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(digest)
}

// ---------------------------------------------------------------- entrada

/** Leva o usuario para a pagina oficial da Deriv para autorizar a Teeds. */
export async function startLogin(): Promise<void> {
  const verifier = randomString(64)
  const state = randomString(32)
  sessionStorage.setItem(KEY_VERIFIER, verifier)
  sessionStorage.setItem(KEY_STATE, state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: DERIV.appId,
    redirect_uri: DERIV.redirectUri,
    scope: DERIV.scopes.join(' '),
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
  })
  window.location.assign(`${DERIV.oauth.authorize}?${params.toString()}`)
}

/**
 * Trata o retorno da Deriv. Deve rodar uma vez, ao abrir a pagina.
 * Devolve a sessao quando o login acabou de acontecer, ou null.
 */
export async function completeLogin(): Promise<AuthSession | null> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    cleanUrl()
    throw new Error(url.searchParams.get('error_description') || error)
  }
  if (!code) return null

  const expected = sessionStorage.getItem(KEY_STATE)
  const verifier = sessionStorage.getItem(KEY_VERIFIER)
  cleanUrl()

  if (!expected || state !== expected) throw new Error('Autorizacao nao confere (state invalido)')
  if (!verifier) throw new Error('Sessao de login perdida. Tente entrar novamente.')

  const res = await fetch(DERIV.oauth.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: DERIV.appId,
      code,
      redirect_uri: DERIV.redirectUri,
      code_verifier: verifier,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Falha ao concluir login (${res.status})`)
  }

  sessionStorage.removeItem(KEY_VERIFIER)
  sessionStorage.removeItem(KEY_STATE)

  const session: AuthSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : undefined,
  }
  saveSession(session)
  return session
}

function cleanUrl() {
  window.history.replaceState({}, '', window.location.pathname)
}

// ---------------------------------------------------------------- sessao

export function saveSession(s: AuthSession): void {
  localStorage.setItem(KEY_TOKEN, JSON.stringify(s))
}

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(KEY_TOKEN)
    if (!raw) return null
    const s = JSON.parse(raw) as AuthSession
    if (!s.accessToken) return null
    if (s.expiresAt && Date.now() > s.expiresAt) {
      logout()
      return null
    }
    return s
  } catch {
    return null
  }
}

export function logout(): void {
  localStorage.removeItem(KEY_TOKEN)
  sessionStorage.removeItem(KEY_VERIFIER)
  sessionStorage.removeItem(KEY_STATE)
}
