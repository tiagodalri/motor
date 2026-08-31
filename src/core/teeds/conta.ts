/**
 * Contas da Teeds.
 *
 * São **outro login**, separado do da Deriv. A pessoa entra na plataforma
 * com a conta Teeds; conectar a corretora é um segundo passo, necessário
 * só para operar de verdade.
 *
 * Usa a API REST de autenticação do Supabase direto com `fetch` — sem
 * biblioteca, como o resto da Teeds. A chave anônima é pública por
 * definição: ela só permite o que as regras do projeto permitirem.
 */

import { SUPABASE, autenticacaoConfigurada } from './config'

export interface Usuario {
  id: string
  email: string
  nome: string | null
  telefone: string | null
  /** Guardado só com dígitos. Exibido formatado. */
  cpf: string | null
  criadoEm: string
}

export interface DadosCadastro {
  nome: string
  email: string
  senha: string
  telefone: string
  cpf: string
}

/**
 * Para onde a Deriv... perdão, o Supabase deve devolver a pessoa depois do
 * e-mail. Sem mandar explicitamente, ele usa o Site URL do projeto — que
 * pode vir sem o caminho `/teeds/` e cair num 404 do GitHub Pages.
 */
export function enderecoDeRetorno(): string {
  return `${window.location.origin}${window.location.pathname}`
}

export interface SessaoTeeds {
  token: string
  refresh: string
  /** Epoch em milissegundos em que o token expira. */
  expiraEm: number
  usuario: Usuario
}

const CHAVE = 'teeds.conta'

/* ---------------------------------------------------------------- baixo nivel */

function url(caminho: string): string {
  return `${SUPABASE.url.replace(/\/$/, '')}/auth/v1${caminho}`
}

async function chamar(
  caminho: string,
  opcoes: { corpo?: unknown; token?: string; metodo?: string } = {},
): Promise<any> {
  if (!autenticacaoConfigurada()) {
    throw new Error('O login da Teeds ainda não foi configurado.')
  }
  const res = await fetch(url(caminho), {
    method: opcoes.metodo ?? (opcoes.corpo ? 'POST' : 'GET'),
    headers: {
      apikey: SUPABASE.anonKey,
      'Content-Type': 'application/json',
      ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {}),
    },
    ...(opcoes.corpo ? { body: JSON.stringify(opcoes.corpo) } : {}),
  })

  const texto = await res.text()
  const dados = texto ? JSON.parse(texto) : {}
  if (!res.ok) throw new Error(traduzir(dados))
  return dados
}

/** Mensagens do Supabase em português, na voz da Teeds. */
function traduzir(dados: any): string {
  const bruto: string = dados?.error_description || dados?.msg || dados?.message || dados?.error || ''
  const m = bruto.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha não conferem.'
  if (m.includes('email not confirmed')) return 'Confirme o e-mail que enviamos antes de entrar.'
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Já existe uma conta com este e-mail. Tente entrar.'
  }
  if (m.includes('password should be at least')) return 'A senha precisa de pelo menos 6 caracteres.'
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Esse e-mail não parece válido.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Espere um minuto e tente de novo.'
  return bruto || 'Não consegui falar com o servidor da Teeds.'
}

function montarSessao(d: any): SessaoTeeds {
  const u = d.user ?? {}
  return {
    token: d.access_token,
    refresh: d.refresh_token,
    expiraEm: Date.now() + Number(d.expires_in ?? 3600) * 1000,
    usuario: montarUsuario(u),
  }
}

function montarUsuario(u: any): Usuario {
  return {
    id: u?.id ?? '',
    email: u?.email ?? '',
    nome: u?.user_metadata?.nome ?? null,
    telefone: u?.user_metadata?.telefone ?? null,
    cpf: u?.user_metadata?.cpf ?? null,
    criadoEm: u?.created_at ?? '',
  }
}

function guardar(s: SessaoTeeds | null) {
  try {
    if (s) localStorage.setItem(CHAVE, JSON.stringify(s))
    else localStorage.removeItem(CHAVE)
  } catch {
    /* sem armazenamento: a sessao vale so enquanto a aba estiver aberta */
  }
}

/* ---------------------------------------------------------------- publico */

/** Sessão guardada, se ainda existir. Não valida o token. */
export function sessaoGuardada(): SessaoTeeds | null {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return null
    const s = JSON.parse(bruto) as SessaoTeeds
    return s?.token && s?.usuario ? s : null
  } catch {
    return null
  }
}

/** Cria a conta. Se o projeto exigir confirmação, devolve `confirmar: true`. */
export async function cadastrar(
  dados: DadosCadastro,
): Promise<{ sessao: SessaoTeeds | null; confirmar: boolean }> {
  const d = await chamar(`/signup?redirect_to=${encodeURIComponent(enderecoDeRetorno())}`, {
    corpo: {
      email: dados.email.trim(),
      password: dados.senha,
      data: {
        nome: dados.nome.trim(),
        telefone: soDigitos(dados.telefone),
        cpf: soDigitos(dados.cpf),
      },
    },
  })
  if (!d.access_token) return { sessao: null, confirmar: true }
  const s = montarSessao(d)
  guardar(s)
  return { sessao: s, confirmar: false }
}

export async function entrar(email: string, senha: string): Promise<SessaoTeeds> {
  const d = await chamar('/token?grant_type=password', {
    corpo: { email: email.trim(), password: senha },
  })
  const s = montarSessao(d)
  guardar(s)
  return s
}

/** Renova o token com o refresh guardado. */
export async function renovar(refresh: string): Promise<SessaoTeeds> {
  const d = await chamar('/token?grant_type=refresh_token', { corpo: { refresh_token: refresh } })
  const s = montarSessao(d)
  guardar(s)
  return s
}

export async function sair(token?: string): Promise<void> {
  try {
    if (token) await chamar('/logout', { corpo: {}, token })
  } catch {
    /* o servidor pode recusar um token ja vencido: sair localmente basta */
  }
  guardar(null)
}

/** Manda o e-mail de redefinição de senha. */
export async function recuperarSenha(email: string): Promise<void> {
  await chamar(`/recover?redirect_to=${encodeURIComponent(enderecoDeRetorno())}`, {
    corpo: { email: email.trim() },
  })
}

/* ------------------------------------------------------- documentos */

export const soDigitos = (v: string) => (v || '').replace(/\D+/g, '')

/** Formata 12345678901 como 123.456.789-01, conforme a pessoa digita. */
export function formatarCPF(v: string): string {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** (11) 91234-5678 */
export function formatarTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * Valida o CPF pelos dois dígitos verificadores.
 *
 * Vale a pena validar de verdade: um CPF digitado errado só aparece
 * quando alguém precisa dele, e aí é tarde.
 */
export function cpfValido(bruto: string): boolean {
  const d = soDigitos(bruto)
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false
  const digito = (ate: number) => {
    let soma = 0
    for (let i = 0; i < ate; i += 1) soma += Number(d[i]) * (ate + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10])
}

/** DDD válido (11 a 99) e 10 ou 11 dígitos no total. */
export function telefoneValido(bruto: string): boolean {
  const d = soDigitos(bruto)
  if (d.length < 10 || d.length > 11) return false
  const ddd = Number(d.slice(0, 2))
  return ddd >= 11 && ddd <= 99
}

/* ------------------------------------------------------------- retorno */

export interface Retorno {
  sessao: SessaoTeeds | null
  /** 'signup' = confirmou o e-mail · 'recovery' = veio redefinir a senha. */
  tipo: string | null
  erro: string | null
}

/**
 * Lê o que o Supabase devolve no endereço depois do e-mail.
 *
 * Os links de confirmação e de nova senha voltam para a Teeds com os
 * tokens no fragmento (`#access_token=...`). Sem ler isso aqui, a pessoa
 * clica no e-mail, chega na plataforma e continua vendo a tela de login.
 * O endereço é limpo em seguida para o token não ficar visível na barra.
 */
export function capturarRetorno(): Retorno {
  const bruto = window.location.hash.replace(/^#/, '')
  if (!bruto) return { sessao: null, tipo: null, erro: null }

  const p = new URLSearchParams(bruto)
  const token = p.get('access_token')
  const erroBruto = p.get('error_description') || p.get('error')
  if (!token && !erroBruto) return { sessao: null, tipo: null, erro: null }

  limparEndereco()

  if (!token) {
    const m = (erroBruto || '').toLowerCase()
    return {
      sessao: null,
      tipo: p.get('type'),
      erro: m.includes('expired')
        ? 'Esse link já expirou. Peça um novo.'
        : (erroBruto || 'O link não funcionou.'),
    }
  }

  const sessao: SessaoTeeds = {
    token,
    refresh: p.get('refresh_token') ?? '',
    expiraEm: Date.now() + Number(p.get('expires_in') ?? 3600) * 1000,
    usuario: { id: '', email: '', nome: null, telefone: null, cpf: null, criadoEm: '' },
  }
  guardar(sessao)
  return { sessao, tipo: p.get('type'), erro: null }
}

function limparEndereco() {
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  } catch {
    /* navegador sem history: o token some no proximo carregamento */
  }
}

/** Busca os dados do usuario a partir do token — usado depois do retorno. */
export async function buscarUsuario(token: string): Promise<Usuario> {
  return montarUsuario(await chamar('/user', { token }))
}

/** Atualiza nome e telefone. O e-mail e o CPF não mudam por aqui. */
export async function atualizarPerfil(
  token: string,
  dados: { nome: string; telefone: string },
): Promise<Usuario> {
  const u = await chamar('/user', {
    corpo: { data: { nome: dados.nome.trim(), telefone: soDigitos(dados.telefone) } },
    token,
    metodo: 'PUT',
  })
  return montarUsuario(u)
}

/** Troca a senha da conta logada. */
export async function trocarSenha(token: string, nova: string): Promise<void> {
  await chamar('/user', { corpo: { password: nova }, token, metodo: 'PUT' })
}
