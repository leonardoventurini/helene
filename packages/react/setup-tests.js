const { JSDOM } = require('jsdom')

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
global.navigator = dom.window.navigator
