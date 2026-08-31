import { useState } from 'react'
import { AFILIADO } from '../core/deriv/config'
import {
  cpfValido, formatarCPF, formatarTelefone, telefoneValido,
  type DadosCadastro,
} from '../core/teeds/conta'
import { Brand } from './Brand'
import { DerivNome } from './DerivMarca'

type Modo = 'entrar' | 'criar' | 'esqueci'

interface Props {
  ocupado: boolean
  erro?: string | null
  limparErro: () => void
  onEntrar: (email: string, senha: string) => Promise<boolean>
  onCadastrar: (dados: DadosCadastro) => Promise<{ ok: boolean; confirmar: boolean }>
  onEsqueci: (email: string) => Promise<boolean>
}

const TEXTOS: Record<Modo, { titulo: string; linha: string; acao: string }> = {
  entrar: {
    titulo: 'Bem-vindo de volta.',
    linha: 'Entre na sua conta Teeds. A conexão com a corretora vem depois, lá dentro.',
    acao: 'Entrar',
  },
  criar: {
    titulo: 'Crie a sua conta Teeds.',
    linha: 'É a conta da plataforma. A conta da Deriv, onde o dinheiro fica, é separada.',
    acao: 'Criar conta',
  },
  esqueci: {
    titulo: 'Esqueceu a senha?',
    linha: 'Diga o seu e-mail e mandamos um link para você criar uma nova.',
    acao: 'Enviar link',
  },
}

const nomeCompleto = (v: string) => v.trim().split(/\s+/).filter((p) => p.length >= 2).length >= 2

export function LoginScreen({ ocupado, erro, limparErro, onEntrar, onCadastrar, onEsqueci }: Props) {
  const [modo, setModo] = useState<Modo>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cpf, setCpf] = useState('')
  const [recado, setRecado] = useState<string | null>(null)
  const [tocado, setTocado] = useState<Record<string, boolean>>({})

  const t = TEXTOS[modo]
  const marcar = (campo: string) => () => setTocado((x) => ({ ...x, [campo]: true }))

  const problemas: Record<string, string | null> = {
    nome: nome && !nomeCompleto(nome) ? 'Escreva o nome e o sobrenome.' : null,
    email: email && !email.includes('@') ? 'Esse e-mail não parece completo.' : null,
    senha: senha && senha.length < 6 ? 'Pelo menos 6 caracteres.' : null,
    telefone: telefone && !telefoneValido(telefone) ? 'DDD e número, 10 ou 11 dígitos.' : null,
    cpf: cpf && !cpfValido(cpf) ? 'Esse CPF não é válido.' : null,
  }

  const valido = modo === 'esqueci'
    ? email.includes('@')
    : modo === 'entrar'
      ? email.includes('@') && senha.length >= 6
      : nomeCompleto(nome) && email.includes('@') && senha.length >= 6
        && telefoneValido(telefone) && cpfValido(cpf)

  function trocarModo(m: Modo) {
    setModo(m); setRecado(null); setTocado({}); limparErro()
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || ocupado) return
    setRecado(null)
    if (modo === 'entrar') { await onEntrar(email, senha); return }
    if (modo === 'criar') {
      const r = await onCadastrar({ nome, email, senha, telefone, cpf })
      if (r.ok && r.confirmar) {
        setRecado(`Conta criada. Confirme o e-mail que enviamos para ${email} e depois entre.`)
        setModo('entrar')
      }
      return
    }
    const ok = await onEsqueci(email)
    if (ok) setRecado(`Se existir uma conta com ${email}, o link está a caminho.`)
  }

  const campo = (
    chave: string, rotulo: string, valor: string, aoMudar: (v: string) => void,
    extra: { tipo?: string; auto?: string; dica?: string; modo?: string } = {},
  ) => (
    <label className={tocado[chave] && problemas[chave] ? 'ruim' : ''}>
      <span className="rot">{rotulo}</span>
      <input
        type={extra.tipo ?? 'text'} value={valor} autoComplete={extra.auto}
        inputMode={extra.modo as any} placeholder={extra.dica}
        onBlur={marcar(chave)} onChange={(e) => aoMudar(e.target.value)} />
      {tocado[chave] && problemas[chave] && <em>{problemas[chave]}</em>}
    </label>
  )

  return (
    <div className="entrada">
      <div className="entrada-caixa">
        <div className="entrada-marca"><Brand tamanho={44} /></div>

        <h1>{t.titulo}</h1>
        <p className="entrada-linha">{t.linha}</p>

        <form className="entrada-form" onSubmit={enviar}>
          {modo === 'criar' && campo('nome', 'Nome completo', nome, setNome,
            { auto: 'name', dica: 'Como está no documento' })}

          {campo('email', 'E-mail', email, setEmail,
            { tipo: 'email', auto: 'email', dica: 'voce@email.com' })}

          {modo === 'criar' && (
            <div className="entrada-par">
              {campo('telefone', 'Telefone com DDD', telefone,
                (v) => setTelefone(formatarTelefone(v)),
                { auto: 'tel', modo: 'numeric', dica: '(11) 91234-5678' })}
              {campo('cpf', 'CPF', cpf, (v) => setCpf(formatarCPF(v)),
                { modo: 'numeric', dica: '000.000.000-00' })}
            </div>
          )}

          {modo !== 'esqueci' && campo('senha', 'Senha', senha, setSenha,
            { tipo: 'password', auto: modo === 'criar' ? 'new-password' : 'current-password',
              dica: modo === 'criar' ? 'pelo menos 6 caracteres' : '••••••••' })}

          <button className="entrada-btn" type="submit" disabled={!valido || ocupado}>
            {ocupado ? 'um instante…' : t.acao}
          </button>

          {modo === 'criar' && (
            <p className="entrada-mini">
              Pedimos telefone e CPF para identificar você como cliente da Teeds.
              Não repassamos esses dados a ninguém.
            </p>
          )}
        </form>

        {erro && <div className="entrada-erro">{erro}</div>}
        {recado && <div className="entrada-recado">{recado}</div>}

        <div className="entrada-troca">
          {modo === 'entrar' ? (
            <>
              <button onClick={() => trocarModo('criar')}>Criar uma conta</button>
              <span>·</span>
              <button onClick={() => trocarModo('esqueci')}>Esqueci a senha</button>
            </>
          ) : (
            <button onClick={() => trocarModo('entrar')}>Já tenho conta — entrar</button>
          )}
        </div>

        <div className="entrada-corretora">
          <b>Ainda não tem conta na <DerivNome tamanho={13} />?</b>
          <p>
            A Teeds opera pela sua própria conta na corretora — é lá que o
            dinheiro fica. Abrir é grátis e você começa na conta demo.
          </p>
          <a className="btn-deriv" href={AFILIADO} target="_blank" rel="noopener noreferrer">
            Abrir conta na <DerivNome tamanho={13} />
          </a>
        </div>

        <p className="entrada-rodape">
          Negociar envolve risco de perda. Opere só o que você pode perder,
          e comece pela conta demo.
        </p>
      </div>
    </div>
  )
}
