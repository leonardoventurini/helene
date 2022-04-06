import { Server } from './server/server'

declare global {
  let Helene: Server

  namespace NodeJS {
    interface Global {
      Helene: Server
    }
  }
}
