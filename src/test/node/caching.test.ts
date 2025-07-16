import { expect } from 'chai'
import { TestUtility } from '../test-utility'

describe('Caching', function () {
  const test = new TestUtility()

  it('should cache result in the server', async () => {
    let ephemeral = 0

    test.server.addMethod(
      'cached:method',
      () => {
        return ephemeral
      },
      { cache: true },
    )

    const firstResult = await test.client.call('cached:method')

    expect(firstResult).to.equal(0)

    ephemeral = 9000

    const sameParametersResult = await test.client.call('cached:method')

    expect(sameParametersResult).to.equal(0)

    const differentParametersResult = await test.client.call('cached:method', {
      test: true,
    })

    expect(differentParametersResult).to.equal(9000)

    ephemeral = 0

    const sameDifferentParametersResult = await test.client.call(
      'cached:method',
      {
        test: true,
      },
    )

    expect(sameDifferentParametersResult).to.equal(9000)
  })
})
