import { assert } from 'chai'

describe('Browser Tests', function () {
  it('should run in the browser', function () {
    assert.equal(window.location.protocol, 'http:')

    console.log('Helene: Browser Test Complete')
  })
})
