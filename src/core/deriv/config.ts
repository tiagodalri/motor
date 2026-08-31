/**
 * Teeds - configuracao de conexao com a Deriv
 *
 * Tres superficies de WebSocket, conforme a documentacao oficial:
 *  - public: dados de mercado, sem autenticacao
 *  - demo/real: exigem uma URL com OTP obtida via REST
 */
export const DERIV = {
  restBase: 'https://api.derivws.com',
  ws: {
    public: 'wss://api.derivws.com/trading/v1/options/ws/public',
    demo: 'wss://api.derivws.com/trading/v1/options/ws/demo',
    real: 'wss://api.derivws.com/trading/v1/options/ws/real',
  },
  oauth: {
    authorize: 'https://auth.deriv.com/oauth2/auth',
    token: 'https://auth.deriv.com/oauth2/token',
  },
  /** App ID da Teeds, registrado no dashboard da Deriv. Identificador publico. */
  appId: '34gMUQCaYNX1M93Q7aq5R',
  /** Endereco de retorno registrado na Deriv - precisa bater exatamente. */
  redirectUri: 'https://tiagodalri.github.io/teeds/',
  /** Escopos concedidos ao app. */
  scopes: ['trade', 'account_manage', 'application_read'],
} as const

/**
 * Link de afiliado da Teeds na Deriv.
 *
 * Quem abre conta por aqui fica ligado a esta parceria — e as operacoes
 * feitas pela Teeds passam a gerar o markup de 3%.
 */
export const AFILIADO = 'https://t.deriv.link?t=W7L5WVEEQGHY'

/**
 * Ativos habilitados na Teeds. Por enquanto so os indices de volatilidade
 * de 1 segundo — sao os que operam 24 horas e tem tick a cada segundo.
 */
export const ATIVOS_PERMITIDOS = [
  '1HZ10V', '1HZ15V', '1HZ25V', '1HZ30V',
  '1HZ50V', '1HZ75V', '1HZ90V', '1HZ100V',
] as const

/** Limites publicados pela Deriv, que a Teeds respeita por conta propria. */
export const LIMITS = {
  maxRequestsPerSecond: 100,
  maxSubscriptions: 100,
  maxConnections: 5,
  pingIntervalMs: 30_000,
} as const
