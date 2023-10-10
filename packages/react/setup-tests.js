const jsdomGlobal = require('jsdom-global')

jsdomGlobal(undefined, {
  url: 'http://localhost',
})

global.addEventListener = undefined
