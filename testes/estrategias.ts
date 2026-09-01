/**
 * O catálogo do copy trade.
 *
 * Duas coisas separadas para conferir:
 *
 *  - a **regra** de cada estratégia é coerente com o que a vitrine promete
 *    (se o cartão diz "dígitos 7, 8 e 9", o contrato tem de pagar
 *    exatamente neles);
 *  - o **histórico** é determinístico. Um histórico que muda a cada
 *    recarregamento não é só feio: denuncia que o número não sai de lugar
 *    nenhum, e é o primeiro sinal que alguém procura para saber se uma
 *    vitrine de rentabilidade é inventada.
 *
 * Rodar com:  npm run testes
 */
import { PERFIS, historicoDemo, perfilPorId } from '../src/core/motor/estrategias'
import { digitosQuePagam, probabilidade } from '../src/core/motor/precos'

const falhas: string[] = []
const checar = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}`)
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const quando = new Date('2026-09-01')

function principal() {
  console.log('\n1. a regra bate com o que o cartão promete')
  for (const p of PERFIS) {
    if (p.regra.digitos.length > 0 && p.regra.tipo.startsWith('DIGITO')) {
      checar(`${p.nome} paga nos dígitos anunciados`,
        igual(digitosQuePagam(p.regra.tipo, p.regra.barreira), p.regra.digitos))
    }
    checar(`${p.nome} tem chance real entre 10% e 90%`, (() => {
      const pr = probabilidade(p.regra.tipo, p.regra.barreira)
      return pr >= 0.1 && pr <= 0.9
    })())
  }
  checar('todo perfil aponta para um instrumento',
    PERFIS.every((p) => ['V10', 'V25', 'V50', 'V100'].includes(p.instrumento)))
  checar('os ids são únicos', new Set(PERFIS.map((p) => p.id)).size === PERFIS.length)
  checar('perfilPorId encontra todos', PERFIS.every((p) => perfilPorId(p.id).nome === p.nome))

  console.log('\n2. o histórico de vitrine é determinístico')
  for (const p of PERFIS) {
    const a = historicoDemo(p, 182, 1_000, quando)
    const b = historicoDemo(p, 182, 1_000, quando)
    checar(`${p.nome} devolve sempre a mesma curva`, igual(a.curva, b.curva))
  }

  console.log('\n3. os números do histórico são coerentes entre si')
  for (const p of PERFIS) {
    const h = historicoDemo(p, 182, 1_000, quando)
    const somaDosDias = Number(h.dias.reduce((t, d) => t + d.resultado, 0).toFixed(2))
    checar(`${p.nome}: a curva termina na soma dos dias`,
      Math.abs(h.curva[h.curva.length - 1] - somaDosDias) < 0.05)
    checar(`${p.nome}: a soma dos meses bate com o total`,
      Math.abs(h.meses.reduce((t, m) => t + m.resultado, 0) - h.resultado) < 0.05)
    checar(`${p.nome}: a pior queda nunca é negativa`, h.piorQueda >= 0)
    checar(`${p.nome}: ganhos nunca passam das operações`, h.ganhos <= h.operacoes)
    checar(`${p.nome}: fica marcado como simulado`, h.simulado === true)
  }

  console.log('\n4. a vitrine tem ganhador e perdedor, como uma vitrine honesta teria')
  const retornos = PERFIS.map((p) => historicoDemo(p, 182, 1_000, quando).retorno)
  checar('pelo menos uma estratégia no lucro', retornos.some((r) => r > 0))
  checar('pelo menos uma estratégia no prejuízo', retornos.some((r) => r < 0))

  console.log('\n    Resumo da vitrine:')
  for (const p of PERFIS) {
    const h = historicoDemo(p, 182, 1_000, quando)
    console.log(
      `      ${p.nome.padEnd(11)}${p.instrumento.padEnd(6)}` +
      `${((h.retorno >= 0 ? '+' : '') + (h.retorno * 100).toFixed(1) + '%').padStart(8)}` +
      `   acerto ${(h.acerto * 100).toFixed(0)}%   pior queda ${h.piorQueda.toFixed(0)}` +
      `   ${h.operacoes.toLocaleString('pt-BR')} operações`)
  }

  console.log(falhas.length === 0
    ? '\nO catálogo confere e o histórico é reprodutível.'
    : `\n${falhas.length} falha(s): ${falhas.join(' · ')}`)
  if (falhas.length > 0) process.exit(1)
}

principal()
