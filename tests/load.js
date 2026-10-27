// Loads the browser engine scripts into an isolated context for Node tests.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE = ['util.js', 'data.js', 'cars.js', 'game.js', 'sales.js', 'business.js'];

function loadEngine(seed) {
  const store = {};
  const context = {
    console,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => (store[k] = String(v)),
      removeItem: (k) => delete store[k],
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ENGINE) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
    vm.runInContext(src, context, { filename: file });
  }
  if (seed !== undefined) context.DS.util.random = context.DS.util.seeded(seed);
  return context.DS;
}

module.exports = { loadEngine };
