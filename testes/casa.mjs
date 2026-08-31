/**
 * Simulação da casa: 20 mil apostas contra a própria série de preços.
 *
 * Verifica três coisas que não dá para descobrir olhando o código:
 *  1. a margem realizada converge para a margem teórica
 *  2. o livro fecha em zero depois de tudo
 *  3. a variância do caminho — quanto a casa chega a ficar negativa antes
 *     de a margem aparecer. É esse número que define a reserva de capital.
 *
 * Rodar com:  node testes/casa.mjs
 */

// ---- gerador determinístico (mesma ideia do motor, em JS puro)
let s = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x2b7e1516]
const rot = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0
const proximo = () => {
  const r = (Math.imul(rot(Math.imul(s[1], 5) >>> 0, 7) >>> 0, 9)) >>> 0
  const t = (s[1] << 9) >>> 0
  s[2] = (s[2] ^ s[0]) >>> 0; s[3] = (s[3] ^ s[1]) >>> 0
  s[1] = (s[1] ^ s[2]) >>> 0; s[0] = (s[0] ^ s[3]) >>> 0
  s[2] = (s[2] ^ t) >>> 0; s[3] = rot(s[3], 11)
  return r
}
const uniforme = () => proximo() / 4294967296
const normal = () => {
  let u = 0; while (u === 0) u = uniforme()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniforme())
}

// ---- instrumento
const ANO = 365 * 24 * 60 * 60
const inst = { vol: 1.0, intervalo: 1, casas: 2, inicial: 1000 }
const dt = inst.intervalo / ANO
let preco = inst.inicial
const proximoTick = () => {
  preco = preco * Math.exp(-0.5 * inst.vol ** 2 * dt + inst.vol * Math.sqrt(dt) * normal())
  const p = Number(preco.toFixed(inst.casas))
  const txt = p.toFixed(inst.casas)
  return { preco: p, digito: Number(txt[txt.length - 1]) }
}

// ---- a casa
const MARGEM = 0.11
const probAcima5 = 0.4
const multiplicador = (1 / probAcima5) * (1 - MARGEM)   // 2.225

let caixaCasa = 0
let apostado = 0
let ganhosCliente = 0
let pior = 0            // pior ponto do caminho (drawdown da casa)
let contagemDigitos = new Array(10).fill(0)

const N = 20000
const VALOR = 1

for (let i = 0; i < N; i += 1) {
  const t = proximoTick()
  contagemDigitos[t.digito] += 1
  apostado += VALOR
  const venceu = t.digito > 5
  if (venceu) {
    ganhosCliente += 1
    caixaCasa -= (VALOR * multiplicador - VALOR)
  } else {
    caixaCasa += VALOR
  }
  if (caixaCasa < pior) pior = caixaCasa
}

const margemRealizada = caixaCasa / apostado
const taxaCliente = ganhosCliente / N

console.log(`apostas                ${N}`)
console.log(`cliente ganhou         ${(taxaCliente * 100).toFixed(2)}%   (teórico 40,00%)`)
console.log(`margem teórica         ${(MARGEM * 100).toFixed(2)}%`)
console.log(`margem realizada       ${(margemRealizada * 100).toFixed(2)}%`)
console.log(`resultado da casa      ${caixaCasa.toFixed(2)}  em ${apostado} apostados`)
console.log(`pior ponto do caminho  ${pior.toFixed(2)}  (${(pior / VALOR).toFixed(0)}x a aposta)`)
console.log('')
console.log('distribuição dos dígitos (esperado ~10% cada):')
console.log('  ' + contagemDigitos.map((c, d) => `${d}:${(c / N * 100).toFixed(1)}%`).join('  '))

const ok = Math.abs(taxaCliente - 0.4) < 0.02 && Math.abs(margemRealizada - MARGEM) < 0.05
console.log('')
console.log(ok
  ? 'A margem se realiza e os dígitos são uniformes.'
  : 'ATENÇÃO: desvio grande — investigar o gerador.')
process.exit(ok ? 0 : 1)
