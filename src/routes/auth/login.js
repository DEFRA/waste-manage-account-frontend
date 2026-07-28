import { beginLogin, respond } from '../../auth/service.js'

// FR-1: thin HTTP glue — parse the request, delegate the whole real-vs-stub
// dispatch and discovery-failure handling to service.beginLogin, render
// whatever BeginResult it returns.
export const login = {
  method: 'GET',
  path: '/auth/login',
  options: { auth: false },
  async handler(request, h) {
    const result = await beginLogin(request)
    return respond(h, result)
  }
}
