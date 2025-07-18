import { JSDOM } from 'jsdom'

const dom = new JSDOM('', {
  url: 'http://localhost',
})

global.window = dom.window as any
global.document = dom.window.document as any
