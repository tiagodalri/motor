import { auditoria, type Peso } from './auditoria'
import type { Livro } from './livro'
import { MARGEM, MARGEM_PADRAO, PARAMETROS, type TipoContrato } from './precos'
import { LIMITES_PADRAO, type Limites } from './risco'
import { MotorDeTicks, type Instrumento } from './ticks'

/**
 * Torre de controle.
 *
 * Uma única porta para mexer no sistema. Nenhuma tela fala direto com o
 * risco, com o preço ou com o motor: tudo passa por aqui, e o que passa
 * por aqui fica registrado. Isso não é burocracia — é o que faz a
 * diferença entre "a casa mudou a margem às 3h12" e "alguém mudou alguma
 * coisa, não sei quando".
 *
 * Enquanto está tudo solto, esta classe é a lista completa das alavancas
 * que existem. Quando chegar a hora de travar, é aqui que se põe a
 * fechadura: cada método já tem o peso do que faz.
 */

/** `Infinity` é como "sem limite" é representado. A tela mostra ∞. */
export const SEM_LIMITE = Infinity

export interface Motores {
  [codigo: string]: MotorDeTicks
}

export class Torre {
  readonly livro: Livro
  readonly motores: () => Motores

  constructor(livro: Livro, motores: () => Motores) {
    this.livro = livro
    this.motores = motores
  }

  private log(peso: Peso, area: string, acao: string, de?: unknown, para?: unknown) {
    auditoria.registrar(peso, area, acao, de, para)
  }

  /* ------------------------------------------------------------- risco */

  definirLimite(campo: keyof Limites, valor: number): void {
    const antes = this.livro.risco.limites[campo]
    this.livro.risco.limites = { ...this.livro.risco.limites, [campo]: valor }
    this.log('ajuste', 'risco', `limite ${campo}`, rotulo(antes), rotulo(valor))
  }

  soltarTodosOsLimites(): void {
    const antes = { ...this.livro.risco.limites }
    this.livro.risco.limites = {
      valorMaximo: SEM_LIMITE, pagamentoMaximo: SEM_LIMITE,
      exposicaoPorCliente: SEM_LIMITE, perdaDiariaPorCliente: SEM_LIMITE,
      exposicaoPorBucket: SEM_LIMITE, sangriaPorMinuto: SEM_LIMITE,
    }
    this.log('quebra', 'risco', 'todos os limites removidos',
      JSON.stringify(antes), 'tudo ∞')
  }

  restaurarLimites(): void {
    this.livro.risco.limites = { ...LIMITES_PADRAO }
    this.log('ajuste', 'risco', 'limites restaurados ao padrão')
  }

  definirDisjuntor(ativo: boolean): void {
    const antes = this.livro.risco.disjuntorAtivo
    this.livro.risco.disjuntorAtivo = ativo
    this.log(ativo ? 'ajuste' : 'quebra', 'risco', 'disjuntor automático',
      antes ? 'armado' : 'desarmado', ativo ? 'armado' : 'desarmado')
  }

  definirMinutosDeSuspensao(min: number): void {
    const antes = this.livro.risco.minutosDeSuspensao
    this.livro.risco.minutosDeSuspensao = Math.max(0, min)
    this.log('ajuste', 'risco', 'duração da suspensão automática', `${antes} min`, `${min} min`)
  }

  suspender(instrumento: string, minutos: number, motivo: string): void {
    this.livro.risco.suspender(instrumento, minutos,
      motivo || 'Suspenso manualmente pela torre de controle.')
    this.log('ajuste', 'risco', `suspender ${instrumento}`, 'ativo',
      minutos > 0 ? `${minutos} min` : 'até religar')
  }

  religar(instrumento: string): void {
    this.livro.risco.religar(instrumento)
    this.log('ajuste', 'risco', `religar ${instrumento}`, 'suspenso', 'ativo')
  }

  zerarPerdaDoDia(clienteId: string): void {
    const antes = this.livro.risco.perdaDeHoje(clienteId)
    this.livro.risco.zerarPerdaDoDia(clienteId)
    this.log('ajuste', 'risco', `zerar perda do dia · ${clienteId}`, antes, 0)
  }

  /* ------------------------------------------------------------ preços */

  definirMargem(tipo: TipoContrato, margem: number): void {
    const antes = MARGEM[tipo]
    MARGEM[tipo] = Math.max(-0.5, Math.min(0.9, margem))
    this.log(margem < 0 ? 'quebra' : 'ajuste', 'precos', `margem ${tipo}`,
      pctTexto(antes), pctTexto(MARGEM[tipo]))
  }

  restaurarMargens(): void {
    Object.assign(MARGEM, MARGEM_PADRAO)
    this.log('ajuste', 'precos', 'margens restauradas ao padrão')
  }

  definirValidade(ms: number): void {
    const antes = PARAMETROS.validadeMs
    PARAMETROS.validadeMs = Math.max(200, ms)
    this.log('ajuste', 'precos', 'validade da cotação', `${antes} ms`, `${PARAMETROS.validadeMs} ms`)
  }

  definirAceitandoOrdens(aceita: boolean): void {
    const antes = PARAMETROS.aceitandoOrdens
    PARAMETROS.aceitandoOrdens = aceita
    this.log('ajuste', 'precos', 'cotação da casa',
      antes ? 'aberta' : 'fechada', aceita ? 'aberta' : 'fechada')
  }

  definirValorMinimo(v: number): void {
    const antes = PARAMETROS.valorMinimo
    PARAMETROS.valorMinimo = Math.max(0.01, v)
    this.log('ajuste', 'precos', 'valor mínimo', antes, PARAMETROS.valorMinimo)
  }

  definirTicksMaximo(n: number): void {
    const antes = PARAMETROS.ticksMaximo
    PARAMETROS.ticksMaximo = Math.max(1, Math.round(n))
    this.log('ajuste', 'precos', 'duração máxima', `${antes} ticks`, `${PARAMETROS.ticksMaximo} ticks`)
  }

  /* ------------------------------------------------------------- motor */

  ajustarInstrumento(codigo: string, patch: Partial<Instrumento>): void {
    const motor = this.motores()[codigo]
    if (!motor) return
    const antes = { ...motor.instrumento }
    motor.ajustar(patch)
    for (const chave of Object.keys(patch) as Array<keyof Instrumento>) {
      if (antes[chave] === patch[chave]) continue
      const serieMudou = chave === 'volatilidade' || chave === 'casas'
      this.log(serieMudou && motor.tamanhoDaSerie > 0 ? 'quebra' : 'ajuste',
        'motor', `${codigo} · ${chave}`, antes[chave], patch[chave])
    }
  }

  ligarMotor(codigo: string): void {
    this.motores()[codigo]?.ligar()
    this.log('ajuste', 'motor', `${codigo} · gerador`, 'parado', 'rodando')
  }

  pararMotor(codigo: string): void {
    this.motores()[codigo]?.parar()
    this.log('ajuste', 'motor', `${codigo} · gerador`, 'rodando', 'parado')
  }

  passo(codigo: string): void {
    const t = this.motores()[codigo]?.passo()
    this.log('rotina', 'motor', `${codigo} · passo manual`, undefined,
      t ? `tick ${t.n} · ${t.preco}` : 'sem fluxo')
  }

  definirVelocidade(codigo: string, v: number): void {
    const motor = this.motores()[codigo]
    if (!motor) return
    const antes = motor.velocidade
    motor.definirVelocidade(v)
    this.log('ajuste', 'motor', `${codigo} · velocidade`, `${antes}×`, `${motor.velocidade}×`)
  }

  forcarDigitos(codigo: string, digitos: number[]): void {
    const motor = this.motores()[codigo]
    if (!motor || digitos.length === 0) return
    motor.forcarDigitos(digitos)
    this.log('quebra', 'motor', `${codigo} · dígitos forçados`, 'série honesta',
      digitos.join(', '))
  }

  limparForcados(codigo: string): void {
    this.motores()[codigo]?.limparForcados()
    this.log('ajuste', 'motor', `${codigo} · fila de dígitos forçados limpa`)
  }

  /* ------------------------------------------------------------ rodada */

  async novaRodada(codigo: string, sementeCliente?: string): Promise<void> {
    const motor = this.motores()[codigo]
    if (!motor) return
    const estava = motor.rodando
    const antes = motor.provaPublica?.hash?.slice(0, 12)
    const c = await motor.abrirRodada(sementeCliente || undefined)
    if (estava) motor.ligar()
    this.log('ajuste', 'rodada', `${codigo} · rodada nova`,
      antes ? `hash ${antes}…` : 'nenhuma', `hash ${c.hash.slice(0, 12)}…`)
  }

  revelarAgora(codigo: string): string | null {
    const motor = this.motores()[codigo]
    const c = motor?.revelarAgora()
    if (!c) return null
    this.log('quebra', 'rodada', `${codigo} · semente revelada com a rodada aberta`,
      'oculta', `${c.sementeCasa.slice(0, 16)}…`)
    return c.sementeCasa
  }

  /**
   * Refaz a série do zero a partir das sementes e compara com a que foi
   * servida. É o mesmo cálculo que o cliente roda — a diferença é que aqui
   * dá para rodar antes de alguém reclamar.
   */
  async verificar(codigo: string): Promise<{ ok: boolean; conferidos: number; primeiraDivergencia: number | null }> {
    const motor = this.motores()[codigo]
    if (!motor) return { ok: false, conferidos: 0, primeiraDivergencia: null }
    const c = motor.compromissoInterno
    const servida = motor.historico(5_000)
    if (!c || servida.length === 0) return { ok: false, conferidos: 0, primeiraDivergencia: null }

    // a série servida pode ter sido cortada no teto de memória; conferimos
    // desde o primeiro tick que ainda temos
    const ate = servida[servida.length - 1].n
    const refeita = await MotorDeTicks.reproduzir(
      motor.instrumento, c.sementeCasa, c.sementeCliente, ate,
    )
    let primeira: number | null = null
    let conferidos = 0
    for (const t of servida) {
      const r = refeita[t.n - 1]
      if (!r) continue
      conferidos += 1
      if (r.preco !== t.preco && primeira === null) primeira = t.n
    }
    const ok = primeira === null
    this.log(ok ? 'rotina' : 'quebra', 'rodada', `${codigo} · verificação da série`,
      `${conferidos} ticks`, ok ? 'bate' : `diverge no tick ${primeira}`)
    return { ok, conferidos, primeiraDivergencia: primeira }
  }

  /* ------------------------------------------------------------ dinheiro */

  depositar(clienteId: string, valor: number): void {
    this.livro.depositar(clienteId, valor)
    this.log('dinheiro', 'razao', `depósito · ${clienteId}`, undefined, valor)
  }

  sacar(clienteId: string, valor: number): void {
    this.livro.sacar(clienteId, valor)
    this.log('dinheiro', 'razao', `saque · ${clienteId}`, undefined, valor)
  }

  ajustarManual(clienteId: string, valor: number, motivo: string): void {
    this.livro.ajustarManual(clienteId, valor, motivo)
    this.log('dinheiro', 'razao', `ajuste manual · ${clienteId} · ${motivo}`, undefined, valor)
  }

  cancelarContrato(id: string, motivo: string): void {
    const c = this.livro.cancelar(id, motivo || 'sem motivo informado')
    this.log('dinheiro', 'razao', `contrato ${id} cancelado · ${motivo}`,
      `${c.clienteId} · ${c.valor}`, 'entrada devolvida')
  }

  liquidarForcado(id: string, venceu: boolean, motivo: string): void {
    const c = this.livro.liquidarForcado(id, venceu, motivo || 'liquidação manual')
    this.log('quebra', 'razao', `contrato ${id} liquidado à mão`,
      `tick ${c.tickLiquidacao} não consultado`, venceu ? 'cliente ganhou' : 'casa ganhou')
  }

  /* ------------------------------------------------------------ auditoria */

  get auditoria() { return auditoria }
}

const rotulo = (v: number) => (Number.isFinite(v) ? String(v) : '∞')
const pctTexto = (v: number) => `${(v * 100).toFixed(1)}%`
