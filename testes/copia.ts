/**
 * Copy trade: a mecânica, e o que ela faz com o risco da casa.
 *
 * A parte da mecânica é chata e tem de estar certa em centavos:
 * dimensionar o sinal para a banca do seguidor, respeitar teto e mínimo,
 * parar no stop. Isso é função pura e se testa direto.
 *
 * A parte que interessa é a outra. **Copy trade concentra fluxo.** Dez
 * seguidores de um trader viram dez apostas no mesmo lado, no mesmo tick
 * de liquidação. Para a casa isso não é dez clientes — é um cliente dez
 * vezes maior, sem diversificação nenhuma. Esta simulação mede o tamanho
 * do efeito no pior caso do livro de cenários.
 *
 * Rodar com:  npm run testes
 */
import { Livro } from '../src/core/motor/livro'
import { CONTA } from '../src/core/motor/razao'
import { MotorDeTicks, INSTRUMENTOS } from '../src/core/motor/ticks'
import { ESTRATEGIAS, Robo } from '../src/core/motor/robo'
import { Copiador, dimensionar, type Sinal } from '../src/core/motor/copiar'
import { desempenho } from '../src/core/motor/desempenho'

const falhas: string[] = []
const checar = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}`)
}
const din = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const sinalBase: Sinal = {
  fonte: 'ag7', tipo: 'DIGITO_ACIMA', barreira: 6, ticks: 1,
  valor: 10, bancaDaFonte: 1_000,
}

async function principal() {
  console.log('\n1. o sinal é dimensionado para a banca do seguidor')
  checar('metade da banca do trader copia metade da aposta',
    dimensionar(sinalBase, { alocado: 500, modo: 'proporcional', valorFixo: 0,
      tetoPorOperacao: 1e9, stopLoss: 0 }) === 5)
  checar('um décimo da banca copia um décimo',
    dimensionar(sinalBase, { alocado: 100, modo: 'proporcional', valorFixo: 0,
      tetoPorOperacao: 1e9, stopLoss: 0 }) === 1)
  checar('o teto por operação corta a cópia',
    dimensionar({ ...sinalBase, valor: 400 }, { alocado: 1_000, modo: 'proporcional',
      valorFixo: 0, tetoPorOperacao: 50, stopLoss: 0 }) === 50)
  checar('nunca copia abaixo do mínimo da casa',
    dimensionar(sinalBase, { alocado: 1, modo: 'proporcional', valorFixo: 0,
      tetoPorOperacao: 1e9, stopLoss: 0 }) === 0.30)
  checar('modo fixo ignora o tamanho da aposta do trader',
    dimensionar({ ...sinalBase, valor: 400 }, { alocado: 1_000, modo: 'fixo',
      valorFixo: 2, tetoPorOperacao: 1e9, stopLoss: 0 }) === 2)

  console.log('\n2. o seguidor entra junto e o histórico bate com o livro')
  const instrumento = { ...INSTRUMENTOS[3] }
  const motor = new MotorDeTicks(instrumento)
  await motor.abrirRodada('cliente', 'casa-fixa-copia')
  const livro = new Livro()
  livro.risco.cobertura = { modo: 'desligada', fracaoDoCaixa: 1, banca: 0 }
  motor.escutar((t) => { livro.liquidarTick(t) })

  livro.depositar('trader', 1_000)
  livro.depositar('seguidor', 200)
  const robo = new Robo({ livro, motor, clienteId: 'trader', estrategia: ESTRATEGIAS[0] })
  const copia = new Copiador({
    livro, motor, clienteId: 'seguidor',
    config: { alocado: 200, modo: 'proporcional', valorFixo: 0.3, tetoPorOperacao: 20, stopLoss: 0 },
  })
  copia.seguir(robo.sinais, 'AG7')
  robo.ligar()
  for (let i = 0; i < 400; i += 1) motor.passo()

  const eRobo = robo.instantaneo
  const eCopia = copia.instantaneo
  checar('cada operação aceita do trader virou um sinal copiado',
    eCopia.copiadas + eCopia.recusadas + eCopia.ignoradas === eCopia.sinais)
  checar('o trader operou', eRobo.operacoes > 20)
  checar('o seguidor entrou junto na maioria', eCopia.copiadas > eRobo.operacoes * 0.5)

  const d = desempenho(livro, 'trader')
  checar('o histórico do trader confere com a razão',
    Math.abs(d.resultado - (livro.saldo('trader') - 1_000)) < 0.02 || livro.abertos('trader').length > 0)
  checar('o acerto do AG7 fica perto dos 30% anunciados',
    d.operacoes > 20 && Math.abs(d.acerto - 0.3) < 0.14)
  console.log(`        trader: ${d.operacoes} op · acerto ${(d.acerto * 100).toFixed(0)}%` +
    ` · resultado ${din(d.resultado)} · pior sequência ${d.piorSequencia}` +
    ` · pior queda ${din(d.piorQueda)}`)
  console.log(`        seguidor: ${eCopia.copiadas} copiadas · resultado ${din(eCopia.resultado)}`)
  checar('o livro fecha com trader e seguidor', livro.razao.fecha())

  console.log('\n3. o que a cópia faz com o risco da casa')
  console.log('    seguidores   pior caso do livro   ordens recusadas   aceitas')
  const medidas: Array<{ n: number; pior: number; recusadas: number; aceitas: number }> = []

  for (const seguidores of [0, 5, 20]) {
    const mt = new MotorDeTicks({ ...INSTRUMENTOS[3] })
    await mt.abrirRodada('cliente', 'casa-fixa-risco')
    const lv = new Livro()
    lv.risco.cobertura = { modo: 'caixa', fracaoDoCaixa: 0.25, banca: 1_000 }
    lv.risco.limites = {
      valorMaximo: 1e9, pagamentoMaximo: 1e9, exposicaoPorCliente: 1e9,
      perdaDiariaPorCliente: 1e9, exposicaoPorBucket: 1e9, sangriaPorMinuto: 1e9,
    }
    lv.risco.disjuntorAtivo = false
    mt.escutar((t) => { lv.liquidarTick(t) })

    lv.depositar('trader', 1_000)
    const r = new Robo({ livro: lv, motor: mt, clienteId: 'trader', estrategia: ESTRATEGIAS[0] })
    const copias: Copiador[] = []
    for (let i = 0; i < seguidores; i += 1) {
      const id = `seg${i}`
      lv.depositar(id, 300)
      const c = new Copiador({
        livro: lv, motor: mt, clienteId: id,
        config: { alocado: 300, modo: 'proporcional', valorFixo: 0.3, tetoPorOperacao: 30, stopLoss: 0 },
      })
      c.seguir(r.sinais, 'AG7')
      copias.push(c)
    }
    r.ligar()

    let pior = 0
    let respeitouOPiso = true
    let piorCaixa = Infinity
    for (let i = 0; i < 600; i += 1) {
      mt.passo()
      const p = lv.risco.piorCasoGlobal()
      if (p < pior) pior = p
      // A invariante de verdade: o pior caso cabe no piso de AGORA. O piso
      // anda com o caixa, e o caixa cresce com o lucro — comparar contra um
      // número fixo compararia coisas diferentes.
      if (p < lv.risco.piso - 0.01) respeitouOPiso = false
      if (lv.risco.caixa < piorCaixa) piorCaixa = lv.risco.caixa
    }
    if (!respeitouOPiso) falhas.push(`${seguidores} seguidores: o pior caso furou o piso`)
    if (piorCaixa <= 0) falhas.push(`${seguidores} seguidores: o caixa da casa zerou`)
    const recusadas = copias.reduce((t, c) => t + c.instantaneo.recusadas, 0)
    const aceitas = copias.reduce((t, c) => t + c.instantaneo.copiadas, 0)
      + r.instantaneo.operacoes
    medidas.push({ n: seguidores, pior, recusadas, aceitas })
    console.log(
      String(seguidores).padStart(13) + din(pior).padStart(21) +
      String(recusadas).padStart(19) + String(aceitas).padStart(10))
    if (!lv.razao.fecha()) falhas.push(`${seguidores} seguidores: o livro não fecha`)
    if (lv.razao.saldo(CONTA.casa) < -1_000) {
      falhas.push(`${seguidores} seguidores: a casa perdeu mais que a banca`)
    }
  }

  checar('mais seguidores aprofundam o pior caso do mesmo tick',
    medidas[2].pior < medidas[0].pior)
  checar('a cobertura recusa mais conforme o fluxo concentra',
    medidas[2].recusadas > medidas[1].recusadas && medidas[0].recusadas === 0)

  console.log(
    '\n    Copy trade não multiplica clientes, multiplica UM cliente. Vinte\n' +
    '    seguidores de um trader caem todos no mesmo tick, no mesmo lado —\n' +
    '    a casa não ganha diversificação nenhuma, só tamanho. É por isso que\n' +
    '    a cobertura passa a recusar cópia: ela é a única coisa entre esse\n' +
    '    fluxo e o caixa.')

  console.log(falhas.length === 0
    ? '\nA mecânica de cópia confere e a trava aguenta o fluxo concentrado.'
    : `\n${falhas.length} falha(s): ${falhas.join(' · ')}`)
  if (falhas.length > 0) process.exit(1)
}

void principal()
