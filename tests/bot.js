// A simple scripted player used by tests and the balance simulator.
function playDay(DS, state) {
  const S = DS.sales;
  const G = DS.game;
  let guard = 0;
  while (!G.isClosed(state) && guard++ < 50) {
    const c = S.visibleCustomers(state).find((x) => x.status === 'waiting');
    if (!c) {
      if (!S.waitForCustomer(state).ok) break;
      continue;
    }
    S.startDeal(state, c.id);
    S.discover(state, 'smalltalk');
    S.discover(state, 'needs');
    S.discover(state, 'lot');
    const inv = G.workplace(state).inventory;
    const fits = inv
      .filter((car) => car.value <= c.budget * 1.05)
      .sort((a, b) => (b.cls === c.desired) - (a.cls === c.desired) || b.value - a.value);
    const car = fits[0] || inv[0];
    if (!car) {
      S.abandon(state);
      continue;
    }
    S.presentCar(state, car.id);
    if (state.deal.presented[car.id] < 0.45) {
      S.abandon(state);
      continue;
    }
    S.testDrive(state);
    S.startNegotiation(state);
    let offer = state.deal.listPrice;
    let rounds = 0;
    while (state.deal.stage === 'negotiate' && rounds++ < 8) {
      const counter = state.deal.counter;
      const floor = S.floorPrice(state, car) || 0;
      if (offer - counter < 600 || c.patience <= 1) {
        if (counter >= floor) S.acceptCounter(state);
        else S.makeOffer(state, floor);
        if (state.deal.stage === 'negotiate') S.abandon(state);
        break;
      }
      S.makeOffer(state, offer);
      offer = Math.max(floor, Math.round((offer + state.deal.counter) / 2 / 50) * 50);
    }
    if (state.deal && state.deal.stage === 'fi') {
      ['financing', 'warranty', 'gap', 'protection', 'tires'].forEach((pid) => {
        if (S.productChance(state, pid) > 0.25) S.pitchProduct(state, pid);
      });
      S.finalize(state);
    }
    if (state.deal) S.closeDeal(state);
  }
  return G.endDay(state);
}

// Grows the business: buy stores, hire staff, upgrade.
function manage(DS, state) {
  const B = DS.biz;
  const G = DS.game;
  const p = state.player;
  const listing = state.listings
    .filter((l) => G.canBuyTier(state, l.tier).ok && p.cash >= l.price * 0.3 + 20000 * DS.data.TIERS[l.tier].scale)
    .sort((a, b) => b.price - a.price)[0];
  if (listing && state.dealerships.length < 5) B.buyDealership(state, listing.id, 0.3);
  else if (listing && listing.tier !== 'usedLot') {
    // Trade up: sell the weakest used lot to make room for a bigger store.
    const worst = state.dealerships.filter((d) => d.tier === 'usedLot' && d.id !== state.activeStoreId)[0];
    if (worst) {
      B.sellDealership(state, worst.id);
      B.buyDealership(state, listing.id, 0.3);
    }
  }
  state.dealerships.forEach((d) => {
    while (d.staff.length < B.staffSlots(d)) {
      const c = state.candidates.find((x) => x.role === 'sales' || !d.staff.some((s) => s.role === x.role));
      if (!c || !B.hire(state, d.id, c.id).ok) break;
    }
    if (d.marketing < 2 && p.cash > 100000) B.setMarketing(state, d.id, 2);
  });
}

module.exports = { playDay, manage };
