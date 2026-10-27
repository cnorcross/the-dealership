/* Showroom customers and the personal sales deal flow:
   discover -> select (present / test drive) -> negotiate -> fi -> summary | walked */
(function (root) {
  const DS = (root.DS = root.DS || {});
  const U = DS.util;
  const D = DS.data;
  const G = () => DS.game;

  const S = (DS.sales = {});
  const MAX_WAIT = 150;

  const T = {
    discover: 10,
    present: 10,
    testDrive: 25,
    offer: 5,
    assist: 10,
    finalize: 10,
  };
  S.TIME = T;

  const typeOf = (c) => D.CUSTOMER_TYPES[c.type];
  const customer = (state, id) => state.customers.find((c) => c.id === id);
  S.dealCustomer = (state) => (state.deal ? customer(state, state.deal.customerId) : null);
  S.dealCar = function (state) {
    const wp = G().workplace(state);
    if (!state.deal || !state.deal.carId || !wp) return null;
    return wp.inventory.find((c) => c.id === state.deal.carId) || null;
  };

  const say = (state, who, text) => state.deal && state.deal.chat.push({ who, text });
  const spend = (state, mins) => {
    state.minutes += mins;
    S.tick(state);
  };
  const ok = (msg, extra) => Object.assign({ ok: true, msg }, extra);
  const fail = (msg) => ({ ok: false, msg });

  // ---------- Customers ----------
  S.customerCount = function (state) {
    const p = state.player;
    if (p.employed) return U.clamp(Math.round(3 + p.rep / 30 + U.rand(0, 2.5)), 3, 8);
    const d = G().activeStore(state);
    if (!d) return 0;
    const city = D.CITIES[d.city];
    return U.clamp(Math.round(1.5 + d.marketing * 0.5 + d.rep / 40 + city.pop + U.rand(0, 1.5)), 2, 7);
  };

  S.generateCustomer = function (state, cityId, arrival) {
    const typeWeights = {};
    Object.entries(D.CUSTOMER_TYPES).forEach(([id, t]) => (typeWeights[id] = t.weight));
    const typeId = U.weighted(typeWeights);
    const t = D.CUSTOMER_TYPES[typeId];
    const city = D.CITIES[cityId] || D.CITIES.riverton;
    const clsWeights = {};
    Object.entries(t.classes).forEach(([cls, w]) => (clsWeights[cls] = w * city.demand[cls] * G().demandMod(state, cls)));
    const desired = U.weighted(clsWeights);
    const altWeights = Object.assign({}, clsWeights);
    delete altWeights[desired];
    const alt = Object.keys(altWeights).length ? U.weighted(altWeights) : null;
    const ref = D.CLASSES[desired].ref * (0.8 + 0.2 * city.price);
    const rep = G().isOwner(state) && G().activeStore(state) ? G().activeStore(state).rep : state.player.rep;
    const browser = U.chance(0.15);
    return {
      id: U.uid('cust'),
      name: `${U.pick(D.FIRST_NAMES)} ${U.pick(D.LAST_NAMES)}`,
      avatar: U.pick(D.AVATARS),
      type: typeId,
      desired,
      alt,
      budget: U.roundTo(ref * U.rand(t.budget[0], t.budget[1]), 250),
      wantsNew: U.chance(t.wantsNew),
      needsFinancing: U.chance(t.financing),
      intent: browser ? U.rand(0.3, 0.55) : U.rand(0.78, 1),
      patience: U.randInt(t.patience[0], t.patience[1]),
      mood: Math.round(U.clamp(U.rand(42, 60) + (rep - 50) / 4, 20, 80)),
      hint: U.pick(t.hints),
      revealed: { type: false, needs: false },
      budgetRange: null,
      arrival,
      status: 'waiting',
    };
  };

  S.startDay = function (state, fromMinute) {
    state.customers = [];
    state.deal = null;
    const wp = G().workplace(state);
    if (!wp) return;
    const n = S.customerCount(state);
    const start = fromMinute || 0;
    const span = Math.max(0, D.DAY_MINUTES - 90 - start);
    const arrivals = [];
    for (let i = 0; i < n; i++) arrivals.push(start + (i === 0 ? 0 : Math.round(U.rand(0, span))));
    arrivals.sort((a, b) => a - b).forEach((a) => state.customers.push(S.generateCustomer(state, wp.city, a)));
  };

  S.visibleCustomers = (state) => state.customers.filter((c) => c.arrival <= state.minutes);
  S.upcomingCount = (state) => state.customers.filter((c) => c.arrival > state.minutes && c.status === 'waiting').length;
  S.waitTime = (state, c) => Math.max(0, state.minutes - c.arrival);

  // Customers waiting too long walk out.
  S.tick = function (state) {
    state.customers.forEach((c) => {
      if (c.status === 'waiting' && c.arrival <= state.minutes && S.waitTime(state, c) > MAX_WAIT) {
        c.status = 'left';
        c.leftReason = 'Got tired of waiting';
      }
    });
  };

  S.waitForCustomer = function (state) {
    if (state.deal) return fail('Finish your current customer first.');
    if (G().isClosed(state)) return fail('The showroom is closed for the day.');
    const next = state.customers.filter((c) => c.status === 'waiting' && c.arrival > state.minutes).sort((a, b) => a.arrival - b.arrival)[0];
    if (!next) return fail('No more customers are expected today.');
    state.minutes = next.arrival;
    S.tick(state);
    return ok(`${next.name} just walked in.`);
  };

  // ---------- Deal flow ----------
  S.startDeal = function (state, customerId) {
    if (state.deal) return fail('You are already with a customer.');
    if (G().isClosed(state)) return fail('The showroom is closed. End the day.');
    const c = customer(state, customerId);
    if (!c || c.status !== 'waiting' || c.arrival > state.minutes) return fail('That customer is not available.');
    c.status = 'engaged';
    const waited = S.waitTime(state, c);
    if (waited > 30) c.mood = Math.max(5, c.mood - Math.round((waited - 30) / 10));
    state.deal = {
      customerId: c.id,
      stage: 'discover',
      carId: null,
      presented: {},
      testDriven: {},
      done: {},
      chat: [],
      wtp: null,
      counter: null,
      lastOffer: null,
      listPrice: null,
      rounds: 0,
      assistUsed: false,
      freebieCost: 0,
      agreedPrice: null,
      products: {},
      summary: null,
    };
    say(state, 'you', `Welcome to ${G().workplace(state).name}! I'm ${state.player.name}. How can I help?`);
    say(state, 'them', waited > 45 ? `Finally! I've been waiting ${waited} minutes...` : U.pick(['Hi! Just looking around for now.', "Hey there. I'm shopping for a car.", 'Hello! I might be interested in something today.']));
    spend(state, 3);
    return ok(`You approach ${c.name}.`);
  };

  S.discover = function (state, action) {
    const deal = state.deal;
    const c = S.dealCustomer(state);
    if (!deal || deal.stage !== 'discover') return fail('Not the right time for that.');
    const t = typeOf(c);
    const sk = state.player.skills;
    if (deal.done[action]) return fail('You already did that.');
    deal.done[action] = true;
    if (action === 'smalltalk') {
      const base = t.talk.smalltalk;
      const success = U.chance(0.45 + sk.charisma * 0.05 + (base > 0 ? 0.1 : -0.1));
      let delta;
      if (base < 0) delta = base;
      else delta = success ? base + sk.charisma * 0.5 : base * 0.3;
      c.mood = U.clamp(Math.round(c.mood + delta), 0, 100);
      say(state, 'you', U.pick(['So, what brings you in today?', 'Beautiful day to buy a car, huh?', 'Have you been with us before?']));
      if (success) {
        c.revealed.type = true;
        say(state, 'them', base < 0 ? "Look, I'd rather skip the chit-chat." : 'Ha, yeah! Honestly, it feels good to talk to a real person.');
        say(state, 'system', `You read them: ${t.icon} ${t.label}. ${t.desc}`);
      } else {
        say(state, 'them', base < 0 ? "Can we get to the cars? I'm busy." : 'Mm-hm. Sure.');
        say(state, 'system', "You couldn't quite read this customer.");
      }
      spend(state, T.discover);
      return ok(success ? 'You built some rapport.' : 'The small talk fell a bit flat.');
    }
    if (action === 'needs') {
      c.revealed.needs = true;
      const spread = Math.max(0.04, 0.26 - sk.knowledge * 0.022);
      const lo = U.roundTo(c.budget * (1 - spread * U.rand(0.4, 1)), 500);
      const hi = U.roundTo(c.budget * (1 + spread * U.rand(0.4, 1)), 500);
      c.budgetRange = [lo, Math.max(lo + 500, hi)];
      c.mood = U.clamp(c.mood + 2, 0, 100);
      say(state, 'you', 'What are you looking for in your next vehicle?');
      const cls = D.CLASSES[c.desired].label.toLowerCase();
      const alt = c.alt ? ` Maybe a ${D.CLASSES[c.alt].label.toLowerCase()}, too.` : '';
      say(state, 'them', `I'm thinking ${c.wantsNew ? 'a new' : 'a pre-owned'} ${cls}.${alt} Ideally around ${U.money(c.budget, true)}${c.needsFinancing ? ", and I'll need financing" : ''}.`);
      say(state, 'system', `Budget estimate: ${U.money(c.budgetRange[0])} – ${U.money(c.budgetRange[1])}.`);
      spend(state, T.discover);
      return ok('You learned what they need.');
    }
    if (action === 'lot') {
      if (!deal.done.smalltalk && !deal.done.needs) {
        c.mood = U.clamp(c.mood + t.talk.lot, 0, 100);
        say(state, 'you', "Let's go take a look at the lot!");
        say(state, 'them', t.talk.lot > 0 ? 'Perfect, I like your style.' : "Oh... okay, I guess we're doing this fast.");
      } else {
        say(state, 'you', 'Let me show you what we have.');
      }
      deal.stage = 'select';
      spend(state, 2);
      return ok('Heading out to the lot.');
    }
    return fail('Unknown action.');
  };

  S.interest = function (state, c, car) {
    const cls = car.cls === c.desired ? 1 : car.cls === c.alt ? 0.72 : 0.3;
    const ratio = (car.value * G().valueMod(state)) / c.budget;
    const priceFit = ratio <= 1 ? 1 : U.clamp(1 - (ratio - 1) * 2.2, 0.1, 1);
    const newFit = c.wantsNew && !car.isNew ? 0.78 : !c.wantsNew && car.isNew ? 0.95 : 1;
    const cond = 0.9 + car.condition / 1000;
    const pitch = 1 + state.player.skills.knowledge * 0.012;
    return U.clamp(cls * priceFit * newFit * cond * pitch * U.rand(0.9, 1.08), 0.05, 1);
  };

  S.reaction = function (interest) {
    if (interest >= 0.85) return { face: '😍', label: 'Loves it' };
    if (interest >= 0.68) return { face: '🙂', label: 'Interested' };
    if (interest >= 0.48) return { face: '😐', label: 'Lukewarm' };
    return { face: '🙁', label: 'Not feeling it' };
  };

  S.presentCar = function (state, carId) {
    const deal = state.deal;
    const c = S.dealCustomer(state);
    if (!deal || deal.stage !== 'select') return fail('Not the right time for that.');
    const car = G().workplace(state).inventory.find((x) => x.id === carId);
    if (!car) return fail('That car is no longer on the lot.');
    deal.carId = carId;
    if (deal.presented[carId] !== undefined) return ok('Back to the ' + DS.cars.name(car) + '.');
    const interest = S.interest(state, c, car);
    deal.presented[carId] = interest;
    const shown = Object.keys(deal.presented).length;
    if (shown > 3) {
      c.patience = Math.max(1, c.patience - 1);
      say(state, 'system', `${c.name.split(' ')[0]} is getting tired of walking the lot.`);
    }
    const r = S.reaction(interest);
    const overBudget = car.value > c.budget * 1.12;
    const lines = {
      '😍': ["Oh wow. This is exactly what I've been looking for!", "Now THAT is a car. I can see myself in this.", 'I love it. Seriously.'],
      '🙂': ['This is pretty nice, actually.', 'I like this one. Tell me more.', 'Ooh, not bad at all.'],
      '😐': ["It's... fine, I guess.", "Not bad, but I'm not sure it's me.", 'Hmm. Maybe.'],
      '🙁': ["That's not really what I'm after.", "No, I don't think so.", "That's not for me."],
    };
    say(state, 'you', `Take a look at this ${DS.cars.name(car)}.`);
    say(state, 'them', overBudget && interest < 0.68 ? "That looks way out of my price range." : U.pick(lines[r.face]));
    spend(state, T.present);
    return ok(`${r.face} ${r.label}`);
  };

  S.testDrive = function (state) {
    const deal = state.deal;
    const c = S.dealCustomer(state);
    if (!deal || deal.stage !== 'select' || !deal.carId) return fail('Pick a car first.');
    if (deal.testDriven[deal.carId]) return fail('They already drove this one.');
    deal.testDriven[deal.carId] = true;
    const before = deal.presented[deal.carId];
    const boost = before >= 0.45 ? U.rand(0.05, 0.13) + state.player.skills.knowledge * 0.006 : U.rand(-0.03, 0.06);
    deal.presented[deal.carId] = U.clamp(before + boost, 0.05, 1);
    c.mood = U.clamp(c.mood + (before >= 0.45 ? 5 : -2), 0, 100);
    say(state, 'you', "Here are the keys — let's take it for a spin.");
    say(state, 'them', before >= 0.45 ? U.pick(['It drives like a dream!', 'Wow, the acceleration on this thing!', 'So smooth. I could get used to this.']) : 'It drives okay, I suppose.');
    spend(state, T.testDrive);
    return ok('Test drive complete.');
  };

  S.storeBonus = function (state) {
    const d = G().activeStore(state);
    return d ? 1 + 0.03 * d.upgrades.detail : 1;
  };

  S.computeWtp = function (state, c, car, interest) {
    const t = typeOf(c);
    const base =
      car.value * G().valueMod(state) * S.storeBonus(state) * (0.86 + 0.22 * interest) * t.wtpMod *
      (1 + state.player.skills.negotiation * 0.008) * (0.92 + 0.08 * c.intent);
    const cap = c.budget * (c.needsFinancing ? 1.08 : 1);
    return Math.round(Math.min(base, cap));
  };

  // Lowest price the employer's sales manager signs off on.
  S.floorPrice = function (state, car) {
    if (!state.player.employed || state.player.rank >= 2) return null;
    return U.roundTo(car.cost + 250, 50);
  };

  S.startNegotiation = function (state) {
    const deal = state.deal;
    const c = S.dealCustomer(state);
    const car = S.dealCar(state);
    if (!deal || deal.stage !== 'select' || !car) return fail('Pick a car first.');
    const t = typeOf(c);
    const interest = deal.presented[car.id];
    deal.wtp = S.computeWtp(state, c, car, interest);
    deal.listPrice = DS.cars.listPrice(car, G().workplaceMarkup(state));
    deal.counter = U.roundTo(Math.min(deal.wtp * U.rand(t.opener[0], t.opener[1]), deal.listPrice * 0.97), 50);
    deal.lastOffer = null;
    deal.stage = 'negotiate';
    say(state, 'you', `Let's talk numbers on the ${car.model}. It's listed at ${U.money(deal.listPrice)}.`);
    say(state, 'them', U.pick([`I was thinking more like ${U.money(deal.counter)}.`, `What if we said ${U.money(deal.counter)}?`, `I can do ${U.money(deal.counter)}. What do you say?`]));
    spend(state, 3);
    return ok('Negotiation started.');
  };

  S.backToLot = function (state) {
    const deal = state.deal;
    const c = S.dealCustomer(state);
    if (!deal || deal.stage !== 'negotiate') return fail('Not the right time for that.');
    deal.stage = 'select';
    c.patience = Math.max(1, c.patience - 1);
    c.mood = U.clamp(c.mood - 3, 0, 100);
    say(state, 'you', 'Let me show you something else.');
    return ok('Back to the lot.');
  };

  const walkout = function (state, reason) {
    const c = S.dealCustomer(state);
    const deal = state.deal;
    c.status = 'left';
    c.leftReason = reason;
    deal.stage = 'walked';
    deal.walkReason = reason;
    state.player.stats.walkouts++;
    state.today.walkouts++;
    const d = G().activeStore(state);
    if (d) d.rep = U.clamp(d.rep - 0.8, 0, 100);
    else state.player.rep = U.clamp(state.player.rep - 1, 0, 100);
    say(state, 'them', U.pick(["Forget it. I'm going to shop around.", "This is a waste of my time. I'm out.", "I'll take my business elsewhere."]));
    G().log(state, `🚶 ${c.name} walked out (${reason}).`, 'bad');
  };

  S.makeOffer = function (state, price) {
    const deal = state.deal;
    const c = S.dealCustomer(state);
    const car = S.dealCar(state);
    if (!deal || deal.stage !== 'negotiate' || !car) return fail('Not negotiating right now.');
    price = Math.round(Number(price));
    if (!isFinite(price) || price <= 0) return fail('Enter a valid price.');
    const floor = S.floorPrice(state, car);
    if (floor && price < floor) return fail(`Your manager won't approve anything under ${U.money(floor)}.`);
    const t = typeOf(c);
    deal.rounds++;
    say(state, 'you', `I can do ${U.money(price)}.`);
    spend(state, T.offer);

    if (price <= deal.counter || price <= deal.wtp) {
      deal.agreedPrice = price;
      deal.stage = 'fi';
      c.mood = U.clamp(c.mood + 3, 0, 100);
      say(state, 'them', price <= deal.counter ? "Even better than I asked? You've got a deal!" : U.pick(["You know what? Deal!", 'Alright, you got me. Deal.', "That works. Let's do it!"]));
      return ok('Deal! Price agreed at ' + U.money(price) + '.');
    }

    const gapPct = ((price - deal.wtp) / deal.wtp) * 100;
    let loss = (3 + gapPct * 1.5) * t.priceSens * (1 - state.player.skills.negotiation * 0.035);
    if (deal.lastOffer !== null && price < deal.lastOffer) loss *= 0.65;
    else if (deal.lastOffer !== null) {
      loss *= 1.6;
      say(state, 'them', "You haven't budged at all!");
    }
    c.mood = U.clamp(Math.round(c.mood - loss), 0, 100);
    c.patience--;
    deal.lastOffer = price;

    if (c.mood <= 5 || c.patience <= 0) {
      walkout(state, c.patience <= 0 ? 'ran out of patience' : 'felt pressured');
      return { ok: true, msg: `${c.name} walked out!`, walked: true };
    }

    const next = U.roundTo(deal.counter + (deal.wtp - deal.counter) * U.rand(0.3, 0.55), 50);
    deal.counter = Math.max(deal.counter, Math.min(next, deal.wtp));
    if (c.patience === 1) say(state, 'them', `${U.money(deal.counter)}. That's my final offer — take it or leave it.`);
    else say(state, 'them', U.pick([`Too rich for me. How about ${U.money(deal.counter)}?`, `I can stretch to ${U.money(deal.counter)}.`, `Meet me at ${U.money(deal.counter)}?`, `${U.money(deal.counter)} is the best I can do right now.`]));
    return ok(`They countered at ${U.money(deal.counter)}.`);
  };

  S.acceptCounter = function (state) {
    const deal = state.deal;
    const c = S.dealCustomer(state);
    const car = S.dealCar(state);
    if (!deal || deal.stage !== 'negotiate' || !car) return fail('Not negotiating right now.');
    const floor = S.floorPrice(state, car);
    if (floor && deal.counter < floor) return fail(`Your manager won't approve ${U.money(deal.counter)}. The floor is ${U.money(floor)}.`);
    deal.agreedPrice = deal.counter;
    deal.stage = 'fi';
    c.mood = U.clamp(c.mood + 6, 0, 100);
    say(state, 'you', `You've got a deal at ${U.money(deal.counter)}.`);
    say(state, 'them', 'Fantastic!');
    spend(state, 2);
    return ok('Deal at ' + U.money(deal.counter) + '.');
  };

  S.assistLabel = (state) => (state.player.employed ? 'Talk to your manager' : 'Throw in floor mats & a full tank ($250)');

  S.assist = function (state) {
    const deal = state.deal;
    const c = S.dealCustomer(state);
    if (!deal || deal.stage !== 'negotiate') return fail('Not negotiating right now.');
    if (deal.assistUsed) return fail('You already played that card.');
    deal.assistUsed = true;
    if (state.player.employed) {
      c.mood = U.clamp(c.mood + 8 + Math.round(state.player.skills.charisma * 0.5), 0, 100);
      c.patience++;
      deal.wtp = Math.round(deal.wtp * 1.01);
      say(state, 'you', 'Let me go talk to my manager and see what I can do for you.');
      say(state, 'system', 'You return with coffee and a smile. The customer appreciates the effort.');
    } else {
      c.mood = U.clamp(c.mood + 10, 0, 100);
      c.patience++;
      deal.freebieCost += 250;
      say(state, 'you', "Tell you what — I'll throw in all-weather floor mats and a full tank.");
      say(state, 'them', 'Oh, that is a nice touch.');
    }
    spend(state, T.assist);
    return ok('The customer warms up a little.');
  };

  S.productChance = function (state, pid) {
    const c = S.dealCustomer(state);
    const deal = state.deal;
    const p = D.PRODUCTS[pid];
    const t = typeOf(c);
    if (pid === 'financing') return U.clamp((c.needsFinancing ? 0.85 : 0.22) * (0.6 + c.mood / 250), 0.05, 0.95);
    if (p.needsFinancing && deal.products.financing !== 'accepted') return 0;
    const aff = (p.affinity && p.affinity[c.type]) || 1;
    return U.clamp(t.addon * aff * (0.5 + c.mood / 100) * (1 + state.player.skills.charisma * 0.04), 0.03, 0.92);
  };

  S.productProfit = function (state, pid) {
    const p = D.PRODUCTS[pid];
    if (pid === 'financing') return Math.round((state.deal.agreedPrice || 0) * p.pct);
    return p.price - p.cost;
  };

  S.pitchProduct = function (state, pid) {
    const deal = state.deal;
    const c = S.dealCustomer(state);
    const p = D.PRODUCTS[pid];
    if (!deal || deal.stage !== 'fi' || !p) return fail('Not the right time.');
    if (deal.products[pid]) return fail('Already pitched.');
    if (p.needsFinancing && deal.products.financing !== 'accepted') return fail('Only available with dealer financing.');
    const chance = S.productChance(state, pid);
    const yes = U.chance(chance);
    deal.products[pid] = yes ? 'accepted' : 'declined';
    say(state, 'you', pid === 'financing' ? 'We can handle the financing for you right here.' : `Would you like to add the ${p.label}?`);
    if (yes) {
      c.mood = U.clamp(c.mood - 1, 0, 100);
      say(state, 'them', U.pick(['Sure, that sounds smart.', 'Yeah, add it.', 'Peace of mind is worth it.']));
    } else {
      c.mood = U.clamp(c.mood - (c.type === 'bargain' ? 8 : 5), 0, 100);
      say(state, 'them', U.pick(['No thanks.', "I'll pass.", "Please, no more add-ons."]));
    }
    spend(state, p.mins);
    return ok(yes ? `${p.label}: accepted!` : `${p.label}: declined.`);
  };

  S.finalize = function (state) {
    const deal = state.deal;
    const c = S.dealCustomer(state);
    const car = S.dealCar(state);
    if (!deal || deal.stage !== 'fi' || !car) return fail('Nothing to finalize.');
    const p = state.player;
    const wp = G().workplace(state);
    const price = deal.agreedPrice;
    const front = price - car.cost - deal.freebieCost;
    const accepted = Object.keys(deal.products).filter((k) => deal.products[k] === 'accepted');
    const back = U.sum(accepted, (k) => S.productProfit(state, k));
    const interest = deal.presented[car.id] || 0.5;
    const satisfaction = Math.round(U.clamp(c.mood + 15 + (interest - 0.7) * 25 + (price < deal.listPrice * 0.95 ? 6 : 0), 0, 100));

    let earned;
    let commission = null;
    if (p.employed) {
      const r = G().rank(state);
      commission = Math.round(Math.max(150, front * r.front) + Math.max(0, back) * r.back);
      earned = commission;
      p.cash += commission;
      p.rep = U.clamp(p.rep + (satisfaction - 50) / 16, 0, 100);
    } else {
      const d = G().activeStore(state);
      earned = front + back;
      p.cash += price + back - deal.freebieCost;
      d.today.personalSales++;
      d.today.personalFront += front;
      d.today.personalBack += back;
      d.today.revenue += price;
      d.rep = U.clamp(d.rep + (satisfaction - 50) / 16, 0, 100);
      p.rep = U.clamp(p.rep + (satisfaction - 50) / 30, 0, 100);
      state.groupSold++;
    }

    wp.inventory = wp.inventory.filter((x) => x.id !== car.id);
    c.status = 'sold';

    const st = p.stats;
    st.sales++;
    st.grossFront += front;
    st.grossBack += back;
    st.earned += earned;
    st.bestFront = Math.max(st.bestFront, front);
    st.maxAddons = Math.max(st.maxAddons, accepted.length);
    st.bestSat = Math.max(st.bestSat, satisfaction);
    state.today.sales++;
    state.today.earned += earned;
    state.today.front += front;
    state.today.back += back;

    const xp = Math.round(25 + Math.max(0, front) / 80 + back / 150 + satisfaction / 10);
    const levels = G().addXp(state, xp);

    deal.summary = {
      car: Object.assign({}, car),
      customerName: c.name,
      price,
      listPrice: deal.listPrice,
      front,
      back,
      products: accepted,
      commission,
      earned,
      satisfaction,
      xp,
      levels,
    };
    deal.stage = 'summary';
    say(state, 'them', satisfaction >= 70 ? 'Thank you so much! I can\'t wait to drive it home.' : 'Alright. Where do I sign?');
    spend(state, T.finalize);
    G().log(state, `🚗 Sold a ${DS.cars.name(car)} to ${c.name} for ${U.money(price)} — you earned ${U.money(earned)}.`, 'good');
    G().checkAchievements(state);
    return ok('SOLD!');
  };

  S.abandon = function (state, silent) {
    const deal = state.deal;
    if (!deal) return fail('No active customer.');
    const c = S.dealCustomer(state);
    if (deal.stage !== 'summary' && deal.stage !== 'walked' && c) {
      c.status = 'left';
      c.leftReason = silent ? 'Showroom closed' : 'You let them go';
      if (!silent) G().log(state, `👋 You let ${c.name} go without a sale.`, 'info');
    }
    state.deal = null;
    return ok('Back to the showroom.');
  };

  S.closeDeal = function (state) {
    state.deal = null;
    return ok('Back to the showroom.');
  };
})(typeof window !== 'undefined' ? window : globalThis);
