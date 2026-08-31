/**
 * Nomes dos robos.
 *
 * A Deriv identifica cada execucao por um numero (run_id) e nao guarda
 * nome. A Teeds guarda o apelido no navegador, associado a esse numero.
 */

const CHAVE = 'teeds.robos.nomes'

type Mapa = Record<string, string>

function ler(): Mapa {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || '{}') as Mapa
  } catch {
    return {}
  }
}

function gravar(m: Mapa): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(m))
  } catch {
    /* navegador sem armazenamento: seguimos sem nomes salvos */
  }
}

export function nomeDoRobo(runId: string, padrao = ''): string {
  return ler()[runId] || padrao
}

export function batizarRobo(runId: string, nome: string): void {
  const m = ler()
  const limpo = nome.trim().slice(0, 40)
  if (limpo) m[runId] = limpo
  else delete m[runId]
  gravar(m)
}

export function todosOsNomes(): Mapa {
  return ler()
}

/** Sugere o proximo nome livre para um modelo: "Acima de 5", "Acima de 5 (2)"... */
export function sugerirNome(base: string): string {
  const usados = new Set(Object.values(ler()))
  if (!usados.has(base)) return base
  for (let i = 2; i < 100; i++) {
    const tentativa = `${base} (${i})`
    if (!usados.has(tentativa)) return tentativa
  }
  return base
}

/* ------------------------------------------------------------------ origem
 * A Deriv marca com `auto_run_id` so os contratos comprados pelos robos de
 * servidor. O que o motor da Teeds compra chega ao historico indistinguivel
 * de uma compra manual — entao a propria Teeds anota, no navegador, qual
 * contrato saiu de qual robo.
 */

const CHAVE_ORIGEM = 'teeds.contratos.origem'
const LIMITE = 800

function lerOrigens(): Mapa {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_ORIGEM) || '{}') as Mapa
  } catch {
    return {}
  }
}

/** Anota que este contrato foi comprado por um robo da Teeds. */
export function marcarOrigem(contractId: number, nome: string): void {
  const m = lerOrigens()
  m[String(contractId)] = nome
  // mantem o arquivo pequeno: so os mais recentes interessam
  const chaves = Object.keys(m)
  if (chaves.length > LIMITE) {
    for (const k of chaves.sort((a, b) => Number(a) - Number(b)).slice(0, chaves.length - LIMITE)) {
      delete m[k]
    }
  }
  try {
    localStorage.setItem(CHAVE_ORIGEM, JSON.stringify(m))
  } catch {
    /* sem armazenamento: a operacao aparece como manual */
  }
}

/** Nome do robo da Teeds que comprou este contrato, se houver. */
export function origemDoContrato(contractId: number): string | null {
  return lerOrigens()[String(contractId)] ?? null
}

/** Todas as marcacoes de uma vez, para listas grandes. */
export function todasAsOrigens(): Mapa {
  return lerOrigens()
}
