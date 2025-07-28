import { ClientEvents, sleep } from '../../utils'
import { expect, describe, it } from 'vitest'
import { TestUtility } from '../test-utility'

describe('idleness', () => {
  const test = new TestUtility()

  it('should disconnect on idleness and reconnect upon interaction (websocket)', async () => {
    const client = await test.createClient({
      idlenessTimeout: 1000,
    })

    await client.waitFor(ClientEvents.WEBSOCKET_CLOSED)

    expect(client.clientSocket.socket).to.be.undefined

    await client.idleTimeout.reset()

    expect(client.clientSocket.socket.connected).to.be.true

    for (let i = 0; i < 20; i++) {
      await sleep(20)
      await client.idleTimeout.reset()
    }

    expect(client.clientSocket.socket.connected).to.be.true

    await client.close()
  }, 10000)

  it('should disconnect on idleness and reconnect upon interaction keeping authentication (websocket)', async () => {
    await test.client.close()

    test.server.setAuth({
      auth(context: any) {
        return context?.token ? { ...context, user: { _id: '42' } } : false
      },
      async logIn({ email, password }) {
        if (email === 'test@helene.test' && password === '123456') {
          return {
            token: 'test',
          }
        }
      },
    })

    test.server.addMethod('protected:method', async function () {
      return this.userId
    })

    const client = await test.createClient({
      idlenessTimeout: 1000,
    })

    await client.login({ email: 'test@helene.test', password: '123456' })

    expect(await client.call('protected:method')).to.equal('42')

    await client.waitFor(ClientEvents.WEBSOCKET_CLOSED)

    await sleep(10)

    expect(client.clientSocket.socket).to.be.undefined

    expect(test.server.allClients.size).to.equal(0)

    await client.idleTimeout.reset()

    expect(client.clientSocket.socket.connected).to.be.true

    for (let i = 0; i < 20; i++) {
      await sleep(50)
      await client.idleTimeout.reset()
    }

    expect(client.clientSocket.socket.connected).to.be.true

    expect(await client.call('protected:method')).to.equal('42')

    await client.close()
  }, 10000)
})
