interface Props {
  tamanho?: number
  compacto?: boolean
}

/** Marca da Teeds: o touro dourado sobre o selo escuro, com a palavra em serifa. */
export function Brand({ tamanho = 34, compacto = false }: Props) {
  return (
    <div className="marca">
      <span className="marca-selo" style={{ width: tamanho, height: tamanho }}>
        <img src={`${import.meta.env.BASE_URL}teeds-marca.png`} alt="" width={tamanho} height={tamanho} />
      </span>
      {!compacto && <span className="marca-nome">TEEDS</span>}
    </div>
  )
}
