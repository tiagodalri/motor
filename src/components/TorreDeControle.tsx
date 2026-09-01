import { useEffect, useMemo, useState } from 'react'
import type { Livro } from '../core/motor/livro'
import type { Torre } from '../core/motor/torre'
import type { Motores } from '../core/motor/torre'
import type { Auditoria, Peso } from '../core/motor/auditoria'
import { MARGEM, PARAMETROS, type TipoContrato } from '../core/motor/precos'
import { INSTRUMENTOS } from '../core/motor/ticks'
import type { Limites } from '../core/motor/risco'

/**
 * Torre de controle da casa.
 *
 * Tudo que o sistema tem de ajustável está aqui, sem trava nenhuma: é o
 * inventário completo das alavancas, que é justamente o que se precisa
 * ter na mão antes de decidir quais delas ficam do lado de fora.
 *
 * A tela separa as alavancas por consequência, não por tela de origem.
 * O que só muda comportamento é ajuste; o que move dinheiro fora do fluxo
 * normal é dinheiro; o que invalida uma promessa feita ao cliente é
 * quebra — e quebra pinta de vermelho, conta no cabeçalho e fica na
 * auditoria para sempre.
 */

interface Props {
  livro: Livro
  torre: Torre
  motores: Motores
  auditoria: Auditoria
  /** Só existe para provocar o re-render a cada tick; não é lido. */
  pulso: number
  aoMexer: () => void
}

const din = (v: number) =>
  `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (v: number) => `${(v * 100).toFixed(2)}%`
const hora = (t: number) => new Date(t).toLocaleTimeString('pt-BR')

const CAMPOS_LIMITE: Array<{ id: keyof Limites; nome: string; nota: string }> = [
  { id: 'valorMaximo', nome: 'Valor máximo por aposta', nota: 'trava o tamanho de uma ordem só' },
  { id: 'pagamentoMaximo', nome: 'Pagamento máximo por aposta', nota: 'o maior cheque que a casa assina de uma vez' },
  { id: 'exposicaoPorCliente', nome: 'Exposição aberta por cliente', nota: 'soma do que a casa deve a um cliente se tudo der certo para ele' },
  { id: 'perdaDiariaPorCliente', nome: 'Perda diária por cliente', nota: 'quanto a casa aceita perder para uma pessoa em um dia' },
  { id: 'exposicaoPorBucket', nome: 'Exposição por tick de liquidação', nota: 'o limite que importa: contratos do mesmo tick liquidam juntos' },
  { id: 'sangriaPorMinuto', nome: 'Sangria por minuto (disjuntor)', nota: 'perda em 60s que suspende o instrumento sozinho' },
]

const TIPOS_MARGEM: Array<{ id: TipoContrato; nome: string }> = [
  { id: 'DIGITO_ACIMA', nome: 'Dígito acima' },
  { id: 'DIGITO_ABAIXO', nome: 'Dígito abaixo' },
  { id: 'DIGITO_IGUAL', nome: 'Dígito igual' },
  { id: 'DIGITO_DIFERENTE', nome: 'Dígito diferente' },
  { id: 'DIGITO_PAR', nome: 'Par' },
  { id: 'DIGITO_IMPAR', nome: 'Ímpar' },
  { id: 'SUBIR', nome: 'Subir' },
  { id: 'DESCER', nome: 'Descer' },
]

type Aba = 'risco' | 'precos' | 'motores' | 'contas' | 'posicoes' | 'auditoria'

const ABAS: Array<{ id: Aba; nome: string; nota: string }> = [
  { id: 'risco', nome: 'Risco', nota: 'limites e disjuntor' },
  { id: 'precos', nome: 'Preço', nota: 'margem e cotação' },
  { id: 'motores', nome: 'Motores', nota: 'série, velocidade, rodada' },
  { id: 'contas', nome: 'Contas', nota: 'saldo e dinheiro' },
  { id: 'posicoes', nome: 'Posições', nota: 'contratos abertos' },
  { id: 'auditoria', nome: 'Auditoria', nota: 'quem puxou o quê' },
]

/* ------------------------------------------------------------- controles */

function Numero({ valor, aoConfirmar, passo = 1, min, sufixo, largura = 110 }: {
  valor: number
  aoConfirmar: (v: number) => void
  passo?: number
  min?: number
  sufixo?: string
  largura?: number
}) {
  const infinito = !Number.isFinite(valor)
  const [texto, setTexto] = useState(infinito ? '' : String(valor))
  useEffect(() => { setTexto(Number.isFinite(valor) ? String(valor) : '') }, [valor])

  return (
    <span className="tc-numero" style={{ width: largura }}>
      <input
        type="number" step={passo} min={min}
        value={texto}
        placeholder={infinito ? '∞' : ''}
        onFocus={(e) => e.currentTarget.select()}
        onMouseUp={(e) => e.preventDefault()}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => { const n = Number(texto); if (texto !== '' && !Number.isNaN(n)) aoConfirmar(n) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
      {sufixo && <em>{sufixo}</em>}
    </span>
  )
}

function Chave({ ligado, aoTrocar, rotulo, perigoQuandoDesligado }: {
  ligado: boolean
  aoTrocar: (v: boolean) => void
  rotulo: string
  perigoQuandoDesligado?: boolean
}) {
  const alerta = perigoQuandoDesligado && !ligado
  return (
    <button className={`tc-chave ${ligado ? 'on' : ''} ${alerta ? 'alerta' : ''}`}
      onClick={() => aoTrocar(!ligado)} aria-pressed={ligado}>
      <i /><span>{rotulo}</span>
    </button>
  )
}

function Linha({ nome, nota, children }: { nome: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="tc-linha">
      <div className="tc-linha-texto">
        <b>{nome}</b>
        {nota && <em>{nota}</em>}
      </div>
      <div className="tc-linha-controle">{children}</div>
    </div>
  )
}

function Bloco({ titulo, nota, children, tom }: {
  titulo: string; nota?: string; children: React.ReactNode; tom?: 'quebra'
}) {
  return (
    <section className={`tc-bloco ${tom ?? ''}`}>
      <header>
        <h3>{titulo}</h3>
        {nota && <p>{nota}</p>}
      </header>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ tela */

export function TorreDeControle({ livro, torre, motores, auditoria, aoMexer }: Props) {
  const [aba, setAba] = useState<Aba>('risco')
  const [, setEco] = useState(0)
  const refazer = () => { setEco((n) => n + 1); aoMexer() }

  useEffect(() => auditoria.escutar(() => setEco((n) => n + 1)), [auditoria])

  const casa = livro.livroDaCasa
  const risco = livro.risco
  const suspensoes = risco.suspensoes()
  const quebras = auditoria.quebras
  const adulteradas = Object.values(motores).filter((m) => m.adulterada).map((m) => m.instrumento.codigo)

  return (
    <div className="tc">
      <div className="tc-topo">
      <div className="tc-faixa">
        <div className="tc-faixa-nome">
          <b>Torre de controle</b>
          <span>tudo solto — nada travado ainda</span>
        </div>
        <div className="tc-sinais">
          <Sinal rot="Livro" valor={casa.fecha ? 'fecha' : 'NÃO FECHA'} tom={casa.fecha ? 'ok' : 'ruim'} />
          <Sinal rot="Resultado" valor={din(casa.resultado)} tom={casa.resultado >= 0 ? 'ok' : 'ruim'} />
          <Sinal rot="Exposição" valor={din(casa.exposicao)} />
          <Sinal rot="Último minuto" valor={din(risco.resultadoDoMinuto)}
            tom={risco.resultadoDoMinuto >= 0 ? 'ok' : 'ruim'} />
          <Sinal rot="Cotação" valor={PARAMETROS.aceitandoOrdens ? 'aberta' : 'fechada'}
            tom={PARAMETROS.aceitandoOrdens ? 'ok' : 'atencao'} />
          <Sinal rot="Disjuntor" valor={risco.disjuntorAtivo ? 'armado' : 'desarmado'}
            tom={risco.disjuntorAtivo ? 'ok' : 'ruim'} />
          <Sinal rot="Quebras" valor={String(quebras)} tom={quebras > 0 ? 'ruim' : 'ok'} />
        </div>
      </div>

      {(adulteradas.length > 0 || quebras > 0) && (
        <div className="tc-alarme">
          <b>Garantia rompida.</b>{' '}
          {adulteradas.length > 0 && (
            <>A série de {adulteradas.join(', ')} não é mais função pura das sementes publicadas —
            a verificação do cliente vai falhar nesta rodada. Abrir rodada nova é o que limpa. </>
          )}
          {quebras > 0 && <>{quebras} operação(ões) de quebra registradas na auditoria. </>}
        </div>
      )}

      <nav className="tc-abas">
        {ABAS.map((a) => (
          <button key={a.id} className={a.id === aba ? 'on' : ''} onClick={() => setAba(a.id)}>
            <b>{a.nome}</b><em>{a.nota}</em>
          </button>
        ))}
      </nav>
      </div>

      {/* sem `key` variavel aqui: um key que muda a cada tick desmonta e
          remonta a arvore inteira quatro vezes por segundo — trava a aba e
          apaga o que estiver sendo digitado nos campos. A tela le os
          objetos vivos a cada render, entao o re-render normal ja basta. */}
      <div className="tc-corpo">
        {aba === 'risco' && (
          <>
            <Bloco titulo="Limites"
              nota="Deixe o campo vazio para tirar o limite. Sem limite não é um número grande — é a ausência da checagem, e é assim que ela aparece no log.">
              {CAMPOS_LIMITE.map((c) => {
                const v = risco.limites[c.id]
                return (
                  <Linha key={c.id} nome={c.nome} nota={c.nota}>
                    <Numero valor={v} passo={50} min={0}
                      aoConfirmar={(n) => { torre.definirLimite(c.id, n); refazer() }} />
                    <button className={`tc-mini ${Number.isFinite(v) ? '' : 'on'}`}
                      onClick={() => { torre.definirLimite(c.id, Number.isFinite(v) ? Infinity : 500); refazer() }}>
                      ∞
                    </button>
                  </Linha>
                )
              })}
              <div className="tc-acoes">
                <button className="tc-btn" onClick={() => { torre.restaurarLimites(); refazer() }}>
                  Restaurar padrão
                </button>
                <button className="tc-btn perigo" onClick={() => { torre.soltarTodosOsLimites(); refazer() }}>
                  Remover todos os limites
                </button>
              </div>
            </Bloco>

            <Bloco titulo="Disjuntor"
              nota="A única coisa que fecha a casa sozinha quando ninguém está olhando. Desarmar é possível e fica registrado como quebra.">
              <Linha nome="Disjuntor automático" nota="suspende o instrumento ao estourar a sangria por minuto">
                <Chave ligado={risco.disjuntorAtivo} perigoQuandoDesligado
                  rotulo={risco.disjuntorAtivo ? 'Armado' : 'Desarmado'}
                  aoTrocar={(v) => { torre.definirDisjuntor(v); refazer() }} />
              </Linha>
              <Linha nome="Duração da suspensão" nota="quanto tempo o instrumento fica fora depois de abrir">
                <Numero valor={risco.minutosDeSuspensao} passo={1} min={0} sufixo="min"
                  aoConfirmar={(n) => { torre.definirMinutosDeSuspensao(n); refazer() }} />
              </Linha>
            </Bloco>

            <Bloco titulo="Instrumentos suspensos" nota="Suspender fecha só aquele instrumento. A cotação geral continua de pé.">
              {INSTRUMENTOS.map((i) => {
                const s = suspensoes.find((x) => x.instrumento === i.codigo)
                return (
                  <Linha key={i.codigo} nome={`${i.codigo} · ${i.nome}`}
                    nota={s ? s.motivo : 'aceitando ordens'}>
                    {s ? (
                      <button className="tc-btn" onClick={() => { torre.religar(i.codigo); refazer() }}>
                        Religar
                      </button>
                    ) : (
                      <>
                        <button className="tc-btn" onClick={() => { torre.suspender(i.codigo, 5, 'Suspenso manualmente por 5 minutos.'); refazer() }}>
                          5 min
                        </button>
                        <button className="tc-btn perigo" onClick={() => { torre.suspender(i.codigo, 0, 'Suspenso manualmente até religar.'); refazer() }}>
                          Até religar
                        </button>
                      </>
                    )}
                  </Linha>
                )
              })}
            </Bloco>

            <Bloco titulo="Exposição por tick de liquidação"
              nota="Contratos que expiram no mesmo tick liquidam juntos: ou a casa paga todos, ou nenhum. Não há diversificação — este é o número que quebra a casa, não a exposição total.">
              <Buckets risco={risco} />
            </Bloco>
          </>
        )}

        {aba === 'precos' && (
          <>
            <Bloco titulo="Cotação" nota="A chave geral. Fechar a cotação para de aceitar ordens sem derrubar o motor de preço — o gráfico continua andando e os contratos abertos liquidam normalmente.">
              <Linha nome="Aceitando ordens" nota="chave geral da casa">
                <Chave ligado={PARAMETROS.aceitandoOrdens} rotulo={PARAMETROS.aceitandoOrdens ? 'Aberta' : 'Fechada'}
                  aoTrocar={(v) => { torre.definirAceitandoOrdens(v); refazer() }} />
              </Linha>
              <Linha nome="Validade da cotação" nota="cotação que não expira é opção de graça para quem sabe esperar">
                <Numero valor={PARAMETROS.validadeMs} passo={500} min={200} sufixo="ms" largura={120}
                  aoConfirmar={(n) => { torre.definirValidade(n); refazer() }} />
              </Linha>
              <Linha nome="Valor mínimo" nota="piso de uma aposta">
                <Numero valor={PARAMETROS.valorMinimo} passo={0.05} min={0.01}
                  aoConfirmar={(n) => { torre.definirValorMinimo(n); refazer() }} />
              </Linha>
              <Linha nome="Duração máxima" nota="teto de ticks por contrato">
                <Numero valor={PARAMETROS.ticksMaximo} passo={1} min={1} sufixo="ticks"
                  aoConfirmar={(n) => { torre.definirTicksMaximo(n); refazer() }} />
              </Linha>
            </Bloco>

            <Bloco titulo="Margem por tipo de contrato"
              nota="A margem é a expectativa da casa em fração do valor apostado. É o negócio inteiro em oito números. Margem negativa faz a casa pagar mais do que o justo — existe, e é registrada como quebra.">
              {TIPOS_MARGEM.map((t) => (
                <Linha key={t.id} nome={t.nome}
                  nota={`paga ${((1 / probDe(t.id)) * (1 - MARGEM[t.id])).toFixed(3)}× · chance real ${(probDe(t.id) * 100).toFixed(0)}%`}>
                  <input className="tc-slider" type="range" min={-10} max={40} step={0.5}
                    value={MARGEM[t.id] * 100}
                    onChange={(e) => { torre.definirMargem(t.id, Number(e.target.value) / 100); refazer() }} />
                  <span className={`tc-valor ${MARGEM[t.id] < 0 ? 'ruim' : ''}`}>{pct(MARGEM[t.id])}</span>
                </Linha>
              ))}
              <div className="tc-acoes">
                <button className="tc-btn" onClick={() => { torre.restaurarMargens(); refazer() }}>
                  Restaurar margens padrão
                </button>
              </div>
            </Bloco>
          </>
        )}

        {aba === 'motores' && (
          <>
            {INSTRUMENTOS.map((i) => (
              <PainelMotor key={i.codigo} codigo={i.codigo} torre={torre} motores={motores} refazer={refazer} />
            ))}
          </>
        )}

        {aba === 'contas' && <PainelContas livro={livro} torre={torre} refazer={refazer} />}
        {aba === 'posicoes' && <PainelPosicoes livro={livro} torre={torre} refazer={refazer} />}
        {aba === 'auditoria' && <PainelAuditoria auditoria={auditoria} livro={livro} />}
      </div>
    </div>
  )
}

function Sinal({ rot, valor, tom }: { rot: string; valor: string; tom?: 'ok' | 'ruim' | 'atencao' }) {
  return (
    <div className={`tc-sinal ${tom ?? ''}`}>
      <span>{rot}</span>
      <b>{valor}</b>
    </div>
  )
}

function probDe(tipo: TipoContrato): number {
  switch (tipo) {
    case 'DIGITO_ACIMA': return 0.4
    case 'DIGITO_ABAIXO': return 0.5
    case 'DIGITO_IGUAL': return 0.1
    case 'DIGITO_DIFERENTE': return 0.9
    default: return 0.5
  }
}

/* --------------------------------------------------------------- buckets */

function Buckets({ risco }: { risco: Livro['risco'] }) {
  const buckets = risco.bucketsQuentes(8)
  const teto = risco.limites.exposicaoPorBucket
  if (buckets.length === 0) return <p className="tc-vazio">Nenhum contrato aberto.</p>
  return (
    <div className="tc-buckets">
      {buckets.map((b) => {
        const cheio = Number.isFinite(teto) ? Math.min(1, b.exposicao / teto) : 0
        return (
          <div key={`${b.instrumento}-${b.tick}`} className="tc-bucket">
            <span className="tc-bucket-nome">{b.instrumento} · tick {b.tick}</span>
            <div className="tc-barra">
              <i style={{ width: `${cheio * 100}%` }}
                className={cheio > 0.8 ? 'perigo' : cheio > 0.5 ? 'atencao' : ''} />
            </div>
            <span className="tc-bucket-valor">{din(b.exposicao)}</span>
          </div>
        )
      })}
      <p className="tc-nota-fim">
        Teto por tick: {Number.isFinite(teto) ? din(teto) : 'sem limite — a barra não tem contra o que encher'}
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- motores */

function PainelMotor({ codigo, torre, motores, refazer }: {
  codigo: string; torre: Torre; motores: Motores; refazer: () => void
}) {
  const motor = motores[codigo]
  const [forcar, setForcar] = useState('')
  const [semente, setSemente] = useState('')
  const [conferido, setConferido] = useState<string | null>(null)

  if (!motor) return null
  const i = motor.instrumento
  const prova = motor.provaPublica

  return (
    <Bloco titulo={`${i.codigo} · ${i.nome}`} tom={motor.adulterada ? 'quebra' : undefined}
      nota={motor.adulterada
        ? 'Série adulterada nesta rodada: algum tick deixou de ser função pura das sementes. A verificação do cliente vai falhar até abrir rodada nova.'
        : 'Movimento browniano sem deriva, semeado pelo par de sementes da rodada. Determinístico: as mesmas sementes refazem a série inteira.'}>
      <Linha nome="Gerador" nota={motor.rodando ? `rodando · tick ${motor.ultimo?.n ?? 0}` : 'parado'}>
        {motor.rodando
          ? <button className="tc-btn" onClick={() => { torre.pararMotor(codigo); refazer() }}>Parar</button>
          : <button className="tc-btn" onClick={() => { torre.ligarMotor(codigo); refazer() }}>Ligar</button>}
        <button className="tc-btn" onClick={() => { torre.passo(codigo); refazer() }}>Um tick</button>
      </Linha>

      <Linha nome="Velocidade" nota="multiplicador do tempo real — acelera para exercitar caminhos que a sorte levaria horas para produzir">
        <div className="tc-velocidades">
          {[0.5, 1, 2, 5, 10, 25].map((v) => (
            <button key={v} className={`tc-mini ${motor.velocidade === v ? 'on' : ''}`}
              onClick={() => { torre.definirVelocidade(codigo, v); refazer() }}>{v}×</button>
          ))}
        </div>
      </Linha>

      <Linha nome="Volatilidade" nota="anualizada · mudar com a rodada aberta quebra a reprodutibilidade">
        <Numero valor={i.volatilidade} passo={0.05} min={0.01}
          aoConfirmar={(n) => { torre.ajustarInstrumento(codigo, { volatilidade: n }); refazer() }} />
      </Linha>
      <Linha nome="Intervalo entre ticks">
        <Numero valor={i.intervalo} passo={1} min={1} sufixo="s"
          aoConfirmar={(n) => { torre.ajustarInstrumento(codigo, { intervalo: n }); refazer() }} />
      </Linha>
      <Linha nome="Casas decimais" nota="define qual dígito decide os contratos">
        <Numero valor={i.casas} passo={1} min={1}
          aoConfirmar={(n) => { torre.ajustarInstrumento(codigo, { casas: Math.round(n) }); refazer() }} />
      </Linha>

      <Linha nome="Forçar dígitos"
        nota="a última casa dos próximos ticks, separada por vírgula. Isto é a alavanca de fraudar o resultado — ela existe aqui para testar liquidação, e suja a rodada de forma permanente.">
        <input className="tc-texto" placeholder="ex.: 9,9,9,0" value={forcar}
          onChange={(e) => setForcar(e.target.value)} />
        <button className="tc-btn perigo" onClick={() => {
          const ds = forcar.split(',').map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n))
          torre.forcarDigitos(codigo, ds); setForcar(''); refazer()
        }}>Enfileirar</button>
        {motor.forcadosPendentes.length > 0 && (
          <button className="tc-btn" onClick={() => { torre.limparForcados(codigo); refazer() }}>
            Limpar ({motor.forcadosPendentes.length})
          </button>
        )}
      </Linha>

      <Linha nome="Rodada" nota={prova ? `hash ${prova.hash.slice(0, 20)}… · ${prova.ticks} ticks` : 'sem rodada'}>
        <input className="tc-texto" placeholder="semente do cliente (opcional)" value={semente}
          onChange={(e) => setSemente(e.target.value)} />
        <button className="tc-btn" onClick={() => {
          void torre.novaRodada(codigo, semente).then(() => { setSemente(''); setConferido(null); refazer() })
        }}>Abrir rodada nova</button>
      </Linha>

      <Linha nome="Verificar a série"
        nota="refaz tick a tick a partir das sementes e compara com o que foi servido — o mesmo cálculo que o cliente roda, só que antes de alguém reclamar">
        <button className="tc-btn" onClick={() => {
          void torre.verificar(codigo).then((r) => {
            setConferido(r.conferidos === 0 ? 'nada para conferir ainda'
              : r.ok ? `bate em ${r.conferidos} ticks`
              : `DIVERGE no tick ${r.primeiraDivergencia}`)
            refazer()
          })
        }}>Conferir</button>
        <button className="tc-btn perigo" onClick={() => {
          const s = torre.revelarAgora(codigo)
          setConferido(s ? `semente da casa: ${s.slice(0, 24)}…` : null); refazer()
        }}>Revelar semente agora</button>
      </Linha>
      {conferido && <p className={`tc-resposta ${conferido.includes('DIVERGE') ? 'ruim' : ''}`}>{conferido}</p>}
    </Bloco>
  )
}

/* ---------------------------------------------------------------- contas */

function PainelContas({ livro, torre, refazer }: { livro: Livro; torre: Torre; refazer: () => void }) {
  const [novo, setNovo] = useState('')
  const [valor, setValor] = useState('100')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const clientes = livro.clientes()
  const porCliente = livro.risco.exposicaoPorClienteAgora()

  const tentar = (fn: () => void) => {
    setErro(null)
    try { fn(); refazer() } catch (e) { setErro((e as Error).message) }
  }

  return (
    <>
      <Bloco titulo="Contas"
        nota="Saldo é derivado da razão, nunca guardado como número. O que você vê aqui é a soma dos lançamentos — se ela estivesse errada, o selo do livro lá em cima estaria vermelho.">
        <div className="tc-tabela">
          <div className="tc-cab">
            <span>Cliente</span><span>Saldo</span><span>Exposição</span><span>Perda do dia</span><span>Ações</span>
          </div>
          {clientes.map((c) => {
            const exp = porCliente.find((x) => x.clienteId === c.id)
            const perda = livro.risco.perdaDeHoje(c.id)
            return (
              <div key={c.id} className="tc-tr">
                <span className="tc-forte">{c.id}</span>
                <span className="tc-num">{din(c.saldo)}</span>
                <span className="tc-num">{exp ? `${din(exp.exposicao)} · ${exp.contratos}` : '—'}</span>
                <span className="tc-num">{perda > 0 ? din(perda) : '—'}</span>
                <span className="tc-acoes-linha">
                  <button className="tc-mini" onClick={() => tentar(() => torre.depositar(c.id, Number(valor) || 0))}>+ {valor}</button>
                  <button className="tc-mini" onClick={() => tentar(() => torre.sacar(c.id, Number(valor) || 0))}>− {valor}</button>
                  <button className="tc-mini" onClick={() => tentar(() => torre.ajustarManual(c.id, Number(valor) || 0, motivo || 'sem motivo'))}>Ajuste</button>
                  {perda > 0 && <button className="tc-mini" onClick={() => tentar(() => torre.zerarPerdaDoDia(c.id))}>Zerar dia</button>}
                </span>
              </div>
            )
          })}
          {clientes.length === 0 && <p className="tc-vazio">Nenhuma conta com movimento.</p>}
        </div>

        <div className="tc-form">
          <label><span>Valor das ações acima</span>
            <input className="tc-texto" value={valor} onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setValor(e.target.value)} /></label>
          <label><span>Motivo do ajuste manual</span>
            <input className="tc-texto" placeholder="obrigatório em ajuste" value={motivo}
              onChange={(e) => setMotivo(e.target.value)} /></label>
          <label><span>Abrir conta nova</span>
            <input className="tc-texto" placeholder="identificador" value={novo}
              onChange={(e) => setNovo(e.target.value)} /></label>
          <button className="tc-btn" disabled={!novo.trim()}
            onClick={() => tentar(() => { torre.depositar(novo.trim(), Number(valor) || 0); setNovo('') })}>
            Criar com saldo
          </button>
        </div>
        {erro && <p className="tc-resposta ruim">{erro}</p>}
      </Bloco>

      <Bloco titulo="Depósito e saque × ajuste manual"
        nota="Depósito e saque movem dinheiro entre o mundo externo e o cliente: o caixa da casa não muda. Ajuste manual tira da conta da casa e põe na do cliente sem que regra nenhuma tenha sido aplicada — é a operação mais perigosa do sistema e a que mais aparece em fraude interna. Continua sendo partida dobrada, então o livro fecha; o que muda é de quem é o dinheiro.">
        <ContasDoSistema livro={livro} />
      </Bloco>
    </>
  )
}

function ContasDoSistema({ livro }: { livro: Livro }) {
  const contas = livro.razao.contas().filter((c) => !c.startsWith('cliente:'))
  return (
    <div className="tc-sistema">
      {contas.map((c) => (
        <div key={c}>
          <span>{c}</span>
          <b className={livro.razao.saldo(c) >= 0 ? '' : 'ruim'}>{din(livro.razao.saldo(c))}</b>
        </div>
      ))}
      <div className="tc-soma">
        <span>soma de tudo</span>
        <b className={livro.livroDaCasa.fecha ? 'ok' : 'ruim'}>
          {livro.livroDaCasa.fecha ? '0,00 — fecha' : 'não fecha'}
        </b>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- posições */

function PainelPosicoes({ livro, torre, refazer }: { livro: Livro; torre: Torre; refazer: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const abertos = livro.todosAbertos

  const tentar = (fn: () => void) => {
    setErro(null)
    try { fn(); refazer() } catch (e) { setErro((e as Error).message) }
  }

  return (
    <Bloco titulo="Contratos abertos na casa inteira"
      nota="Cancelar devolve a entrada e apaga o contrato. Liquidar à mão decide o resultado sem consultar o tick — as duas alavancas existem para erro operacional, e as duas são, sem cerimônia, a casa escolhendo o desfecho de uma aposta em aberto.">
      <div className="tc-form">
        <label><span>Motivo (vai para a razão e a auditoria)</span>
          <input className="tc-texto" value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="ex.: erro de precificação no lançamento" /></label>
      </div>
      <div className="tc-tabela">
        <div className="tc-cab larga">
          <span>Id</span><span>Cliente</span><span>Contrato</span><span>Valor</span>
          <span>Paga</span><span>Liquida</span><span>Ações</span>
        </div>
        {abertos.map((c) => (
          <div key={c.id} className="tc-tr larga">
            <span className="tc-forte">{c.id}</span>
            <span>{c.clienteId}</span>
            <span>{c.tipo}{c.barreira !== null ? ` ${c.barreira}` : ''}</span>
            <span className="tc-num">{din(c.valor)}</span>
            <span className="tc-num">{din(c.pagamento)}</span>
            <span className="tc-num">{c.instrumento} · {c.tickLiquidacao}</span>
            <span className="tc-acoes-linha">
              <button className="tc-mini" onClick={() => tentar(() => torre.cancelarContrato(c.id, motivo))}>Cancelar</button>
              <button className="tc-mini perigo" onClick={() => tentar(() => torre.liquidarForcado(c.id, true, motivo))}>Ganhou</button>
              <button className="tc-mini perigo" onClick={() => tentar(() => torre.liquidarForcado(c.id, false, motivo))}>Perdeu</button>
            </span>
          </div>
        ))}
        {abertos.length === 0 && <p className="tc-vazio">Nada aberto.</p>}
      </div>
      {erro && <p className="tc-resposta ruim">{erro}</p>}
    </Bloco>
  )
}

/* ------------------------------------------------------------- auditoria */

const PESO_NOME: Record<Peso, string> = {
  rotina: 'rotina', ajuste: 'ajuste', dinheiro: 'dinheiro', quebra: 'quebra',
}

function PainelAuditoria({ auditoria, livro }: { auditoria: Auditoria; livro: Livro }) {
  const [filtro, setFiltro] = useState<Peso | 'tudo'>('tudo')
  const registros = useMemo(
    () => auditoria.todos(300).filter((r) => filtro === 'tudo' || r.peso === filtro),
    [auditoria, filtro, auditoria.total],
  )

  return (
    <>
      <Bloco titulo="Auditoria"
        nota="Toda alavanca desta torre passa por um único ponto antes de existir, e o que passa fica aqui. Enquanto está tudo solto, esta lista é o inventário do que dá para fazer; quando chegar a hora de travar, é ela que diz o que precisa de segunda pessoa, o que precisa de motivo e o que simplesmente não deveria existir em produção.">
        <div className="tc-filtros">
          {(['tudo', 'quebra', 'dinheiro', 'ajuste', 'rotina'] as const).map((f) => (
            <button key={f} className={`tc-mini ${filtro === f ? 'on' : ''}`} onClick={() => setFiltro(f)}>
              {f === 'tudo' ? 'tudo' : PESO_NOME[f]}
            </button>
          ))}
          <button className="tc-mini" onClick={() => {
            const janela = window.open('', '_blank')
            if (janela) {
              janela.document.write(`<pre>${auditoria.exportar().replace(/</g, '&lt;')}</pre>`)
              janela.document.close()
            }
          }}>Exportar</button>
        </div>
        <div className="tc-log">
          {registros.map((r) => (
            <div key={r.id} className={`tc-log-linha ${r.peso}`}>
              <span className="tc-log-hora">{hora(r.quando)}</span>
              <span className={`tc-selo ${r.peso}`}>{PESO_NOME[r.peso]}</span>
              <span className="tc-log-area">{r.area}</span>
              <span className="tc-log-acao">{r.acao}</span>
              <span className="tc-log-mudanca">
                {r.de !== undefined && <em>{r.de}</em>}
                {r.de !== undefined && r.para !== undefined && ' → '}
                {r.para !== undefined && <b>{r.para}</b>}
              </span>
            </div>
          ))}
          {registros.length === 0 && <p className="tc-vazio">Nada registrado com este filtro.</p>}
        </div>
      </Bloco>

      <Bloco titulo="Razão — últimos lançamentos"
        nota="Partidas dobradas. Cada linha soma zero; a soma de todas as contas também. Dinheiro não nasce nem some — e quando alguém tenta fazer nascer, é aqui que aparece.">
        <div className="tc-log razao">
          {livro.razao.todos(40).map((l) => (
            <div key={l.id} className="tc-log-linha">
              <span className="tc-log-hora">{hora(l.quando)}</span>
              <span className="tc-log-area">#{l.id}</span>
              <span className="tc-log-acao">{l.descricao}</span>
              <span className="tc-log-mudanca">
                {l.linhas.map((x, k) => (
                  <em key={k} className={x.valor >= 0 ? 'ok' : 'ruim'}>{x.conta} {din(x.valor)}</em>
                ))}
              </span>
            </div>
          ))}
          {livro.razao.total === 0 && <p className="tc-vazio">Nada lançado ainda.</p>}
        </div>
      </Bloco>
    </>
  )
}
