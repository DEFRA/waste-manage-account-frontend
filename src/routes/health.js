// FR2: CDP platform liveness probe — must never be removed or altered.
// Public (spec §8 route map): the platform's health checker never signs in.
export const health = {
  method: 'GET',
  path: '/health',
  options: { auth: false },
  handler(_request, h) {
    return h.response({ message: 'success' }).code(200)
  }
}
