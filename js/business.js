/* Dealership ownership: buying stores, staff, inventory, upgrades, loans and the daily store simulation. */
(function (root) {
  const DS = (root.DS = root.DS || {});
  const U = DS.util;
  const D = DS.data;
  const G = () => DS.game;

  const B = (DS.biz = {});
  const ok = (msg, extra) => Object.assign({ ok: true, msg }, extra);
  const fail = (msg) => ({ ok: false, msg });

  const blankStoreDay = () => ({ personalSales: 0, personalFront: 0, personalBack: 0, revenue: 0 });

  B.capacity = (d) => Math.round(D.TIERS[d.tier].capacity * (1 + 0.4 * d.upgrades.lot));
  B.staffSlots = (d) => D.TIERS[d.tier].staffSlots;
  B.upgradeCost = (d, id) => {
    const u = D.UPGRADES[id];
    const lvl = d.upgrades[id];
    if (lvl >= u.max) return null;
    return Math.round(u.cost[lvl] * D.TIERS[d.tier].scale);
  };
  B.marketingCost = (d, level) => Math.round(D.MARKETING[level].cost * D.TIERS[d.tier].scale);
  B.inventoryCost = (d) => U.sum(d.inventory, (c) => c.cost);

  // ---------- Listings (dealerships for sale) ----------
  B.storeName = function (tier, cityId, brand) {
    const city = D.CITIES[cityId];
    if (tier === 'mega') return `${city.name} ${brand} Auto Mall`;
    if (tier === 'franchise') return `${U.pick(D.STORE_NAMES_A)} ${brand} of ${city.name}`;
    return `${U.pick(D.STORE_NAMES_A)} ${U.pick(D.STORE_NAMES_B)}`;
  };

  B.generateListing = function (state, forceTier) {
    const owned = state.dealerships.length;
    const tier = forceTier || U.weighted({ usedLot: 5, franchise: owned >= 1 ? 3.5 : 1.5, mega: owned >= 2 ? 2 : 0.7 });
    const T = D.TIERS[tier];
    const cityId = U.pick(Object.keys(D.CITIES));
    const city = D.CITIES[cityId];
    const brand = T.newCars ? U.pick(D.BRANDS) : null;
    const factor = 0.6 + 0.4 * city.pop * city.price;
    const goodwill = U.roundTo(U.rand(T.price[0], T.price[1]) * factor * 0.45, 1000);
    // Starting inventory is generated now so the asking price reflects it.
    const cars = [];
    for (let i = 0; i < T.startCars; i++) {
      const isNew = T.newCars && U.chance(0.55);
      cars.push(isNew ? B.newCarFor(state, brand) : DS.cars.randomFor(state, { city: cityId }));
    }
    const invCost = U.sum(cars, (c) => c.cost);
    return {
      id: U.uid('lst'),
      tier,
      city: cityId,
      brand,
      name: B.storeName(tier, cityId, brand),
      rep: U.randInt(35, 68),
      goodwill,
      cars,
      price: U.roundTo(goodwill + invCost, 5000),
      staff: T.startStaff.map((role) => B.generateCandidate(state, role, [2, 6])),
    };
  };

  B.refreshListings = function (state, initial) {
    const keep = initial ? [] : state.listings.filter(() => U.chance(0.5));
    state.listings = keep;
    if (state.dealerships.length === 0 && !state.listings.some((l) => l.tier === 'usedLot')) {
      state.listings.push(B.generateListing(state, 'usedLot'));
      state.listings.push(B.generateListing(state, 'usedLot'));
    }
    while (state.listings.length < 5) state.listings.push(B.generateListing(state));
    const order = { usedLot: 0, franchise: 1, mega: 2 };
    state.listings.sort((a, b) => order[a.tier] - order[b.tier] || a.price - b.price);
  };

  B.buyDealership = function (state, listingId, downPct) {
    const listing = state.listings.find((l) => l.id === listingId);
    if (!listing) return fail('That listing is gone.');
    const can = G().canBuyTier(state, listing.tier);
    if (!can.ok) return fail(can.reasons.join('. ') + '.');
    downPct = U.clamp(Number(downPct) || 1, 1 - D.MAX_LOAN_PCT, 1);
    const down = Math.round(listing.price * downPct);
    const p = state.player;
    if (p.cash < down) return fail(`You need ${U.money(down)} in cash for the down payment.`);
    p.cash -= down;
    const T = D.TIERS[listing.tier];
    const d = {
      id: U.uid('store'),
      name: listing.name,
      city: listing.city,
      tier: listing.tier,
      brand: listing.brand,
      rep: listing.rep,
      marketing: 0,
      strategy: 'market',
      autoRestock: true,
      restockTarget: 0.85,
      upgrades: { lot: 0, showroom: 0, service: 0, detail: 0, online: 0 },
      upgradeSpend: 0,
      baseValue: listing.goodwill,
      purchasePrice: listing.price,
      acquiredDay: state.day,
      inventory: listing.cars,
      staff: listing.staff.map((s) => Object.assign(s, { hiredDay: state.day })),
      history: [],
      totals: { sold: 0, net: 0 },
      today: blankStoreDay(),
    };
    state.dealerships.push(d);
    state.listings = state.listings.filter((l) => l.id !== listingId);
    const loanAmt = listing.price - down;
    if (loanAmt > 0) {
      state.loans.push({ id: U.uid('loan'), storeId: d.id, label: d.name, original: loanAmt, balance: loanAmt, rate: D.LOAN_RATE });
      state.flags.hadLoan = true;
    }
    if (p.employed) {
      p.employed = false;
      state.activeStoreId = d.id;
      G().log(state, `✍️ You resigned from ${D.EMPLOYER.name} to run your own business.`, 'info');
      // Remaining customers at the old job go home; new ones show up at the new store.
      if (state.deal) DS.sales.abandon(state, true);
      DS.sales.startDay(state, Math.min(state.minutes, D.DAY_MINUTES - 60));
    }
    if (!state.activeStoreId) state.activeStoreId = d.id;
    G().updateOwnerRank(state);
    G().log(state, `🔑 You bought ${d.name} in ${D.CITIES[d.city].name} for ${U.money(listing.price)}${loanAmt > 0 ? ` (${U.money(loanAmt)} financed)` : ''}.`, 'good');
    G().checkAchievements(state);
    return ok(`Congratulations! ${d.name} is yours.`, { storeId: d.id });
  };

  B.value = function (state, d) {
    const recent = d.history.slice(-14);
    const avg = recent.length ? U.sum(recent, (h) => h.net) / recent.length : 0;
    const earnings = U.clamp(avg * 90, -0.5 * d.baseValue, 3 * d.baseValue);
    return Math.round(Math.max(0, d.baseValue + d.upgradeSpend * 0.6 + B.inventoryCost(d) + earnings));
  };

  B.sellDealership = function (state, storeId) {
    const d = G().store(state, storeId);
    if (!d) return fail('Unknown store.');
    const proceeds = Math.round(B.value(state, d) * 0.92);
    const loan = state.loans.find((l) => l.storeId === storeId);
    const payoff = loan ? loan.balance : 0;
    state.player.cash += proceeds - payoff;
    state.loans = state.loans.filter((l) => l.storeId !== storeId);
    state.dealerships = state.dealerships.filter((x) => x.id !== storeId);
    if (state.activeStoreId === storeId) {
      state.activeStoreId = state.dealerships[0] ? state.dealerships[0].id : null;
      if (state.deal) DS.sales.abandon(state, true);
      DS.sales.startDay(state, state.minutes);
    }
    G().updateOwnerRank(state);
    G().log(state, `🤝 Sold ${d.name} for ${U.money(proceeds)}${payoff ? ` and paid off its ${U.money(payoff)} loan` : ''}.`, 'info');
    return ok(`${d.name} sold.`);
  };

  // ---------- Staff ----------
  B.generateCandidate = function (state, role, skillRange) {
    role = role || U.weighted({ sales: 6, finance: 2, manager: 1.6 });
    const R = D.STAFF_ROLES[role];
    const range = skillRange || [1, 7];
    const skill = U.clamp(Math.round(U.rand(range[0], range[1]) + (U.chance(0.12) ? 2 : 0)), 1, 10);
    return {
      id: U.uid('staff'),
      name: `${U.pick(D.FIRST_NAMES)} ${U.pick(D.LAST_NAMES)}`,
      role,
      skill,
      salary: Math.round((R.baseSalary + R.perSkill * skill) * U.rand(0.9, 1.15)),
      xp: 0,
      sold: 0,
    };
  };

  B.refreshCandidates = function (state) {
    state.candidates = [];
    for (let i = 0; i < 7; i++) state.candidates.push(B.generateCandidate(state));
    if (!state.candidates.some((c) => c.role === 'sales')) state.candidates[0] = B.generateCandidate(state, 'sales');
  };

  B.hireFee = (cand) => cand.salary * 5;

  B.hire = function (state, storeId, candId) {
    const d = G().store(state, storeId);
    const cand = state.candidates.find((c) => c.id === candId);
    if (!d || !cand) return fail('Pick a candidate and a store.');
    if (d.staff.length >= B.staffSlots(d)) return fail(`${d.name} has no open positions (${B.staffSlots(d)} max).`);
    if (cand.role !== 'sales' && d.staff.some((s) => s.role === cand.role)) return fail(`${d.name} already has a ${D.STAFF_ROLES[cand.role].label}.`);
    const fee = B.hireFee(cand);
    if (state.player.cash < fee) return fail(`Recruiting costs ${U.money(fee)}.`);
    state.player.cash -= fee;
    cand.hiredDay = state.day;
    d.staff.push(cand);
    state.candidates = state.candidates.filter((c) => c.id !== candId);
    G().log(state, `🧑‍💼 Hired ${cand.name} (${D.STAFF_ROLES[cand.role].label}, skill ${cand.skill}) at ${d.name}.`, 'info');
    return ok(`${cand.name} joins ${d.name}.`);
  };

  B.severance = (s) => s.salary * 3;

  B.fire = function (state, storeId, staffId) {
    const d = G().store(state, storeId);
    const s = d && d.staff.find((x) => x.id === staffId);
    if (!s) return fail('Unknown employee.');
    const cost = B.severance(s);
    state.player.cash -= cost;
    d.staff = d.staff.filter((x) => x.id !== staffId);
    G().log(state, `📦 Let ${s.name} go from ${d.name} (${U.money(cost)} severance).`, 'info');
    return ok(`${s.name} was let go.`);
  };

  // ---------- Inventory ----------
  B.newCarFor = function (state, brand, model) {
    const pool = model ? [model] : DS.cars.modelsBy({ make: brand });
    return DS.cars.create(U.pick(pool), { isNew: true, year: DS.cars.currentYear(state) });
  };

  B.refreshAuction = function (state) {
    state.auction = [];
    const cities = Object.keys(D.CITIES);
    for (let i = 0; i < 14; i++) {
      const car = DS.cars.randomFor(state, { city: U.pick(cities), costRatio: U.rand(0.76, 0.92) });
      car.cost = U.roundTo(car.cost * G().valueMod(state), 50);
      state.auction.push(car);
    }
    state.auction.sort((a, b) => a.cost - b.cost);
  };

  const addCar = function (state, d, car) {
    if (d.inventory.length >= B.capacity(d)) return fail(`${d.name}'s lot is full.`);
    if (state.player.cash < car.cost) return fail(`You need ${U.money(car.cost)}.`);
    state.player.cash -= car.cost;
    car.daysOnLot = 0;
    d.inventory.push(car);
    return ok(`${DS.cars.name(car)} added to ${d.name}.`);
  };

  B.buyAuction = function (state, carId, storeId) {
    const d = G().store(state, storeId);
    const car = state.auction.find((c) => c.id === carId);
    if (!d || !car) return fail('That car is no longer available.');
    const res = addCar(state, d, car);
    if (res.ok) state.auction = state.auction.filter((c) => c.id !== carId);
    return res;
  };

  B.factoryModels = (d) => (D.TIERS[d.tier].newCars && d.brand ? DS.cars.modelsBy({ make: d.brand }) : []);
  B.invoice = (model) => U.roundTo(model.msrp * 0.91, 50);

  B.factoryOrder = function (state, storeId, modelName) {
    const d = G().store(state, storeId);
    if (!d) return fail('Unknown store.');
    const model = B.factoryModels(d).find((m) => m.model === modelName);
    if (!model) return fail('This store cannot order that model.');
    const car = B.newCarFor(state, d.brand, model);
    car.cost = B.invoice(model);
    return addCar(state, d, car);
  };

  B.wholesaleValue = (state, car) => U.roundTo(car.value * 0.74 * G().valueMod(state), 50);

  B.wholesale = function (state, storeId, carId) {
    const d = G().store(state, storeId);
    const car = d && d.inventory.find((c) => c.id === carId);
    if (!car) return fail('Unknown car.');
    if (state.deal && state.deal.carId === carId && state.activeStoreId === storeId) return fail("You're showing that car to a customer right now.");
    const amt = B.wholesaleValue(state, car);
    state.player.cash += amt;
    d.inventory = d.inventory.filter((c) => c.id !== carId);
    return ok(`Wholesaled ${DS.cars.name(car)} for ${U.money(amt)}.`);
  };

  // Restock from wholesalers (pricier than the auction, but automatic).
  B.restockCar = function (state, d) {
    if (D.TIERS[d.tier].newCars && d.brand && U.chance(0.55)) {
      const car = B.newCarFor(state, d.brand);
      car.cost = B.invoice(car);
      return car;
    }
    const car = DS.cars.randomFor(state, { city: d.city, costRatio: U.rand(0.84, 0.93) });
    car.cost = U.roundTo(car.cost * G().valueMod(state), 50);
    return car;
  };

  B.restock = function (state, d, target, ledger) {
    let bought = 0;
    let spent = 0;
    const reserve = ledger ? 5000 * D.TIERS[d.tier].scale : 0;
    let guard = 0;
    while (d.inventory.length < target && guard++ < 200) {
      const car = B.restockCar(state, d);
      if (state.player.cash - car.cost < reserve) break;
      state.player.cash -= car.cost;
      d.inventory.push(car);
      bought++;
      spent += car.cost;
    }
    if (ledger) {
      ledger.restockCount += bought;
      ledger.restockSpend += spent;
    }
    return { bought, spent };
  };

  B.restockNow = function (state, storeId) {
    const d = G().store(state, storeId);
    if (!d) return fail('Unknown store.');
    const res = B.restock(state, d, B.capacity(d));
    if (!res.bought) return fail(d.inventory.length >= B.capacity(d) ? 'The lot is already full.' : 'Not enough cash to buy more cars.');
    return ok(`Bought ${res.bought} cars for ${U.money(res.spent)}.`);
  };

  // ---------- Settings & upgrades ----------
  B.setMarketing = function (state, storeId, level) {
    const d = G().store(state, storeId);
    level = Number(level);
    if (!d || !D.MARKETING[level]) return fail('Invalid marketing level.');
    d.marketing = level;
    return ok(`Marketing set to ${D.MARKETING[level].label}.`);
  };
  B.setStrategy = function (state, storeId, strategy) {
    const d = G().store(state, storeId);
    if (!d || !D.STRATEGIES[strategy]) return fail('Invalid strategy.');
    d.strategy = strategy;
    return ok(`Pricing set to ${D.STRATEGIES[strategy].label}.`);
  };
  B.setAutoRestock = function (state, storeId, on, target) {
    const d = G().store(state, storeId);
    if (!d) return fail('Unknown store.');
    d.autoRestock = !!on;
    if (target !== undefined) d.restockTarget = U.clamp(Number(target), 0.3, 1);
    return ok(d.autoRestock ? `Auto-restock on (${U.pct(d.restockTarget)} of capacity).` : 'Auto-restock off.');
  };
  B.buyUpgrade = function (state, storeId, upgId) {
    const d = G().store(state, storeId);
    const u = D.UPGRADES[upgId];
    if (!d || !u) return fail('Unknown upgrade.');
    const cost = B.upgradeCost(d, upgId);
    if (cost === null) return fail('Already fully upgraded.');
    if (state.player.cash < cost) return fail(`You need ${U.money(cost)}.`);
    state.player.cash -= cost;
    d.upgrades[upgId]++;
    d.upgradeSpend += cost;
    G().log(state, `${u.icon} ${d.name}: ${u.label} upgraded to level ${d.upgrades[upgId]}.`, 'info');
    return ok(`${u.label} is now level ${d.upgrades[upgId]}.`);
  };

  // ---------- Loans ----------
  B.weeklyPrincipal = (loan) => Math.min(loan.balance, Math.round(loan.original * 0.015));
  B.processLoans = function (state, report) {
    let interest = 0;
    let principal = 0;
    state.loans.forEach((l) => {
      const i = Math.round((l.balance * l.rate) / 365);
      interest += i;
      if (state.day % 7 === 0) {
        const pmt = B.weeklyPrincipal(l);
        l.balance -= pmt;
        principal += pmt;
      }
    });
    state.player.cash -= interest + principal;
    const before = state.loans.length;
    state.loans = state.loans.filter((l) => l.balance > 0);
    if (before > state.loans.length) G().log(state, '🎉 A business loan was paid off!', 'good');
    if (interest) report.lines.push(['Loan interest', -interest]);
    if (principal) report.lines.push(['Loan principal payments', -principal]);
  };
  B.payLoan = function (state, loanId, amount) {
    const l = state.loans.find((x) => x.id === loanId);
    if (!l) return fail('Unknown loan.');
    amount = Math.min(l.balance, Math.round(Number(amount)));
    if (!(amount > 0)) return fail('Invalid amount.');
    if (state.player.cash < amount) return fail(`You only have ${U.money(state.player.cash)}.`);
    state.player.cash -= amount;
    l.balance -= amount;
    if (l.balance <= 0) {
      state.loans = state.loans.filter((x) => x.id !== loanId);
      G().log(state, `🎉 Paid off the loan on ${l.label}!`, 'good');
      G().checkAchievements(state);
      return ok('Loan paid off!');
    }
    return ok(`Paid ${U.money(amount)} toward ${l.label}.`);
  };

  // ---------- Daily store simulation ----------
  B.simulateDay = function (state, d) {
    const T = D.TIERS[d.tier];
    const city = D.CITIES[d.city];
    const strat = D.STRATEGIES[d.strategy];
    const p = state.player;
    const L = {
      storeId: d.id, name: d.name, day: state.day,
      visitors: 0, helped: 0, sold: d.today.personalSales, personalSold: d.today.personalSales,
      revenue: d.today.revenue, front: d.today.personalFront, back: d.today.personalBack,
      service: 0, commissions: 0, salaries: 0, marketing: 0, overhead: 0, floorplan: 0, incidents: 0,
      restockCount: 0, restockSpend: 0, expenses: 0, net: 0, notes: [],
    };
    const traffic =
      T.baseTraffic * city.pop * D.MARKETING[d.marketing].traffic * (0.55 + (d.rep / 100) * 0.9) *
      (1 + 0.12 * d.upgrades.showroom) * (1 + 0.18 * d.upgrades.online) * G().trafficMod(state) * U.rand(0.75, 1.25);
    const personalCustomers = state.activeStoreId === d.id ? state.customers.length : 0;
    L.visitors = Math.max(0, Math.round(traffic - personalCustomers * 0.5));

    const sellers = d.staff.filter((s) => s.role === 'sales');
    const manager = d.staff.find((s) => s.role === 'manager');
    const finance = d.staff.find((s) => s.role === 'finance');
    const slots = [];
    sellers.forEach((s) => {
      for (let i = 0; i < 2 + Math.ceil(s.skill / 3); i++) slots.push(s);
    });
    const order = U.shuffle(slots);
    L.helped = Math.min(L.visitors, order.length);
    const unhelped = L.visitors - L.helped;
    if (unhelped > 2) {
      d.rep -= Math.min(1.5, unhelped * 0.12);
      L.notes.push(`${unhelped} shoppers left without being helped — hire more salespeople.`);
    }

    const demand = {};
    Object.keys(D.CLASSES).forEach((cls) => (demand[cls] = city.demand[cls] * G().demandMod(state, cls)));
    const valueMod = G().valueMod(state);

    for (let i = 0; i < L.helped && d.inventory.length; i++) {
      const s = order[i];
      const cls = U.weighted(demand);
      const matches = d.inventory.filter((c) => c.cls === cls);
      const car = matches.length ? U.pick(matches) : U.chance(0.35) ? U.pick(d.inventory) : null;
      if (!car) continue;
      const skillEff = s.skill + (manager ? 1 + manager.skill * 0.15 : 0);
      const close =
        (0.14 + skillEff * 0.022 + (d.rep - 50) / 450 + p.skills.leadership * 0.008) * strat.close * G().closeMod(state) * (matches.length ? 1 : 0.6);
      if (!U.chance(close)) continue;
      const price = U.roundTo(car.value * strat.npcPrice * U.rand(0.95, 1.02) * (1 + 0.03 * d.upgrades.detail) * valueMod, 50);
      const front = price - car.cost;
      const commission = Math.round(Math.max(100, front * 0.2));
      let back = finance ? Math.round(U.rand(0.5, 1.5) * (350 + finance.skill * 140)) : Math.round(U.rand(80, 280));
      if (car.isNew) back += 600; // manufacturer holdback
      p.cash += price + back - commission;
      d.inventory = d.inventory.filter((c) => c.id !== car.id);
      L.sold++;
      L.revenue += price;
      L.front += front;
      L.back += back;
      L.commissions += commission;
      state.groupSold++;
      s.sold++;
      s.xp++;
      if (s.skill < 10 && s.xp >= s.skill * 6) {
        s.skill++;
        s.xp = 0;
        s.salary += D.STAFF_ROLES.sales.perSkill;
        L.notes.push(`${s.name} improved to skill ${s.skill}.`);
      }
      d.rep += strat.rep * (1 + d.upgrades.showroom * 0.3);
    }
    if (finance && L.sold) finance.sold += L.sold;

    if (d.upgrades.service) {
      L.service = Math.round(d.upgrades.service * 500 * city.pop * Math.sqrt(city.price) * Math.sqrt(T.scale) * (0.5 + d.rep / 100) * U.rand(0.8, 1.2));
      p.cash += L.service;
    }

    L.overhead = Math.round(T.overhead * Math.sqrt(city.price));
    L.marketing = B.marketingCost(d, d.marketing);
    L.salaries = U.sum(d.staff, (s) => s.salary);
    L.floorplan = Math.round(B.inventoryCost(d) * 0.00022);

    if (U.chance(0.035)) B.incident(state, d, L);

    L.expenses = L.overhead + L.marketing + L.salaries + L.floorplan + L.incidents;
    p.cash -= L.expenses;
    L.net = Math.round(L.front + L.back + L.service - L.commissions - L.expenses);

    d.inventory.forEach((c) => {
      c.daysOnLot++;
      c.value = Math.round(c.value * (c.isNew ? 0.9995 : c.daysOnLot > 45 ? 0.997 : 0.9992));
    });
    d.rep = U.clamp(d.rep + (50 - d.rep) * 0.01 + d.upgrades.showroom * 0.04, 0, 100);

    if (d.autoRestock) B.restock(state, d, Math.floor(B.capacity(d) * d.restockTarget), L);

    d.history.push(L);
    if (d.history.length > 30) d.history.shift();
    d.totals.sold += L.sold;
    d.totals.net += L.net;
    d.today = blankStoreDay();
    return L;
  };

  B.incident = function (state, d, L) {
    const weights = {};
    D.INCIDENTS.forEach((inc) => (weights[inc.id] = inc.weight));
    const pickedId = U.weighted(weights);
    const inc = D.INCIDENTS.find((x) => x.id === pickedId);
    const scale = D.TIERS[d.tier].scale;
    let text = inc.text.replace('{store}', d.name);
    if (inc.rep) d.rep = U.clamp(d.rep + inc.rep, 0, 100);
    if (inc.cost) {
      const amt = Math.round(U.rand(inc.cost[0], inc.cost[1]) * scale);
      L.incidents += amt;
      text = text.replace('{amount}', U.money(amt));
    }
    if (inc.star) {
      const s = U.pick(d.staff.filter((x) => x.skill < 10));
      if (!s) return;
      s.skill++;
      text = text.replace('{name}', s.name);
    }
    if (inc.quit) {
      if (d.staff.length < 2) return;
      const s = U.pick(d.staff);
      d.staff = d.staff.filter((x) => x.id !== s.id);
      text = text.replace('{name}', s.name);
    }
    if (inc.fleet) {
      const n = Math.min(d.inventory.length, U.randInt(2, 4));
      if (n < 2) return;
      U.shuffle(d.inventory).slice(0, n).forEach((car) => {
        const price = U.roundTo(car.value * 0.97, 50);
        state.player.cash += price;
        L.sold++;
        L.revenue += price;
        L.front += price - car.cost;
        state.groupSold++;
        d.inventory = d.inventory.filter((c) => c.id !== car.id);
      });
      text += ` (${n} cars)`;
    }
    L.notes.push(text);
    G().log(state, `📰 ${text}`, inc.rep < 0 || inc.cost || inc.quit ? 'bad' : 'good');
  };
})(typeof window !== 'undefined' ? window : globalThis);
