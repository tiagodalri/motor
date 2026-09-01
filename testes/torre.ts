/**
 * A torre de controle mexe no sistema com ele rodando. Este teste existe
 * para responder a única pergunta que importa antes de deixar tudo solto:
 * *depois de puxar as alavancas perigosas, o livro ainda fecha?*
 *
 * Ajuste manual, cancelamento e liquidação forçada são as três operações
 * que movem dinheiro fora do fluxo normal. Elas podem estar erradas do
 * ponto de vista do negócio — dar dinheiro de graça é uma decisão ruim,
 * não um bug — mas nunca podem criar nem destruir valor. Se qualquer uma
 * delas quebrar a partida dobrada, existe um caminho para dinheiro nascer
 * do nada, e aí o problema deixa de ser de política e passa a ser de
 * contabilidade.
 *
 * Rodar com:  npm run testes
 */
import { Livro } from '../src/core/motor/livro'
import { CONTA } from '../src/core/motor/razao'
import { MotorDeTicks, INSTRUMENTOS } from '../src/core/motor/ticks'
import { MARGEM, PARAMETROS } from '../src/core/motor/precos'

const falhas: string[] = []
const checar = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}`)
}

const soma = (l: Livro) => l.razao.contas().reduce((t, c) => t + l.razao.saldo(c), 0)

async function principal() {
  const instrumento = { ...INSTRUMENTOS[3] }
  const motor = new MotorDeTicks(instrumento)
  await motor.abrirRodada('semente-de-teste')
  motor.passo()

  const livro = new Livro()
  livro.depositar('ana', 1000)
  livro.depositar('bruno', 1000)

  // limites folgados para o teste conseguir abrir posição
  livro.risco.limites = {
    ...livro.risco.limites, exposicaoPorCliente: 1e9, exposicaoPorBucket: 1e9,
  }

  console.log('\n1. as alavancas de dinheiro não furam a partida dobrada')

  const c1 = livro.apostar({ clienteId: 'ana', motor, cotacao: livro.cotar({ tipo: 'DIGITO_ACIMA', barreira: 5, valor: 10, ticks: 3 }) })
  const c2 = livro.apostar({ clienteId: 'bruno', motor, cotacao: livro.cotar({ tipo: 'DIGITO_ABAIXO', barreira: 5, valor: 25, ticks: 3 }) })
  const c3 = livro.apostar({ clienteId: 'ana', motor, cotacao: livro.cotar({ tipo: 'DIGITO_IGUAL', barreira: 7, valor: 5, ticks: 4 }) })

  livro.ajustarManual('ana', 250, 'cortesia de teste')
  checar('ajuste manual credita o cliente e debita a casa', livro.razao.saldo(CONTA.casa) === -250)
  checar('livro fecha depois do ajuste manual', Math.abs(soma(livro)) < 1e-9)

  livro.ajustarManual('bruno', -100, 'estorno de teste')
  checar('ajuste manual negativo debita o cliente', livro.saldo('bruno') === 1000 - 25 - 100)
  checar('livro fecha depois do ajuste negativo', Math.abs(soma(livro)) < 1e-9)

  console.log('\n2. cancelamento devolve exatamente a entrada')
  const antesDoCancelamento = livro.saldo('ana')
  livro.cancelar(c1.id, 'erro operacional de teste')
  checar('a entrada volta inteira', livro.saldo('ana') === Number((antesDoCancelamento + 10).toFixed(2)))
  checar('o contrato sai da exposição', livro.risco.exposicaoDoCliente('ana') === c3.exposicao)
  checar('livro fecha depois do cancelamento', Math.abs(soma(livro)) < 1e-9)
  checar('cancelar duas vezes é recusado', (() => {
    try { livro.cancelar(c1.id, 'de novo'); return false } catch { return true }
  })())

  console.log('\n3. liquidação forçada paga como a liquidação de verdade')
  const antesBruno = livro.saldo('bruno')
  livro.liquidarForcado(c2.id, true, 'teste')
  checar('cliente recebe o pagamento cheio', livro.saldo('bruno') === Number((antesBruno + c2.pagamento).toFixed(2)))
  checar('livro fecha depois da liquidação forçada', Math.abs(soma(livro)) < 1e-9)

  livro.liquidarForcado(c3.id, false, 'teste')
  checar('a entrada perdida vira receita da casa', livro.razao.saldo(CONTA.emJogo) === 0)
  checar('livro fecha com tudo liquidado', Math.abs(soma(livro)) < 1e-9)
  checar('liquidar duas vezes é recusado', (() => {
    try { livro.liquidarForcado(c3.id, true, 'de novo'); return false } catch { return true }
  })())

  console.log('\n4. as chaves da casa realmente fecham a porta')
  PARAMETROS.aceitandoOrdens = false
  checar('cotação fechada recusa ordem', (() => {
    try { livro.apostar({ clienteId: 'ana', motor, cotacao: livro.cotar({ tipo: 'DIGITO_PAR', valor: 1, ticks: 1 }) }); return false } catch { return true }
  })())
  PARAMETROS.aceitandoOrdens = true

  livro.risco.suspender('V100', 5, 'teste')
  checar('instrumento suspenso recusa ordem', (() => {
    try { livro.apostar({ clienteId: 'ana', motor, cotacao: livro.cotar({ tipo: 'DIGITO_PAR', valor: 1, ticks: 1 }) }); return false } catch { return true }
  })())
  livro.risco.religar('V100')

  console.log('\n5. margem negativa não quebra a contabilidade, só o negócio')
  MARGEM.DIGITO_PAR = -0.20
  const ruim = livro.cotar({ tipo: 'DIGITO_PAR', valor: 10, ticks: 1 })
  checar('a casa passa a pagar mais do que o justo', ruim.pagamento > 20)
  const c4 = livro.apostar({ clienteId: 'ana', motor, cotacao: ruim })
  livro.liquidarForcado(c4.id, true, 'teste')
  checar('mesmo perdendo dinheiro, o livro fecha', Math.abs(soma(livro)) < 1e-9)
  checar('e a casa fica negativa, como tem de ficar', livro.razao.saldo(CONTA.casa) < 0)
  MARGEM.DIGITO_PAR = 0.10

  console.log('\n6. dígito forçado realmente sai no tick — e suja a rodada')
  checar('rodada limpa antes de forçar', motor.adulterada === false)
  motor.forcarDigitos([7, 7])
  motor.passo()
  checar('o dígito servido é o forçado', motor.ultimo?.digito === 7)
  checar('a rodada fica marcada como adulterada', motor.adulterada === true)
  await motor.abrirRodada('outra-semente')
  checar('abrir rodada nova limpa a marca', motor.adulterada === false)

  console.log('\n7. a série continua reproduzível quando ninguém mexe')
  for (let k = 0; k < 400; k += 1) motor.passo()
  const servida = motor.historico(500)
  const refeita = await MotorDeTicks.reproduzir(
    instrumento, motor.revelar()!.sementeCasa, 'outra-semente', servida.length,
  )
  const divergencia = servida.findIndex((t, i) => refeita[i].preco !== t.preco)
  checar(`os ${servida.length} ticks refeitos batem com os servidos`, divergencia === -1)
  if (divergencia >= 0) {
    console.log(`      diverge no tick ${divergencia + 1}: servido ${servida[divergencia].preco}, refeito ${refeita[divergencia].preco}`)
  }

  console.log(
    falhas.length === 0
      ? '\nTudo certo: nenhuma alavanca da torre cria nem destrói dinheiro.'
      : `\n${falhas.length} falha(s): ${falhas.join(' · ')}`,
  )
  if (falhas.length > 0) process.exit(1)
}

void principal()
