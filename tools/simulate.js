// Balance check: a scripted player runs a career and prints milestones.
// Usage: node tools/simulate.js [days] [seed]
const { loadEngine } = require('../tests/load');
const { playDay, manage } = require('../tests/bot');

const days = Number(process.argv[2]) || 200;
const seed = Number(process.argv[3]) || 7;
const DS = loadEngine(seed);
const G = DS.game;
const state = G.newGame('Bot');
let lastRank = 0;
let lastStores = 0;
for (let i = 0; i < days && !state.flags.gameOver; i++) {
  manage(DS, state);
  playDay(DS, state);
  const p = state.player;
  if (p.rank !== lastRank || state.dealerships.length !== lastStores || state.day % 25 === 0) {
    lastRank = p.rank;
    lastStores = state.dealerships.length;
    const net7 = state.dealerships.reduce((a, d) => a + d.history.slice(-7).reduce((x, h) => x + h.net, 0), 0);
    console.log(
      `day ${String(state.day).padStart(3)} | ${DS.data.RANKS[p.rank].title.padEnd(24)} | sales ${String(p.stats.sales).padStart(4)} | cash ${DS.util.money(p.cash, true).padStart(8)} | NW ${DS.util.money(G.netWorth(state), true).padStart(8)} | stores ${state.dealerships.map((d) => d.tier[0]).join('')} | 7d net ${DS.util.money(net7, true)} | lvl ${p.level}`
    );
  }
}
console.log('gameOver', state.flags.gameOver, 'won', state.flags.won, 'achievements', Object.keys(state.achievements).length);
