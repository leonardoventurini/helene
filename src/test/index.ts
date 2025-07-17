import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinonChai from 'sinon-chai'
import chaiSubset from 'chai-subset'
import { JSDOM } from 'jsdom'

/**
 * We manually create a JSDOM instance and assign it to the global object,
 * since otherwise it might interfere with SockJS implementation.
 * @type {module:jsdom.JSDOM}
 */
const dom = new JSDOM('', {
  url: 'http://localhost',
})

global.window = dom.window
global.document = dom.window.document

import 'chai/register-expect.js'
import 'chai/register-should.js'
import 'chai/register-assert.js'

chai.use(chaiAsPromised)
chai.use(sinonChai)
chai.use(chaiSubset)
