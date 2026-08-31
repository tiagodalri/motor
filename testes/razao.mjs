/**
 * Testes de propriedade da razão.
 *
 * Não testam casos escolhidos a dedo: sorteiam milhares de sequências de
 * operações e verificam que as invariantes valem em todas. É o tipo de
 * teste que pega o erro que ninguém pensou em escrever.
 *
 * Rodar com:  node testes/razao.mjs
 */

// ---- cópia mínima da razão, em JS, para o teste rodar sem build
const centavos = (v) => Math.round(v * 100)

class Razao {
  constructor() { this.lancamentos = []; this.chaves = new Set(); this.proximoId = 1 }
  lancar(chave, descricao, linhas) {
    if (this.chaves.has(chave)) throw new Error('chave repetida')
    const soma = linhas.reduce((t, l) => t + centavos(l.valor), 0)
    if (soma !== 0) throw new Error('desbalanceado')
    const l = { id: this.proximoId++, chave, quando: Date.now(), descricao, linhas }
    this.lancamentos.push(l); this.chaves.add(chave); return l
  }
  saldo(conta) {
    let t = 0
    for (const l of this.lancamentos) for (const x of l.linhas) if (x.conta === conta) t += centavos(x.valor)
    return t / 100
  }
  contas() {
    const s = new Set()
    for (const l of this.lancamentos) for (const x of l.linhas) s.add(x.conta)
    return [...s]
  }
  fecha() {
    let t = 0
    for (const l of this.lancamentos) for (const x of l.linhas) t += centavos(x.valor)
    return t === 0
  }
}

// ---- gerador simples e reprodutível
let semente = 12345
const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648 }
const entre = (a, b) => a + rnd() * (b - a)
const dinheiro = () => Number(entre(0.35, 500).toFixed(2))

let falhas = 0
const checar = (nome, ok) => {
  if (!ok) { console.log(`  ✗ ${nome}`); falhas += 1 }
}

// ---------------------------------------------------------------- 1
console.log('1. o livro sempre fecha em zero, faça o que fizer')
for (let rodada = 0; rodada < 500; rodada += 1) {
  const r = new Razao()
  const nOps = Math.floor(entre(1, 60))
  for (let i = 0; i < nOps; i += 1) {
    const v = dinheiro()
    const cliente = `cliente:${Math.floor(entre(1, 6))}`
    const tipo = Math.floor(entre(0, 3))
    try {
      if (tipo === 0) {
        r.lancar(`dep-${rodada}-${i}`, 'depósito',
          [{ conta: 'externo', valor: -v }, { conta: cliente, valor: v }])
      } else if (tipo === 1) {
        r.lancar(`ap-${rodada}-${i}`, 'aposta',
          [{ conta: cliente, valor: -v }, { conta: 'emJogo', valor: v }])
      } else {
        const pag = Number((v * 2.22).toFixed(2))
        r.lancar(`pg-${rodada}-${i}`, 'pagamento', [
          { conta: 'emJogo', valor: -v },
          { conta: 'casa', valor: v - pag },
          { conta: cliente, valor: pag },
        ])
      }
    } catch { /* recusa é comportamento válido */ }
  }
  checar(`rodada ${rodada} fecha`, r.fecha())
}

// ---------------------------------------------------------------- 2
console.log('2. lançamento que não fecha em zero é recusado')
{
  const r = new Razao()
  let recusou = false
  try {
    r.lancar('x', 'torto', [{ conta: 'a', valor: 10 }, { conta: 'b', valor: -9 }])
  } catch { recusou = true }
  checar('recusa desbalanceado', recusou)
  checar('nada foi registrado', r.lancamentos.length === 0)
}

// ---------------------------------------------------------------- 3
console.log('3. a mesma chave nunca cobra duas vezes')
{
  const r = new Razao()
  const linhas = [{ conta: 'cliente:1', valor: -10 }, { conta: 'emJogo', valor: 10 }]
  r.lancar('ordem-42', 'aposta', linhas)
  let recusou = false
  try { r.lancar('ordem-42', 'aposta', linhas) } catch { recusou = true }
  checar('segunda tentativa recusada', recusou)
  checar('cobrou uma vez só', r.saldo('cliente:1') === -10)
}

// ---------------------------------------------------------------- 4
console.log('4. o saldo é a soma do extrato, sempre')
for (let rodada = 0; rodada < 200; rodada += 1) {
  const r = new Razao()
  const conta = 'cliente:7'
  let esperado = 0
  for (let i = 0; i < 40; i += 1) {
    const v = dinheiro()
    r.lancar(`m-${rodada}-${i}`, 'movimento',
      [{ conta, valor: v }, { conta: 'casa', valor: -v }])
    esperado = Number((esperado + v).toFixed(2))
  }
  checar(`rodada ${rodada} bate`, Math.abs(r.saldo(conta) - esperado) < 0.005)
}

// ---------------------------------------------------------------- 5
console.log('5. centavos não evaporam em milhares de somas')
{
  const r = new Razao()
  for (let i = 0; i < 3000; i += 1) {
    r.lancar(`c-${i}`, 'centavo',
      [{ conta: 'cliente:1', valor: 0.01 }, { conta: 'casa', valor: -0.01 }])
  }
  checar('soma exata de 3000 centavos', r.saldo('cliente:1') === 30)
  checar('a casa espelha', r.saldo('casa') === -30)
  checar('fecha', r.fecha())
}

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`)
process.exit(falhas === 0 ? 0 : 1)
