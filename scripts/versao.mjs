// Anexa uma versao aos arquivos no index.html publicado, para que o navegador
// sempre pegue a versao nova mesmo com nomes de arquivo fixos.
import { readFileSync, writeFileSync } from 'node:fs'

const arquivo = 'docs/index.html'
const v = Date.now().toString(36)
let html = readFileSync(arquivo, 'utf8')
html = html.replace(/(\/motor\/assets\/motor\.(?:js|css))(\?v=[^"']*)?/g, `$1?v=${v}`)
writeFileSync(arquivo, html)
console.log('versao publicada:', v)
