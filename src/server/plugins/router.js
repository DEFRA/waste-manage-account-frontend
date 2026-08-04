import { home } from '../routes/home/index.js'
import { about } from '../routes/about/index.js'
import { health } from '../routes/health/index.js'
import { authRoutes } from '../routes/auth/index.js'

export const router = {
  plugin: {
    name: 'router',
    async register(server) {
      // Health-check route. Used by platform to check if service is running, do not remove!
      await server.register([health])

      // Application specific routes, add your own routes here
      await server.register([home, about, authRoutes])
    }
  }
}
