/**
 * A casa sob carga: robôs de verdade contra o controle de cobertura.
 *
 * A pergunta é a que o Tiago fez: **dá para garantir que a casa nunca sai
 * negativa, sem mexer no sorteio?** A resposta é sim, e o preço é recusar
 * ordem. Esta simulação mede exatamente quanto se recusa.
 *
 * Três modos, duas populações:
 *
 *   desligada  a casa aceita tudo e torce. É o comportamento antigo.
 *   estrita    nenhum bucket pode ficar negativo em cenário nenhum.
 *   caixa      o pior caso somado de tudo que está aberto cabe numa
 *              fração do que a casa tem.
 *
 *   iguais     12 AG7 idênticos, todos apostando no mesmo lado
 *   variada    12 robôs espalhados por tipos e dígitos diferentes
 *
 * A diferença entre as duas populações é o ponto mais importante do
 * exercício, e vale mais que qualquer número: **a casa só consegue cobrir
 * uma aposta se existir alguém do outro lado.** Fluxo concentrado num lado
 * só não tem como ser coberto pela mesa — só pelo caixa.
 *
 * Rodar com:  npm run testes
 */
import { Livro } from '../src/core/motor/livro'
import { CONTA } from '../src/core/motor/razao'
import { MotorDeTicks, INSTRUMENTOS } from '../src/core/motor/ticks'
import { RoboAG7, type ConfigRobo } from '../src/core/motor/robo'
import { PARAMETROS, type TipoContrato } from '../src/core/motor/precos'
import type { ModoCobertura } from '../src/core/motor/cobertura'

const TICKS = 3_000
const ROBOS = 12
const BANCA_DO_CLIENTE = 200
const BANCA_DA_CASA = 1_000

const TIPOS: Array<{ tipo: TipoContrato; barreira: number }> = [
  { tipo: 'DIGITO_ACIMA', barreira: 5 },
  { tipo: 'DIGITO_ABAIXO', barreira: 4 },
  { tipo: 'DIGITO_PAR', barreira: 0 },
  { tipo: 'DIGITO_IMPAR', barreira: 0 },
  { tipo: 'DIGITO_DIFERENTE', barreira: 7 },
  { tipo: 'DIGITO_ACIMA', barreira: 3 },
  { tipo: 'DIGITO_ABAIXO', barreira: 6 },
  { tipo: 'DIGITO_IGUAL', barreira: 2 },
]

const din = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (v: number) => `${(v * 100).toFixed(1)}%`

interface Saida {
  aceitas: number
  recusadas: number
  resultadoDaCasa: number
  piorPontoDaCasa: number
  apostado: number
  robosQuebrados: number
  livroFecha: boolean
  garantiaValeu: boolean
}

async function rodada(modo: ModoCobertura, populacao: 'iguais' | 'variada'): Promise<Saida> {
  const instrumento = { ...INSTRUMENTOS[3] }
  const motor = new MotorDeTicks(instrumento)
  // A MESMA série de preços nos seis cenários: só assim a diferença entre
  // as linhas da tabela é a política, e não a sorte de cada rodada.
  await motor.abrirRodada('semente-do-cliente', 'semente-da-casa-fixa-para-comparar')

  const livro = new Livro()
  livro.risco.cobertura = { modo, fracaoDoCaixa: 0.25, banca: BANCA_DA_CASA }
  // as camadas antigas ficam folgadas: aqui quem decide é a cobertura
  livro.risco.limites = {
    valorMaximo: 1e9, pagamentoMaximo: 1e9, exposicaoPorCliente: 1e9,
    perdaDiariaPorCliente: 1e9, exposicaoPorBucket: 1e9, sangriaPorMinuto: 1e9,
  }
  livro.risco.disjuntorAtivo = false

  // a liquidação é ouvinte do motor e entra ANTES dos robôs: no mesmo
  // tick, primeiro liquida o que venceu, depois os robôs decidem
  motor.escutar((t) => { livro.liquidarTick(t) })

  const robos: RoboAG7[] = []
  for (let i = 0; i < ROBOS; i += 1) {
    const id = `robo${i + 1}`
    livro.depositar(id, BANCA_DO_CLIENTE)
    const alvo = populacao === 'iguais' ? TIPOS[0] : TIPOS[i % TIPOS.length]
    const config: Partial<ConfigRobo> = {
      valorBase: PARAMETROS.valorMinimo,
      galeApos: 3, fatorGale: 1, valorMaximo: 200,
      tipo: alvo.tipo, barreira: alvo.barreira, ticks: 1,
    }
    const r = new RoboAG7({ livro, motor, clienteId: id, config })
    r.ligar()
    robos.push(r)
  }

  let piorPonto = 0
  let garantiaValeu = true

  for (let n = 0; n < TICKS; n += 1) {
    motor.passo()
    const casa = livro.razao.saldo(CONTA.casa)
    if (casa < piorPonto) piorPonto = casa
    if (modo === 'desligada') continue

    // A promessa do modo caixa: a casa nunca perde mais que a banca que
    // declarou arriscar. No modo estrito, não perde nada.
    if (casa < -BANCA_DA_CASA) garantiaValeu = false
    if (modo === 'estrita' && casa < 0) garantiaValeu = false

    // E a invariante que sustenta as duas: o pior caso somado de tudo que
    // está aberto sempre cabe no piso de AGORA. O piso anda junto com o
    // caixa — conferir contra o piso do começo compararia coisas
    // diferentes, que foi o que esta simulação pegou na primeira rodada.
    if (livro.risco.piorCasoGlobal() < livro.risco.piso - 0.01) garantiaValeu = false
  }

  const estados = robos.map((r) => r.instantaneo)
  const casa = livro.livroDaCasa
  return {
    aceitas: estados.reduce((t, e) => t + e.operacoes, 0),
    recusadas: estados.reduce((t, e) => t + e.recusadas, 0),
    resultadoDaCasa: livro.razao.saldo(CONTA.casa),
    piorPontoDaCasa: piorPonto,
    apostado: casa.apostado,
    robosQuebrados: estados.filter((e) => !e.ligado).length,
    livroFecha: livro.razao.fecha(),
    garantiaValeu,
  }
}

async function principal() {
  const falhas: string[] = []
  for (const populacao of ['iguais', 'variada'] as const) {
    console.log(`\n${'='.repeat(78)}`)
    console.log(populacao === 'iguais'
      ? `POPULAÇÃO CONCENTRADA — ${ROBOS} AG7 no mesmo lado (dígito acima de 5)`
      : `POPULAÇÃO ESPALHADA — ${ROBOS} robôs em tipos e dígitos diferentes`)
    console.log('='.repeat(78))
    console.log(
      'modo'.padEnd(11) + 'ofertadas'.padStart(10) + 'aceitas'.padStart(10) +
      'aceite'.padStart(9) + 'casa'.padStart(12) + 'pior ponto'.padStart(13) +
      'garantia'.padStart(10))

    for (const modo of ['desligada', 'estrita', 'caixa'] as const) {
      const r = await rodada(modo, populacao)
      const ofertadas = r.aceitas + r.recusadas
      const taxa = ofertadas > 0 ? r.aceitas / ofertadas : 0
      console.log(
        modo.padEnd(11) +
        String(ofertadas).padStart(10) +
        String(r.aceitas).padStart(10) +
        pct(taxa).padStart(9) +
        din(r.resultadoDaCasa).padStart(12) +
        din(r.piorPontoDaCasa).padStart(13) +
        (modo === 'desligada' ? '—' : r.garantiaValeu ? 'ok' : 'FALHOU').padStart(10))

      if (!r.livroFecha) falhas.push(`${populacao}/${modo}: o livro não fecha`)
      if (modo !== 'desligada' && !r.garantiaValeu) {
        falhas.push(`${populacao}/${modo}: a garantia foi rompida`)
      }
      if (modo === 'estrita' && r.piorPontoDaCasa < 0) {
        falhas.push(`${populacao}/estrita: a casa ficou negativa em algum momento`)
      }
      if (modo === 'caixa' && r.piorPontoDaCasa < -BANCA_DA_CASA) {
        falhas.push(`${populacao}/caixa: a casa perdeu mais que a banca declarada`)
      }
    }
  }

  console.log(`\n${'-'.repeat(78)}`)
  console.log('Mesma série de preços nas seis linhas: a diferença é só a política.')
  console.log(
    '\n"ofertadas" conta tentativa, não intenção: ordem recusada volta no tick\n' +
    'seguinte, então no modo estrito o mesmo robô aparece 3.000 vezes.\n' +
    '\nO que a tabela mostra:\n' +
    '  · Fluxo concentrado num lado só não tem como ser coberto pela mesa.\n' +
    '    No modo estrito nada entra — não é bug, é a definição: sem alguém\n' +
    '    do outro lado, a casa só pode pagar do próprio bolso.\n' +
    '  · O modo caixa aceita quase tudo e ainda assim segura o piso: o pior\n' +
    '    ponto bate exatamente na fração do caixa que foi autorizada.\n' +
    '  · Sem cobertura a casa termina bem, mas passa por buracos fundos no\n' +
    '    meio do caminho. É o buraco que quebra a casa, não o saldo final.')
  console.log(falhas.length === 0
    ? 'A garantia se sustentou em todos os cenários, e o livro fechou em todos.'
    : `${falhas.length} problema(s):\n  ${falhas.join('\n  ')}`)
  if (falhas.length > 0) process.exit(1)
}

void principal()
