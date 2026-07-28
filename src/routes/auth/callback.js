import { completeLogin, respond } from '../../auth/service.js'

// FR-2: thin HTTP glue — the whole callback protocol (state/error/code
// checks, exchange, verify, session write, fail-closed policy) lives in
// service.completeLogin; this route just renders whatever it returns.
export const callback = {
  method: 'GET',
  path: '/auth/callback',
  options: { auth: false },
  async handler(request, h) {
    const result = await completeLogin(request)
    return respond(h, result)
  }
}
