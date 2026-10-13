// Minimal Express-style router on top of the Web Request/Response API used by Netlify Functions.
const jsonLimit = 32 * 1024
const rawLimit = 6 * 1024 * 1024

function compile(path) {
  const keys = []
  const pattern = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)' })
  return { regex: new RegExp(`^${pattern}/?$`), keys }
}

const serializeCookie = (name, value, options = {}) => {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? '/'}`]
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`)
    parts.push(`Expires=${new Date(Date.now() + options.maxAge).toUTCString()}`)
  }
  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  if (options.sameSite) parts.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`)
  return parts.join('; ')
}

class ResponseBuilder {
  constructor() {
    this.statusCode = 200
    this.headers = new Headers()
    this.body = null
    this.headersSent = false
  }
  status(code) { this.statusCode = code; return this }
  setHeader(name, value) { this.headers.set(name, value); return this }
  json(value) {
    this.headers.set('Content-Type', 'application/json; charset=utf-8')
    this.body = JSON.stringify(value)
    this.headersSent = true
    return this
  }
  send(body, contentType = 'application/octet-stream') {
    if (!this.headers.has('Content-Type')) this.headers.set('Content-Type', contentType)
    this.body = body
    this.headersSent = true
    return this
  }
  end() { this.headersSent = true; return this }
  cookie(name, value, options) { this.headers.append('Set-Cookie', serializeCookie(name, value, options)); return this }
  clearCookie(name, options = {}) { this.headers.append('Set-Cookie', serializeCookie(name, '', { ...options, maxAge: 0 })); return this }
  toResponse() {
    const body = this.statusCode === 204 || this.statusCode === 304 ? null : this.body
    return new Response(body, { status: this.statusCode, headers: this.headers })
  }
}

export class BodyError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

async function readBody(request) {
  if (['GET', 'HEAD'].includes(request.method)) return undefined
  const contentType = request.headers.get('content-type') ?? ''
  const buffer = Buffer.from(await request.arrayBuffer())
  if (contentType.includes('application/json')) {
    if (buffer.length > jsonLimit) throw new BodyError(413, 'Request body too large')
    if (!buffer.length) return undefined
    try { return JSON.parse(buffer.toString('utf8')) } catch { throw new BodyError(400, 'Invalid JSON body') }
  }
  if (buffer.length > rawLimit) throw new BodyError(413, 'Request body too large')
  return buffer.length ? buffer : undefined
}

export function createRouter() {
  const routes = []
  const middleware = []
  let errorHandler = null
  let notFoundHandler = null
  const router = {
    use(handler) { middleware.push(handler) },
    onError(handler) { errorHandler = handler },
    notFound(handler) { notFoundHandler = handler },
    async handle(webRequest, context = {}) {
      const url = new URL(webRequest.url)
      const response = new ResponseBuilder()
      const request = {
        method: webRequest.method,
        path: url.pathname,
        url,
        protocol: url.protocol.replace(':', ''),
        query: Object.fromEntries(url.searchParams),
        params: {},
        headers: { cookie: webRequest.headers.get('cookie') ?? '' },
        get: (name) => webRequest.headers.get(name) ?? undefined,
        ip: context.ip ?? webRequest.headers.get('x-nf-client-connection-ip') ?? 'unknown',
        body: undefined,
      }
      const runChain = async (handlers) => {
        for (const handler of handlers) {
          let advanced = false
          let forwardedError = null
          await handler(request, response, (error) => { advanced = true; forwardedError = error ?? null })
          if (forwardedError) throw forwardedError
          if (!advanced) return false
        }
        return true
      }
      try {
        const route = routes.find((candidate) => candidate.method === request.method && candidate.regex.test(request.path))
        if (!(await runChain(middleware))) return response.toResponse()
        if (!route) {
          if (notFoundHandler) await notFoundHandler(request, response)
          return response.toResponse()
        }
        const match = route.regex.exec(request.path)
        route.keys.forEach((key, index) => { request.params[key] = decodeURIComponent(match[index + 1]) })
        request.body = await readBody(webRequest)
        await runChain(route.handlers)
      } catch (error) {
        if (errorHandler) await errorHandler(error, request, response)
        else throw error
      }
      return response.toResponse()
    },
  }
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (path, ...handlers) => { routes.push({ method: method.toUpperCase(), ...compile(path), handlers }) }
  }
  return router
}
