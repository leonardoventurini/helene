import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinonChai from 'sinon-chai'
import chaiSubset from 'chai-subset'

require('chai/register-expect.js')
require('chai/register-should.js')
require('chai/register-assert.js')

chai.use(chaiAsPromised)
chai.use(sinonChai)
chai.use(chaiSubset)
