import { useMemo, useRef, useState } from 'react'
import type { Livro } from '../core/motor/livro'
import { CONTA } from '../core/motor/razao'
import { PARAMETROS } from '../core/motor/precos'

/**
 * Caixa: depósito, saque e extrato.
 *
 * O extrato **não é uma lista à parte**: é a razão do cliente, lida como
 * ela é. Toda linha aqui existe porque um lançamento de partida dobrada
 * existe, e o saldo mostrado é a soma deles — nunca um campo guardado. É a
 * mesma disciplina do resto do motor, e é o que faz o extrato ser
 * conferível em vez de ser uma tela bonita que alguém alimenta.
 *
 * O dinheiro aqui é fictício e a tela diz isso. Não há coleta de dado de
 * pagamento, e não deve haver: depósito de verdade precisa de PSP, KYC,
 * conta segregada e um servidor — nada disso mora no navegador, e um
 * formulário que peça chave PIX ou cartão numa maquete é um formulário que
 * um dia vai receber dado de gente de verdade sem ter para onde levar.
 */

const din = (v: number) =>
  `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const quando = (t: number) =>
  new Date(t).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

const METODOS = [
  { id: 'pix', nome: 'Pix', prazo: 'cai na hora', taxa: 'sem taxa' },
  { id: 'cartao', nome: 'Cartão', prazo: 'até 1 dia útil', taxa: 'taxa do adquirente' },
  { id: 'cripto', nome: 'Cripto', prazo: 'após 2 confirmações', taxa: 'taxa de rede' },
]

type Aba = 'depositar' | 'sacar'

interface Props {
  livro: Livro
  clienteId: string
  saldo: number
  aoMexer: () => void
}

export function TelaCaixa({ livro, clienteId, saldo, aoMexer }: Props) {
  const [aba, setAba] = useState<Aba>('depositar')
  const [valor, setValor] = useState('100')
  const [metodo, setMetodo] = useState('pix')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  /**
   * Trava de duplo clique.
   *
   * A chave de idempotência da razão usa o relógio, então dois cliques
   * separados por alguns milissegundos viram **dois saques**, não um
   * recusado — o que é o comportamento certo para duas ordens de verdade e
   * o comportamento errado para um dedo tremendo. Numa tela de dinheiro a
   * segunda confirmação tem de ser deliberada.
   */
  const ultimo = useRef<{ assinatura: string; quando: number } | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  const abertos = livro.abertos(clienteId)
  const emJogo = abertos.reduce((t, c) => t + c.valor, 0)

  const extrato = useMemo(
    () => livro.razao.extrato(CONTA.cliente(clienteId), 60),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [livro, clienteId, saldo, livro.razao.total],
  )

  const numero = Number(valor.replace(',', '.')) || 0

  function executar() {
    setErro(null); setOk(null)
    const assinatura = `${aba}:${numero}`
    const agora = Date.now()
    const repetido = ultimo.current
      && ultimo.current.assinatura === assinatura
      && agora - ultimo.current.quando < 8_000
    if (repetido && !confirmando) {
      setConfirmando(true)
      setErro(`Você acabou de ${aba === 'sacar' ? 'sacar' : 'depositar'} ${din(numero)}. `
        + 'Clique de novo para repetir de propósito.')
      return
    }
    try {
      if (numero <= 0) throw new Error('Informe um valor maior que zero.')
      if (aba === 'depositar') {
        livro.depositar(clienteId, numero)
        setOk(`Depósito de ${din(numero)} creditado.`)
      } else {
        livro.sacar(clienteId, numero)
        setOk(`Saque de ${din(numero)} enviado.`)
      }
      ultimo.current = { assinatura, quando: agora }
      setConfirmando(false)
      aoMexer()
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  return (
    <div className="caixa">
      <div className="caixa-topo">
        <div>
          <h2>Caixa</h2>
          <p>Depósitos, saques e o extrato da sua conta.</p>
        </div>
        <span className="caixa-selo">banca fictícia</span>
      </div>

      <div className="caixa-grade">
        <section className="caixa-saldos">
          <div className="caixa-principal">
            <span className="rot">Saldo</span>
            <strong>{din(saldo)}</strong>
          </div>
          <div className="caixa-quebra">
            <div>
              <span className="rot">Disponível para saque</span>
              <b>{din(saldo)}</b>
              <em>o que não está preso em operação</em>
            </div>
            <div>
              <span className="rot">Em operação</span>
              <b>{din(emJogo)}</b>
              <em>{abertos.length} contrato{abertos.length === 1 ? '' : 's'} em aberto</em>
            </div>
          </div>
          <p className="caixa-nota">
            O saldo é somado dos lançamentos da razão a cada vez que aparece — não existe
            um campo &ldquo;saldo&rdquo; que alguém possa escrever errado. O extrato ao lado
            é essa mesma razão, linha por linha.
          </p>
        </section>

        <section className="caixa-form">
          <div className="caixa-abas">
            <button className={aba === 'depositar' ? 'on' : ''} onClick={() => { setAba('depositar'); setErro(null); setOk(null) }}>
              Depositar
            </button>
            <button className={aba === 'sacar' ? 'on' : ''} onClick={() => { setAba('sacar'); setErro(null); setOk(null) }}>
              Sacar
            </button>
          </div>

          <span className="rot">Valor</span>
          <div className="caixa-valor">
            <span>US$</span>
            <input value={valor} inputMode="decimal"
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => { setValor(e.target.value); setConfirmando(false); setErro(null) }} />
          </div>
          <div className="caixa-atalhos">
            {[20, 50, 100, 250, 500].map((v) => (
              <button key={v} className={numero === v ? 'on' : ''} onClick={() => setValor(String(v))}>
                {v}
              </button>
            ))}
            {aba === 'sacar' && (
              <button onClick={() => setValor(saldo.toFixed(2))}>tudo</button>
            )}
          </div>

          <span className="rot">{aba === 'depositar' ? 'Forma de pagamento' : 'Receber por'}</span>
          <div className="caixa-metodos">
            {METODOS.map((m) => (
              <button key={m.id} className={metodo === m.id ? 'on' : ''} onClick={() => setMetodo(m.id)}>
                <b>{m.nome}</b>
                <em>{m.prazo}</em>
                <i>{m.taxa}</i>
              </button>
            ))}
          </div>

          <button className={`caixa-btn ${aba === 'sacar' ? 'saque' : ''} ${confirmando ? 'confirmar' : ''}`}
            onClick={executar}
            disabled={numero <= 0 || (aba === 'sacar' && numero > saldo)}>
            {confirmando
              ? 'Confirmar de novo'
              : aba === 'depositar' ? `Depositar ${din(numero)}` : `Sacar ${din(numero)}`}
          </button>

          {erro && <p className="caixa-erro">{erro}</p>}
          {ok && <p className="caixa-ok">{ok}</p>}

          <p className="caixa-aviso">
            <b>Nada aqui move dinheiro de verdade.</b> A forma de pagamento acima é
            ilustrativa e nenhum dado é pedido nem guardado. Depósito real exige PSP,
            verificação de identidade, conta segregada e servidor — e isso é outro
            projeto, não um campo a mais nesta tela.
          </p>
        </section>

        <section className="caixa-extrato">
          <span className="rot">Extrato</span>
          <p className="caixa-nota">Direto da razão, do mais novo para o mais antigo.</p>
          <div className="caixa-linhas">
            {extrato.map(({ lancamento, valor: v }) => (
              <div key={lancamento.id} className="caixa-linha">
                <span className="caixa-l-quando">{quando(lancamento.quando)}</span>
                <span className="caixa-l-desc">{descrever(lancamento.descricao)}</span>
                <span className={`caixa-l-valor ${v >= 0 ? 'up' : 'down'}`}>
                  {v >= 0 ? '+' : '−'}{din(Math.abs(v))}
                </span>
              </div>
            ))}
            {extrato.length === 0 && <p className="caixa-vazio">Nenhum movimento ainda.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}

/** Deixa a descrição da razão legível para quem não é a casa. */
function descrever(d: string): string {
  if (d.startsWith('Depósito')) return 'Depósito'
  if (d.startsWith('Saque')) return 'Saque'
  if (d.startsWith('Ajuste manual')) return `Ajuste da casa${d.split('·').slice(2).join('·') || ''}`
  if (d.startsWith('Cancelamento')) return 'Operação cancelada — entrada devolvida'
  if (d.includes('cliente ganhou')) return 'Operação encerrada — ganho'
  if (d.includes('casa ganhou')) return 'Operação encerrada — perda'
  if (d.startsWith('Liquidação forçada')) return 'Operação encerrada pela casa'
  if (d.startsWith('Aposta')) return `Entrada em operação · ${d.split('·')[1]?.trim() ?? ''}`
  return d
}

/** Só para o mínimo não ficar sem uso quando a tela ganhar validação. */
export const MINIMO = PARAMETROS.valorMinimo
