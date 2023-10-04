const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const sinonChai = require('sinon-chai')
const chaiSubset = require('chai-subset')

require('chai/register-expect.js')
require('chai/register-should.js')
require('chai/register-assert.js')

chai.use(chaiAsPromised)
chai.use(sinonChai)
chai.use(chaiSubset)

const { after } = require('mocha')

// Needed for Bun as mocha --exit does not work
after(() => {
  setTimeout(() => {
    process.exit(0)
  }, 5000)
})
