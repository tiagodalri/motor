import { DERIV, LIMITS } from './config'
import type { ConnectionState, DerivMessage } from './types'

type Handler = (msg: DerivMessage) => void
type StateListener = (state: ConnectionState) => void

interface Pending {
  resolve: (msg: DerivMessage) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface ActiveStream {
  request: Record<string, unknown>
  handler: Handler
  reqId: number
  subscriptionId?: string
}

export interface TeedsSocketOptions {
  url?: string
  /** Reenviar as assinaturas ativas apos reconectar. Padrao: true. */
  resubscribe?: boolean
  /**
   * Devolve uma URL nova para a proxima tentativa de conexao.
   *
   * A conexao autenticada da Deriv usa um OTP de **uso unico** na propria
   * URL. Reconectar com a mesma URL falha para sempre — e a sessao morre
   * calada. Quem cria o socket passa aqui uma funcao que pede um OTP novo.
   */
  renovarUrl?: () => Promise<string>
}

/**
 * Nucleo de conexao da Teeds.
 *
 * Responsabilidades:
 *  - manter uma conexao WebSocket viva (ping periodico + reconexao com recuo exponencial)
 *  - correlacionar requisicao e resposta por req_id
 *  - gerenciar assinaturas (streams) e cancela-las com forget
 *  - normalizar erros da API em Error de verdade
 */
export class TeedsSocket {
  private ws: WebSocket | null = null
  private url: string
  private reqId = 0
  private pending = new Map<number, Pending>()
  private streams = new Map<number, ActiveStream>()
  private stateListeners = new Set<StateListener>()
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private attempts = 0
  private closedByUser = false
  private resubscribe: boolean
  private queue: string[] = []
  private renovarUrl?: () => Promise<string>
  private renovando = false
  /** Ultimo motivo de falha, para a tela poder explicar. */
  ultimoErro: string | null = null

  state: ConnectionState = 'idle'

  constructor(opts: TeedsSocketOptions = {}) {
    this.url = opts.url ?? DERIV.ws.public
    this.resubscribe = opts.resubscribe ?? true
    this.renovarUrl = opts.renovarUrl
  }

  // ---------------------------------------------------------------- conexao

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    this.closedByUser = false
    this.setState(this.attempts === 0 ? 'connecting' : 'reconnecting')

    const target = DERIV.appId && !this.url.includes('otp=')
      ? `${this.url}?app_id=${encodeURIComponent(DERIV.appId)}`
      : this.url

    const ws = new WebSocket(target)
    this.ws = ws

    ws.onopen = () => {
      this.attempts = 0
      this.setState('open')
      this.startPing()
      this.flushQueue()
      if (this.resubscribe) this.restoreStreams()
    }

    ws.onmessage = (event) => {
      let msg: DerivMessage
      try {
        msg = JSON.parse(event.data as string)
      } catch {
        return
      }
      this.route(msg)
    }

    ws.onclose = () => {
      this.stopPing()
      this.ws = null
      if (this.closedByUser) {
        this.setState('closed')
        return
      }
      this.scheduleReconnect()
    }

    ws.onerror = () => {
      // O evento de erro do WebSocket nao traz detalhes uteis;
      // o tratamento real acontece no onclose que vem em seguida.
    }
  }

  /** Encerra a conexao e limpa todo o estado pendente. */
  disconnect(): void {
    this.closedByUser = true
    this.stopPing()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.pending.forEach((p) => {
      clearTimeout(p.timer)
      p.reject(new Error('Conexao encerrada'))
    })
    this.pending.clear()
    this.streams.clear()
    this.ws?.close()
    this.ws = null
    this.setState('closed')
  }

  /** Troca a superficie de conexao (ex.: publica -> real com OTP). */
  async switchTo(url: string): Promise<void> {
    this.url = url
    this.closedByUser = true
    this.ws?.close()
    this.ws = null
    this.attempts = 0
    this.connect()
  }

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    listener(this.state)
    return () => this.stateListeners.delete(listener)
  }

  private setState(state: ConnectionState) {
    this.state = state
    this.stateListeners.forEach((l) => l(state))
  }

  private scheduleReconnect() {
    this.attempts += 1
    // Recuo exponencial com teto de 30s, como recomenda a documentacao.
    const delay = Math.min(1000 * 2 ** (this.attempts - 1), 30_000)
    this.setState('reconnecting')
    this.reconnectTimer = setTimeout(() => { void this.reconectar() }, delay)
  }

  /**
   * Derruba e refaz a conexao agora.
   *
   * Serve para o caso do socket "meio aberto": o navegador ainda acha que
   * esta ligado, mas nada mais chega. Sem isso o `onclose` nunca dispara e
   * a espera e infinita.
   */
  reconectarAgora(): void {
    if (this.closedByUser) return
    if (this.ws) {
      const antigo = this.ws
      this.ws = null
      antigo.onclose = null
      antigo.onmessage = null
      antigo.onerror = null
      try { antigo.close() } catch { /* ja estava fechado */ }
    }
    this.stopPing()
    this.setState('reconnecting')
    void this.reconectar()
  }

  /** Renova a credencial da URL, quando houver, e tenta de novo. */
  private async reconectar() {
    if (this.closedByUser) return
    if (this.renovarUrl && !this.renovando) {
      this.renovando = true
      try {
        this.url = await this.renovarUrl()
        this.ultimoErro = null
      } catch (e) {
        // sem credencial nova nao adianta conectar: espera o proximo ciclo
        this.ultimoErro = (e as Error).message
        this.renovando = false
        if (!this.closedByUser) this.scheduleReconnect()
        return
      }
      this.renovando = false
    }
    this.connect()
  }

  private startPing() {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ ping: 1 }))
      }
    }, LIMITS.pingIntervalMs)
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
  }

  // ---------------------------------------------------------------- envio

  private nextId(): number {
    this.reqId += 1
    return this.reqId
  }

  private raw(payload: Record<string, unknown>) {
    const text = JSON.stringify(payload)
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(text)
    else this.queue.push(text)
  }

  private flushQueue() {
    while (this.queue.length && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(this.queue.shift()!)
    }
  }

  /** Envia uma requisicao e resolve com a primeira resposta correspondente. */
  send(request: Record<string, unknown>, timeoutMs = 20_000): Promise<DerivMessage> {
    const req_id = this.nextId()
    const payload = { ...request, req_id }

    if (this.state === 'idle' || this.state === 'closed') this.connect()

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(req_id)
        reject(new Error(`Tempo esgotado ao aguardar resposta da Deriv (${Object.keys(request)[0]})`))
      }, timeoutMs)

      this.pending.set(req_id, { resolve, reject, timer })
      this.raw(payload)
    })
  }

  /**
   * Abre um stream. O handler recebe cada mensagem enquanto a assinatura viver.
   * Retorna uma funcao para cancelar (que envia forget e limpa o registro local).
   */
  subscribe(request: Record<string, unknown>, handler: Handler): () => void {
    if (this.streams.size >= LIMITS.maxSubscriptions) {
      throw new Error(`Limite de ${LIMITS.maxSubscriptions} assinaturas por conexao atingido`)
    }

    const req_id = this.nextId()
    const payload = { ...request, subscribe: 1, req_id }
    this.streams.set(req_id, { request, handler, reqId: req_id })

    if (this.state === 'idle' || this.state === 'closed') this.connect()
    this.raw(payload)

    return () => this.unsubscribe(req_id)
  }

  private unsubscribe(reqId: number) {
    const stream = this.streams.get(reqId)
    if (!stream) return
    this.streams.delete(reqId)
    if (stream.subscriptionId && this.ws?.readyState === WebSocket.OPEN) {
      this.raw({ forget: stream.subscriptionId })
    }
  }

  /** Cancela todos os streams de um tipo (ticks, candles...). */
  forgetAll(...types: string[]): void {
    this.raw({ forget_all: types.length === 1 ? types[0] : types })
    for (const [id, s] of this.streams) {
      const key = Object.keys(s.request)[0]
      if (types.includes(key)) this.streams.delete(id)
    }
  }

  private restoreStreams() {
    for (const stream of this.streams.values()) {
      stream.subscriptionId = undefined
      this.raw({ ...stream.request, subscribe: 1, req_id: stream.reqId })
    }
  }

  // ---------------------------------------------------------------- entrada

  private route(msg: DerivMessage) {
    const reqId = msg.req_id

    // Guarda o id da assinatura na primeira resposta, para poder cancelar depois.
    if (reqId !== undefined) {
      const stream = this.streams.get(reqId)
      if (stream) {
        if (msg.subscription?.id) stream.subscriptionId = msg.subscription.id
        if (msg.error) {
          this.streams.delete(reqId)
          stream.handler(msg)
          return
        }
        stream.handler(msg)
        return
      }

      const pending = this.pending.get(reqId)
      if (pending) {
        this.pending.delete(reqId)
        clearTimeout(pending.timer)
        if (msg.error) pending.reject(new Error(`[${msg.error.code}] ${msg.error.message}`))
        else pending.resolve(msg)
        return
      }
    }
  }
}

/** Conexao publica compartilhada: dados de mercado nao exigem autenticacao. */
export const publicSocket = new TeedsSocket({ url: DERIV.ws.public })
