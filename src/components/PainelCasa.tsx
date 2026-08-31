import type { Livro } from '../core/motor/livro'

interface Props {
  livro: Livro
  instrumento: string
}

const din = (v: number) =>
  `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const pct = (v: number) => `${(v * 100).toFixed(2)}%`

/**
 * A visão da casa — o que o cliente nunca vê.
 *
 * Três perguntas: quanto estou devendo se tudo der errado agora
 * (exposição), a margem está se realizando, e o livro fecha.
 */
export function PainelCasa({ livro, instrumento }: Props) {
  const casa = livro.livroDaCasa
  const risco = livro.risco
  const buckets = risco.bucketsQuentes(6)
  const suspenso = risco.suspensao(instrumento)
  const minuto = risco.resultadoDoMinuto
  const tetoBucket = risco.limites.exposicaoPorBucket

  return (
    <div className="casa">
      <div className="casa-topo">
        <div>
          <h2>Livro da casa</h2>
          <p className="casa-sub">
            O outro lado de cada aposta. Aqui a pergunta não é se você ganhou —
            é quanto você deve se tudo liquidar contra a casa agora.
          </p>
        </div>
        <span className={`casa-selo ${casa.fecha ? 'ok' : 'nao'}`}>
          {casa.fecha ? 'Livro fecha' : 'LIVRO NÃO FECHA'}
        </span>
      </div>

      {suspenso && (
        <div className="casa-disjuntor">
          <b>Disjuntor aberto.</b> {suspenso.motivo} Religa sozinho em alguns minutos,
          ou <button onClick={() => risco.religar(instrumento)}>religar agora</button>.
        </div>
      )}

      <div className="casa-numeros">
        <div>
          <span className="rot">Resultado da casa</span>
          <strong className={casa.resultado >= 0 ? 'up' : 'down'}>{din(casa.resultado)}</strong>
          <em>em {casa.contratos.toLocaleString('pt-BR')} contratos liquidados</em>
        </div>
        <div>
          <span className="rot">Margem realizada</span>
          <strong className={casa.margemRealizada >= 0 ? 'up' : 'down'}>
            {casa.apostado > 0 ? pct(casa.margemRealizada) : '—'}
          </strong>
          <em>esperada {din(casa.margemEsperada)} · veio {din(casa.resultado)}</em>
        </div>
        <div>
          <span className="rot">Exposição agora</span>
          <strong>{din(casa.exposicao)}</strong>
          <em>o que sai do caixa se tudo der errado</em>
        </div>
        <div>
          <span className="rot">Preso em contratos</span>
          <strong>{din(casa.emJogo)}</strong>
          <em>dinheiro do cliente ainda em jogo</em>
        </div>
      </div>

      <section className="casa-bloco">
        <span className="rot">Exposição por tick de liquidação</span>
        <p className="casa-nota">
          Este é o risco que quebra a casa. Contratos que expiram no mesmo tick
          liquidam juntos: ou paga todos, ou nenhum. Não há diversificação.
          Teto por tick: {din(tetoBucket)}.
        </p>
        {buckets.length === 0 ? (
          <p className="casa-vazio">Nenhum contrato aberto.</p>
        ) : (
          <div className="casa-buckets">
            {buckets.map((b) => {
              const cheio = Math.min(1, b.exposicao / tetoBucket)
              return (
                <div key={`${b.instrumento}-${b.tick}`} className="casa-bucket">
                  <span className="casa-bucket-nome">{b.instrumento} · tick {b.tick}</span>
                  <div className="casa-barra">
                    <i style={{ width: `${cheio * 100}%` }}
                      className={cheio > 0.8 ? 'perigo' : cheio > 0.5 ? 'atencao' : ''} />
                  </div>
                  <span className="casa-bucket-valor">{din(b.exposicao)}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="casa-bloco">
        <span className="rot">Último minuto</span>
        <div className="casa-minuto">
          <strong className={minuto >= 0 ? 'up' : 'down'}>{din(minuto)}</strong>
          <span>
            o disjuntor abre se a casa perder {din(risco.limites.sangriaPorMinuto)} em um minuto
          </span>
        </div>
      </section>

      <section className="casa-bloco">
        <span className="rot">Razão — últimos lançamentos</span>
        <p className="casa-nota">
          Partidas dobradas. Saldo é derivado desta lista, nunca guardado como
          número. Se a soma de tudo não fosse zero, o selo lá em cima estaria vermelho.
        </p>
        <div className="casa-razao">
          {livro.razao.todos(14).map((l) => (
            <div key={l.id} className="casa-lanc">
              <span className="casa-lanc-id">#{l.id}</span>
              <span className="casa-lanc-desc">{l.descricao}</span>
              <span className="casa-lanc-linhas">
                {l.linhas.map((x, i) => (
                  <em key={i} className={x.valor >= 0 ? 'up' : 'down'}>
                    {x.conta} {din(x.valor)}
                  </em>
                ))}
              </span>
            </div>
          ))}
          {livro.razao.total === 0 && <p className="casa-vazio">Nada lançado ainda.</p>}
        </div>
      </section>
    </div>
  )
}
