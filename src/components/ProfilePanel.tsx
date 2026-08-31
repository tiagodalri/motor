import { useState } from 'react'
import {
  atualizarPerfil, formatarCPF, formatarTelefone, telefoneValido, trocarSenha,
  type SessaoTeeds, type Usuario,
} from '../core/teeds/conta'

interface Props {
  sessao: SessaoTeeds
  onAtualizar: (u: Usuario) => void
  onFechar: () => void
}

const iniciais = (nome: string, email: string) => {
  const p = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase()
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (email[0] ?? '?').toUpperCase()
}

const desde = (iso: string) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

/** A conta da Teeds, por dentro. O que dá para mudar, muda aqui. */
export function ProfilePanel({ sessao, onAtualizar, onFechar }: Props) {
  const u = sessao.usuario
  const [nome, setNome] = useState(u.nome ?? '')
  const [telefone, setTelefone] = useState(formatarTelefone(u.telefone ?? ''))
  const [senha, setSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [recado, setRecado] = useState<string | null>(null)

  const mudouDados =
    nome.trim() !== (u.nome ?? '').trim() ||
    telefone.replace(/\D/g, '') !== (u.telefone ?? '')
  const dadosValidos = nome.trim().length >= 2 && telefoneValido(telefone)
  const senhaValida = senha.length >= 6 && senha === repetir

  async function salvarDados() {
    if (!dadosValidos || salvando) return
    setSalvando(true); setErro(null); setRecado(null)
    try {
      onAtualizar(await atualizarPerfil(sessao.token, { nome, telefone }))
      setRecado('Dados atualizados.')
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function salvarSenha() {
    if (!senhaValida || salvando) return
    setSalvando(true); setErro(null); setRecado(null)
    try {
      await trocarSenha(sessao.token, senha)
      setSenha(''); setRepetir('')
      setRecado('Senha trocada.')
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="qz-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="perfil" role="dialog" aria-modal="true" aria-label="Minha conta">
        <header className="perfil-topo">
          <span className="avatar grande">{iniciais(u.nome ?? '', u.email)}</span>
          <div>
            <b>{u.nome || u.email}</b>
            <span>{u.email}</span>
          </div>
          <button className="qz-fechar" onClick={onFechar} aria-label="Fechar">×</button>
        </header>

        <div className="perfil-corpo">
          <section>
            <span className="rot">Seus dados</span>
            <label>
              <span className="rot">Nome completo</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
            </label>
            <label>
              <span className="rot">Telefone com DDD</span>
              <input value={telefone} inputMode="numeric" autoComplete="tel"
                onChange={(e) => setTelefone(formatarTelefone(e.target.value))} />
            </label>
            <div className="perfil-fixo">
              <div><span className="rot">CPF</span><b>{u.cpf ? formatarCPF(u.cpf) : '—'}</b></div>
              <div><span className="rot">Cliente desde</span><b>{desde(u.criadoEm) ?? '—'}</b></div>
            </div>
            <p className="perfil-nota">
              CPF e e-mail não mudam por aqui. Se precisar corrigir, me chame.
            </p>
            <button className="perfil-btn" disabled={!mudouDados || !dadosValidos || salvando}
              onClick={salvarDados}>
              {salvando ? 'salvando…' : 'Salvar dados'}
            </button>
          </section>

          <div className="perfil-linha" />

          <section>
            <span className="rot">Trocar a senha</span>
            <label>
              <span className="rot">Nova senha</span>
              <input type="password" value={senha} autoComplete="new-password"
                placeholder="pelo menos 6 caracteres"
                onChange={(e) => setSenha(e.target.value)} />
            </label>
            <label>
              <span className="rot">Repita a senha</span>
              <input type="password" value={repetir} autoComplete="new-password"
                onChange={(e) => setRepetir(e.target.value)} />
            </label>
            {repetir.length > 0 && senha !== repetir && (
              <p className="perfil-erro">As duas senhas não são iguais.</p>
            )}
            <button className="perfil-btn" disabled={!senhaValida || salvando} onClick={salvarSenha}>
              {salvando ? 'salvando…' : 'Trocar senha'}
            </button>
          </section>

          {erro && <div className="entrada-erro">{erro}</div>}
          {recado && <div className="entrada-recado">{recado}</div>}
        </div>
      </div>
    </div>
  )
}
