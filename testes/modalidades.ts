/**
 * As modalidades de operação: dígitos, alta e baixa, e duração por tempo.
 *
 * O teste mais importante aqui é o da numeração do tick. A série é podada
 * para não crescer sem fim, e enquanto o número do tick saía do tamanho da
 * série, a poda fazia a numeração andar **para trás**. Com contrato de 1
 * tick isso nunca aparecia; com contrato de 5 minutos, o livro passaria a
 * liquidar na hora errada. É o tipo de bug que só existe depois que a
 * funcionalidade nova entra.
 *
 * Rodar com:  npm run testes
 */
import { Livro } from '../src/core/motor/livro'
import { MotorDeTicks, INSTRUMENTOS } from '../src/core/motor/ticks'
import { ESTRATEGIAS } from '../src/core/motor/robo'
import { ganhou, digitosQuePagam, probabilidade } from '../src/core/motor/precos'
import { ticksDe, relogio } from '../src/core/motor/duracoes'
import { agregar } from '../src/core/motor/velas'

const falhas: string[] = []
const checar = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}`)
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

async function principal() {
  console.log('\n1. os robôs ganham exatamente nos dígitos anunciados')
  for (const e of ESTRATEGIAS) {
    const pagam = digitosQuePagam(e.tipo, e.barreira)
    checar(`${e.nome} paga em ${e.digitos.join(', ')}`, igual(pagam, e.digitos))
    checar(`${e.nome} tem 30% de chance real`,
      Math.abs(probabilidade(e.tipo, e.barreira) - 0.3) < 1e-9)
    for (let d = 0; d <= 9; d += 1) {
      const deveria = e.digitos.includes(d)
      if (ganhou(e.tipo, e.barreira, d) !== deveria) {
        falhas.push(`${e.nome} errou no dígito ${d}`)
      }
    }
  }
  checar('AG7 e AG2 não pagam no mesmo dígito',
    ESTRATEGIAS[0].digitos.every((d) => !ESTRATEGIAS[1].digitos.includes(d)))

  console.log('\n2. alta e baixa liquidam pela direção do preço')
  checar('SUBIR ganha quando o preço sobe', ganhou('SUBIR', null, 0, 100, 101))
  checar('SUBIR perde quando o preço cai', !ganhou('SUBIR', null, 0, 100, 99))
  checar('SUBIR perde no empate', !ganhou('SUBIR', null, 0, 100, 100))
  checar('DESCER ganha quando o preço cai', ganhou('DESCER', null, 0, 100, 99))
  checar('DESCER perde no empate', !ganhou('DESCER', null, 0, 100, 100))

  console.log('\n3. duração por tempo vira número de tick')
  checar('5 min num instrumento de 1s são 300 ticks', ticksDe(300, 1) === 300)
  checar('5 min num instrumento de 2s são 150 ticks', ticksDe(300, 2) === 150)
  checar('nunca menos que um tick', ticksDe(0, 60) === 1)
  checar('o relógio conta certo', relogio(305) === '5:05' && relogio(3725) === '1:02:05')

  console.log('\n4. o número do tick não anda para trás quando a série é podada')
  const instrumento = { ...INSTRUMENTOS[3] }
  const motor = new MotorDeTicks(instrumento)
  await motor.abrirRodada('cliente', 'casa-fixa')
  let anterior = 0
  let ordemQuebrou = false
  for (let i = 0; i < 5_400; i += 1) {
    const t = motor.passo()!
    if (t.n !== anterior + 1) ordemQuebrou = true
    anterior = t.n
  }
  checar('5.400 ticks numerados em sequência, sem repetir', !ordemQuebrou)
  checar('o último tick é o 5.400', motor.ultimo?.n === 5_400)

  console.log('\n5. contrato longo liquida no tick certo')
  const livro = new Livro()
  livro.risco.cobertura = { modo: 'desligada', fracaoDoCaixa: 1, banca: 0 }
  livro.depositar('ana', 500)
  const motor2 = new MotorDeTicks({ ...INSTRUMENTOS[3] })
  await motor2.abrirRodada('cliente', 'casa-fixa-2')
  motor2.escutar((t) => { livro.liquidarTick(t) })
  motor2.passo()

  const duracao = ticksDe(300, 1) // 5 minutos
  const c = livro.apostar({
    clienteId: 'ana', motor: motor2,
    cotacao: livro.cotar({ tipo: 'SUBIR', valor: 10, ticks: duracao }),
  })
  checar('o contrato de 5 min vence 300 ticks à frente',
    c.tickLiquidacao === c.tickEntrada + 300)

  for (let i = 0; i < 299; i += 1) motor2.passo()
  checar('não liquidou antes da hora', livro.abertos('ana').length === 1)
  motor2.passo()
  checar('liquidou exatamente no tick de vencimento', livro.abertos('ana').length === 0)

  const fechado = livro.historico('ana')[0]
  checar('o resultado seguiu a direção do preço',
    fechado.ganhou === (fechado.precoSaida! > fechado.precoEntrada))
  checar('o livro fecha', livro.razao.fecha())

  console.log('\n6. velas agregam os ticks pela janela do relógio')
  const ticks = Array.from({ length: 100 }, (_, i) => ({
    n: i + 1, instrumento: 'V100', preco: 1000 + i, digito: i % 10, epoch: 1_700_000_000 + i,
  }))
  const velas = agregar(ticks, 15)
  checar('100 ticks de 1s viram 7 velas de 15s', velas.length === 7)
  checar('a vela abre no primeiro e fecha no último da janela',
    velas[1].open === velas[1].low && velas[1].close === velas[1].high)
  checar('as janelas caem em múltiplos do período',
    velas.every((v) => v.epoch % 15 === 0))
  checar('período de 1s devolve tick a tick', agregar(ticks, 1).length === 100)

  console.log(falhas.length === 0
    ? '\nTodas as modalidades conferem.'
    : `\n${falhas.length} falha(s): ${falhas.join(' · ')}`)
  if (falhas.length > 0) process.exit(1)
}

void principal()
