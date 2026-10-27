const test = require('node:test');
const assert = require('node:assert');
const { loadEngine } = require('./load');
const { playDay, manage } = require('./bot');

function freshGame(seed) {
  const DS = loadEngine(seed);
  return { DS, state: DS.game.newGame('Tester') };
}

function walkToNegotiation(DS, state) {
  const S = DS.sales;
  const c = S.visibleCustomers(state).find((x) => x.status === 'waiting');
  assert.ok(S.startDeal(state, c.id).ok);
  assert.ok(S.discover(state, 'needs').ok);
  assert.ok(S.discover(state, 'lot').ok);
  const car = DS.game.workplace(state).inventory[0];
  assert.ok(S.presentCar(state, car.id).ok);
  assert.ok(S.startNegotiation(state).ok);
  return { c, car };
}

test('new game starts as an employed sales associate with customers and inventory', () => {
  const { DS, state } = freshGame(1);
  assert.strictEqual(state.player.employed, true);
  assert.strictEqual(state.player.rank, 0);
  assert.strictEqual(state.employer.inventory.length, DS.data.EMPLOYER.inventorySize);
  assert.ok(state.customers.length >= 3);
  assert.strictEqual(DS.sales.visibleCustomers(state).length >= 1, true, 'first customer arrives at opening');
  assert.ok(state.listings.some((l) => l.tier === 'usedLot'));
});

test('generated cars have sane prices', () => {
  const { DS, state } = freshGame(2);
  for (let i = 0; i < 300; i++) {
    const car = DS.cars.randomFor(state, { city: 'grandMetro', isNew: i % 3 === 0 });
    assert.ok(car.value > 0 && car.cost > 0, 'positive value and cost');
    assert.ok(car.cost < car.value, 'dealer cost is below retail value');
    assert.ok(DS.cars.listPrice(car) > car.value, 'sticker is above value');
  }
});

test('offering at or below what the customer will pay closes the deal', () => {
  const { DS, state } = freshGame(3);
  state.player.rank = 2; // managers have no price floor
  walkToNegotiation(DS, state);
  const res = DS.sales.makeOffer(state, state.deal.counter);
  assert.ok(res.ok);
  assert.strictEqual(state.deal.stage, 'fi');
});

test('lowballing below the manager floor is refused for junior staff', () => {
  const { DS, state } = freshGame(4);
  const { car } = walkToNegotiation(DS, state);
  const res = DS.sales.makeOffer(state, car.cost - 1000);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(state.deal.stage, 'negotiate');
});

test('repeated high offers eventually make the customer walk', () => {
  const { DS, state } = freshGame(5);
  walkToNegotiation(DS, state);
  const price = state.deal.listPrice * 3;
  for (let i = 0; i < 10 && state.deal.stage === 'negotiate'; i++) DS.sales.makeOffer(state, price);
  assert.strictEqual(state.deal.stage, 'walked');
  assert.strictEqual(state.player.stats.walkouts, 1);
});

test('finalizing a sale pays commission and removes the car', () => {
  const { DS, state } = freshGame(6);
  const { car } = walkToNegotiation(DS, state);
  DS.sales.acceptCounter(state);
  if (state.deal.stage !== 'fi') DS.sales.makeOffer(state, Math.max(state.deal.counter, car.cost + 300));
  const cashBefore = state.player.cash;
  assert.ok(DS.sales.finalize(state).ok);
  assert.strictEqual(state.deal.stage, 'summary');
  assert.ok(state.player.cash >= cashBefore + 150, 'at least the minimum commission');
  assert.ok(!state.employer.inventory.some((c) => c.id === car.id));
  assert.strictEqual(state.player.stats.sales, 1);
});

test('a scripted career gets promoted, buys a store and stays solvent', () => {
  const { DS, state } = freshGame(7);
  for (let i = 0; i < 120 && !state.flags.gameOver; i++) {
    manage(DS, state);
    playDay(DS, state);
  }
  assert.strictEqual(state.flags.gameOver, false);
  assert.ok(state.dealerships.length >= 1, 'owns at least one dealership');
  assert.strictEqual(state.player.employed, false);
  assert.ok(Number.isFinite(DS.game.netWorth(state)));
  assert.ok(DS.game.netWorth(state) > 500000);
  state.dealerships.forEach((d) => d.history.forEach((h) => assert.ok(Number.isFinite(h.net), 'ledger values are numbers')));
});

test('owners can fast-forward a week', () => {
  const { DS, state } = freshGame(8);
  state.player.rank = 2;
  state.player.cash = 250000;
  const lot = state.listings.find((l) => l.tier === 'usedLot');
  assert.ok(DS.biz.buyDealership(state, lot.id, 0.3).ok);
  const day = state.day;
  const reports = DS.game.skipDays(state, 7);
  assert.strictEqual(reports.length, 7);
  assert.strictEqual(state.day, day + 7);
  assert.strictEqual(state.dealerships[0].history.length, 7);
});

test('franchise purchases require owning a store first', () => {
  const { DS, state } = freshGame(9);
  state.player.rank = 3;
  assert.strictEqual(DS.game.canBuyTier(state, 'usedLot').ok, true);
  assert.strictEqual(DS.game.canBuyTier(state, 'franchise').ok, false);
  assert.strictEqual(DS.game.canBuyTier(state, 'mega').ok, false);
});

test('auction cars cannot be flipped to the wholesaler for a profit', () => {
  const { DS, state } = freshGame(10);
  for (let i = 0; i < 20; i++) {
    DS.biz.refreshAuction(state);
    state.auction.forEach((car) => assert.ok(DS.biz.wholesaleValue(state, car) < car.cost));
  }
});

test('save and load round-trips the game state', () => {
  const { DS, state } = freshGame(11);
  playDay(DS, state);
  assert.ok(DS.game.save(state));
  const loaded = DS.game.load();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(loaded)), JSON.parse(JSON.stringify(state)));
});
