/* Game state, progression, day cycle, events, achievements and persistence. */
(function (root) {
  const DS = (root.DS = root.DS || {});
  const U = DS.util;
  const D = DS.data;

  const G = (DS.game = {});
  G.SAVE_KEY = 'the-dealership-save-v1';
  G.VERSION = 1;

  const blankToday = () => ({ sales: 0, earned: 0, front: 0, back: 0, walkouts: 0 });

  G.newGame = function (name) {
    const state = {
      version: G.VERSION,
      day: 1,
      minutes: 0,
      player: {
        name: (name || '').trim().slice(0, 24) || 'Rookie',
        cash: 1500,
        employed: true,
        rank: 0,
        rep: 50,
        xp: 0,
        level: 1,
        skillPoints: 1,
        trainings: 0,
        skills: { charisma: 1, negotiation: 1, knowledge: 1, leadership: 1 },
        stats: { sales: 0, grossFront: 0, grossBack: 0, earned: 0, walkouts: 0, bestFront: 0, maxAddons: 0, bestSat: 0 },
      },
      employer: { name: D.EMPLOYER.name, city: D.EMPLOYER.city, inventory: [] },
      dealerships: [],
      activeStoreId: null,
      customers: [],
      deal: null,
      auction: [],
      listings: [],
      candidates: [],
      loans: [],
      events: [],
      log: [],
      achievements: {},
      today: blankToday(),
      history: [],
      groupSold: 0,
      insolventDays: 0,
      flags: { won: false, gameOver: false, hadLoan: false },
    };
    G.restockEmployer(state);
    DS.biz.refreshListings(state, true);
    DS.biz.refreshCandidates(state);
    DS.biz.refreshAuction(state);
    DS.sales.startDay(state, 0);
    G.log(state, `${state.player.name} starts the first day as a Sales Associate at ${D.EMPLOYER.name}.`, 'info');
    G.recordHistory(state);
    return state;
  };

  // ---------- Accessors ----------
  G.isOwner = (state) => !state.player.employed;
  G.store = (state, id) => state.dealerships.find((d) => d.id === id) || null;
  G.activeStore = function (state) {
    if (state.player.employed) return null;
    return G.store(state, state.activeStoreId) || state.dealerships[0] || null;
  };
  // Where the player personally sells today.
  G.workplace = function (state) {
    if (state.player.employed) return state.employer;
    return G.activeStore(state);
  };
  G.workplaceMarkup = function (state) {
    const d = G.activeStore(state);
    return d ? D.STRATEGIES[d.strategy].sticker : 1.07;
  };
  G.rank = (state) => D.RANKS[state.player.rank];

  G.log = function (state, text, type) {
    state.log.unshift({ day: state.day, text, type: type || 'info' });
    if (state.log.length > 200) state.log.length = 200;
  };

  // ---------- Market modifiers from active events ----------
  const eventDefs = (state) => state.events.map((e) => D.EVENTS.find((x) => x.id === e.id)).filter(Boolean);
  G.demandMod = (state, cls) => eventDefs(state).reduce((m, e) => m * ((e.demand && e.demand[cls]) || 1), 1);
  G.trafficMod = (state) => eventDefs(state).reduce((m, e) => m * (e.traffic || 1), 1);
  G.closeMod = (state) => eventDefs(state).reduce((m, e) => m * (e.close || 1), 1);
  G.valueMod = (state) => eventDefs(state).reduce((m, e) => m * (e.value || 1), 1);

  G.tickEvents = function (state, report) {
    state.events.forEach((e) => e.daysLeft--);
    state.events
      .filter((e) => e.daysLeft <= 0)
      .forEach((e) => {
        const def = D.EVENTS.find((x) => x.id === e.id);
        if (def) G.log(state, `${def.icon} ${def.title} has ended.`, 'event');
      });
    state.events = state.events.filter((e) => e.daysLeft > 0);
    if (state.events.length < 2 && U.chance(0.11)) {
      const options = D.EVENTS.filter((def) => !state.events.some((e) => e.id === def.id));
      const def = U.pick(options);
      if (def) {
        state.events.push({ id: def.id, daysLeft: U.randInt(def.days[0], def.days[1]) });
        G.log(state, `${def.icon} ${def.title}: ${def.text}`, 'event');
        if (report) report.events.push(def);
      }
    }
  };

  // ---------- Employer ----------
  G.restockEmployer = function (state) {
    const inv = state.employer.inventory;
    const target = D.EMPLOYER.inventorySize;
    const adds = inv.length === 0 ? target : Math.min(target - inv.length, U.randInt(2, 5));
    for (let i = 0; i < adds; i++) {
      inv.push(DS.cars.randomFor(state, { city: state.employer.city, isNew: U.chance(0.3) }));
    }
  };

  // ---------- Experience & skills ----------
  G.xpForLevel = (level) => Math.round(100 * Math.pow(level, 1.4));
  G.addXp = function (state, amount) {
    const p = state.player;
    p.xp += Math.round(amount);
    let leveled = 0;
    while (p.xp >= G.xpForLevel(p.level)) {
      p.xp -= G.xpForLevel(p.level);
      p.level++;
      p.skillPoints++;
      leveled++;
      G.log(state, `🎉 Level up! You reached level ${p.level} and earned a skill point.`, 'good');
    }
    return leveled;
  };

  G.SKILLS = {
    charisma: { label: 'Charisma', icon: '😊', desc: 'Better small talk, happier customers, more add-on sales.' },
    negotiation: { label: 'Negotiation', icon: '🤝', desc: 'Customers pay more and get less annoyed by your counters.' },
    knowledge: { label: 'Product Knowledge', icon: '📚', desc: 'Pitch cars better and read budgets more accurately.' },
    leadership: { label: 'Leadership', icon: '👔', desc: 'Your staff close more deals at every store you own.' },
  };
  G.MAX_SKILL = 10;

  G.upgradeSkill = function (state, skill) {
    const p = state.player;
    if (!G.SKILLS[skill]) return { ok: false, msg: 'Unknown skill.' };
    if (p.skillPoints <= 0) return { ok: false, msg: 'No skill points available.' };
    if (p.skills[skill] >= G.MAX_SKILL) return { ok: false, msg: 'Already maxed out.' };
    p.skillPoints--;
    p.skills[skill]++;
    return { ok: true, msg: `${G.SKILLS[skill].label} increased to ${p.skills[skill]}.` };
  };

  G.trainingCost = (state) => Math.round(2500 * Math.pow(1.75, state.player.trainings) / 100) * 100;
  G.buyTraining = function (state) {
    const p = state.player;
    const cost = G.trainingCost(state);
    if (p.cash < cost) return { ok: false, msg: `You need ${U.money(cost)} for the seminar.` };
    p.cash -= cost;
    p.trainings++;
    p.skillPoints++;
    G.log(state, `📖 You attended a sales seminar (${U.money(cost)}) and gained a skill point.`, 'info');
    return { ok: true, msg: 'Seminar complete: +1 skill point.' };
  };

  // ---------- Career ----------
  G.promotionProgress = function (state) {
    const p = state.player;
    const next = D.RANKS[p.rank + 1];
    if (!p.employed || !next || !next.req) return null;
    return {
      title: next.title,
      items: [
        { label: 'Cars sold', cur: p.stats.sales, req: next.req.sales, fmt: U.num },
        { label: 'Front gross generated', cur: p.stats.grossFront, req: next.req.gross, fmt: U.money },
        { label: 'Customer satisfaction (rep)', cur: Math.round(p.rep), req: next.req.rep, fmt: U.num },
      ],
    };
  };

  G.checkPromotion = function (state) {
    const prog = G.promotionProgress(state);
    if (!prog) return null;
    if (prog.items.every((i) => i.cur >= i.req)) {
      state.player.rank++;
      state.player.skillPoints++;
      const r = G.rank(state);
      G.log(state, `🎖️ Promoted to ${r.title}! Base pay is now ${U.money(r.weekly)}/week.`, 'good');
      return r;
    }
    return null;
  };

  G.updateOwnerRank = function (state) {
    const p = state.player;
    if (p.employed) return;
    const n = state.dealerships.length;
    let rank = 4;
    if (n >= 2) rank = 5;
    if (n >= D.WIN_STORES && G.netWorth(state) >= D.WIN_NET_WORTH) rank = 6;
    p.rank = rank;
  };

  G.canBuyTier = function (state, tierId) {
    const t = D.TIERS[tierId];
    const p = state.player;
    const owned = state.dealerships.length;
    const reasons = [];
    if (p.employed && p.rank < t.minRank) reasons.push(`Reach ${D.RANKS[t.minRank].title} so a bank will back you`);
    if (owned < t.minOwned) reasons.push(`Own at least ${t.minOwned} dealership${t.minOwned > 1 ? 's' : ''}`);
    return { ok: reasons.length === 0, reasons };
  };

  // ---------- Money ----------
  G.loanBalance = (state) => U.sum(state.loans, (l) => l.balance);
  G.assetValue = (state) => U.sum(state.dealerships, (d) => DS.biz.value(state, d));
  G.netWorth = (state) => Math.round(state.player.cash + G.assetValue(state) - G.loanBalance(state));

  G.recordHistory = function (state) {
    state.history.push({ day: state.day, netWorth: G.netWorth(state), cash: Math.round(state.player.cash) });
    if (state.history.length > 365) state.history.shift();
  };

  // ---------- Achievements ----------
  G.ACHIEVEMENTS = [
    { id: 'firstSale', icon: '🔑', title: 'First Deal', desc: 'Sell your first car.', check: (s) => s.player.stats.sales >= 1 },
    { id: 'tenSales', icon: '🔟', title: 'Closer', desc: 'Personally sell 10 cars.', check: (s) => s.player.stats.sales >= 10 },
    { id: 'fiftySales', icon: '🦈', title: 'Showroom Shark', desc: 'Personally sell 50 cars.', check: (s) => s.player.stats.sales >= 50 },
    { id: 'hundredSales', icon: '🏅', title: 'Hall of Fame', desc: 'Personally sell 150 cars.', check: (s) => s.player.stats.sales >= 150 },
    { id: 'bigDeal', icon: '🐋', title: 'Whale', desc: 'Make $5,000+ front gross on a single deal.', check: (s) => s.player.stats.bestFront >= 5000 },
    { id: 'fiMaster', icon: '🧙', title: 'F&I Wizard', desc: 'Sell 4 or more add-ons in one deal.', check: (s) => s.player.stats.maxAddons >= 4 },
    { id: 'happy', icon: '😍', title: 'Customer for Life', desc: 'Earn a 95+ satisfaction score.', check: (s) => s.player.stats.bestSat >= 95 },
    { id: 'senior', icon: '📈', title: 'Moving Up', desc: 'Get promoted to Senior Sales Consultant.', check: (s) => s.player.rank >= 1 },
    { id: 'manager', icon: '📋', title: "The Manager's Desk", desc: 'Get promoted to Sales Manager.', check: (s) => s.player.rank >= 2 },
    { id: 'gm', icon: '🗝️', title: 'Running the Show', desc: 'Get promoted to General Manager.', check: (s) => s.player.rank >= 3 },
    { id: 'owner', icon: '🪧', title: 'Your Name on the Sign', desc: 'Buy your first dealership.', check: (s) => s.dealerships.length >= 1 },
    { id: 'franchise', icon: '🏢', title: 'Factory Authorized', desc: 'Own a franchise dealership.', check: (s) => s.dealerships.some((d) => d.tier === 'franchise') },
    { id: 'three', icon: '🏘️', title: 'Auto Group', desc: 'Own 3 dealerships at once.', check: (s) => s.dealerships.length >= 3 },
    { id: 'mega', icon: '🏟️', title: 'Mall Magnate', desc: 'Own a Mega Auto Mall.', check: (s) => s.dealerships.some((d) => d.tier === 'mega') },
    { id: 'five', icon: '🗺️', title: 'Regional Powerhouse', desc: 'Own 5 dealerships at once.', check: (s) => s.dealerships.length >= 5 },
    { id: 'thousand', icon: '🚚', title: 'Volume Dealer', desc: 'Your group sells 1,000 cars.', check: (s) => s.groupSold >= 1000 },
    { id: 'hundredK', icon: '💵', title: 'Six Figures', desc: 'Reach a $100k net worth.', check: (s) => G.netWorth(s) >= 1e5 },
    { id: 'million', icon: '💰', title: 'Millionaire', desc: 'Reach a $1M net worth.', check: (s) => G.netWorth(s) >= 1e6 },
    { id: 'tenMillion', icon: '🏦', title: 'Eight Figures', desc: 'Reach a $10M net worth.', check: (s) => G.netWorth(s) >= 1e7 },
    { id: 'debtFree', icon: '🕊️', title: 'Debt Free', desc: 'Pay off every business loan.', check: (s) => s.flags.hadLoan && s.loans.length === 0 },
    { id: 'mogul', icon: '👑', title: 'Automotive Mogul', desc: 'Own 5 dealerships and reach a $25M net worth.', check: (s) => s.dealerships.length >= D.WIN_STORES && G.netWorth(s) >= D.WIN_NET_WORTH },
  ];

  G.checkAchievements = function (state) {
    const unlocked = [];
    G.ACHIEVEMENTS.forEach((a) => {
      if (!state.achievements[a.id] && a.check(state)) {
        state.achievements[a.id] = state.day;
        unlocked.push(a);
        G.log(state, `🏆 Achievement unlocked: ${a.title}`, 'good');
      }
    });
    return unlocked;
  };

  // ---------- Day cycle ----------
  G.endDay = function (state) {
    if (state.flags.gameOver) return null;
    const p = state.player;
    const report = {
      day: state.day,
      personal: Object.assign({}, state.today),
      lines: [],
      stores: [],
      events: [],
      promotion: null,
      achievements: [],
      won: false,
      gameOver: false,
    };
    if (state.deal) DS.sales.abandon(state, true);
    const cashBefore = p.cash;

    if (p.employed) {
      const r = G.rank(state);
      if (r.override[1] > 0) {
        const o = U.randInt(r.override[0], r.override[1]);
        p.cash += o;
        report.lines.push(['Management override on team sales', o]);
      }
      if (state.day % 7 === 0) {
        p.cash += r.weekly;
        report.lines.push(['Weekly base salary', r.weekly]);
      }
    } else {
      state.dealerships.forEach((d) => report.stores.push(DS.biz.simulateDay(state, d)));
      DS.biz.processLoans(state, report);
    }

    if (state.day % 7 === 0) {
      const living = Math.round(D.WEEKLY_LIVING * (p.employed ? 1 : 2.5));
      p.cash -= living;
      report.lines.push(['Personal living expenses', -living]);
    }

    if (p.cash < 0) {
      const interest = Math.round(p.cash * 0.0008);
      p.cash += interest;
      report.lines.push(['Overdraft interest', interest]);
    }

    const limit = p.employed ? -5000 : -(25000 + 0.2 * G.assetValue(state));
    if (p.cash < limit) {
      state.insolventDays++;
      G.log(state, `⚠️ The bank is worried: you're deep in overdraft (${7 - state.insolventDays} days until default).`, 'bad');
      if (state.insolventDays >= 7) {
        state.flags.gameOver = true;
        report.gameOver = true;
        G.log(state, '💥 You defaulted on your obligations. Game over.', 'bad');
      }
    } else {
      state.insolventDays = 0;
    }

    G.tickEvents(state, report);

    state.day++;
    state.minutes = 0;
    state.today = blankToday();
    if (p.employed) G.restockEmployer(state);
    DS.biz.refreshAuction(state);
    if (state.day % 7 === 1) {
      DS.biz.refreshListings(state);
      DS.biz.refreshCandidates(state);
    }
    DS.sales.startDay(state, 0);

    report.promotion = G.checkPromotion(state);
    G.updateOwnerRank(state);
    report.achievements = G.checkAchievements(state);
    G.recordHistory(state);
    report.netWorth = G.netWorth(state);
    if (!state.flags.won && p.rank === 6) {
      state.flags.won = true;
      report.won = true;
      G.log(state, '👑 You are an Automotive Mogul! You won — keep building your empire if you like.', 'good');
    }
    return report;
  };

  // Fast-forward several days (owners). Personal sales are skipped.
  G.skipDays = function (state, n) {
    const reports = [];
    for (let i = 0; i < n && !state.flags.gameOver; i++) {
      reports.push(G.endDay(state));
    }
    return reports;
  };

  G.clockLabel = function (minutes) {
    const total = D.OPEN_HOUR * 60 + Math.min(minutes, D.DAY_MINUTES + 240);
    const h = Math.floor(total / 60);
    const m = total % 60;
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  G.weekday = (day) => D.WEEKDAYS[(day - 1) % 7];
  G.isClosed = (state) => state.minutes >= D.DAY_MINUTES;

  // ---------- Persistence ----------
  G.save = function (state) {
    try {
      root.localStorage.setItem(G.SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  };
  G.load = function () {
    try {
      const raw = root.localStorage.getItem(G.SAVE_KEY);
      if (!raw) return null;
      return G.migrate(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  };
  G.hasSave = function () {
    try {
      return !!root.localStorage.getItem(G.SAVE_KEY);
    } catch (e) {
      return false;
    }
  };
  G.deleteSave = function () {
    try {
      root.localStorage.removeItem(G.SAVE_KEY);
    } catch (e) {
      /* storage unavailable */
    }
  };
  G.migrate = function (state) {
    if (!state || typeof state !== 'object' || !state.player) return null;
    state.flags = Object.assign({ won: false, gameOver: false, hadLoan: false }, state.flags);
    state.today = state.today || blankToday();
    state.history = state.history || [];
    state.groupSold = state.groupSold || 0;
    return state;
  };
})(typeof window !== 'undefined' ? window : globalThis);
