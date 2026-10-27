/* Rendering and input handling. Everything is re-rendered from state after each action. */
(function (root) {
  const DS = root.DS;
  const U = DS.util;
  const D = DS.data;
  const G = DS.game;
  const S = DS.sales;
  const B = DS.biz;
  const C = DS.cars;

  const UI = (DS.ui = {});
  let state = null;
  const ui = { tab: 'showroom', storeId: null, storeTab: 'overview', invFilter: 'all', dest: null, down: {} };
  const modalQueue = [];

  const $ = (sel) => document.querySelector(sel);
  const esc = U.escape;
  const money = U.money;

  // ---------- Small building blocks ----------
  const attrs = (data) =>
    Object.entries(data || {})
      .map(([k, v]) => `data-${k}="${esc(v)}"`)
      .join(' ');
  const btn = (label, act, data, cls, disabled, title) =>
    `<button class="btn ${cls || ''}" data-act="${act}" ${attrs(data)} ${disabled ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}>${label}</button>`;
  const bar = (pct, cls) => `<div class="bar ${cls || ''}"><span style="width:${U.clamp(pct, 0, 100)}%"></span></div>`;
  const chip = (text, cls) => `<span class="chip ${cls || ''}">${text}</span>`;
  const pips = (n, max, cls) => `<span class="pips ${cls || ''}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  const signed = (v) => `<span class="${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}">${money(v)}</span>`;
  const moodFace = (m) => (m >= 75 ? '😄' : m >= 55 ? '🙂' : m >= 35 ? '😐' : m >= 15 ? '😠' : '🤬');
  const moodCls = (m) => (m >= 60 ? 'good' : m >= 30 ? 'warn' : 'bad');
  const clsLabel = (cls) => D.CLASSES[cls].label;
  const carMeta = (car) => `${car.isNew ? 'New' : U.num(car.mileage) + ' mi'} · ${C.conditionLabel(car.condition)}`;
  const empty = (icon, title, text, extra) => `<div class="empty"><div class="empty-icon">${icon}</div><h3>${title}</h3><p>${text}</p>${extra || ''}</div>`;

  // ---------- Toasts & modals ----------
  UI.toast = function (msg, type) {
    if (!msg) return;
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${type || ''}`;
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  };

  function showModal(html, opts) {
    modalQueue.push({ html, opts: opts || {} });
    if (modalQueue.length === 1) drawModal();
  }
  function drawModal() {
    const root = $('#modal');
    const m = modalQueue[0];
    if (!m) {
      root.innerHTML = '';
      root.classList.remove('open');
      return;
    }
    root.innerHTML = `<div class="modal-backdrop" data-act="${m.opts.locked ? '' : 'closeModal'}"></div><div class="modal ${m.opts.cls || ''}" role="dialog" aria-modal="true">${m.html}</div>`;
    root.classList.add('open');
    const focus = root.querySelector('[autofocus]') || root.querySelector('.modal .btn.primary');
    if (focus) focus.focus();
  }
  function closeModal() {
    modalQueue.shift();
    drawModal();
  }
  function confirmModal(title, text, act, data, label) {
    showModal(
      `<h2>${title}</h2><p>${text}</p><div class="modal-actions">${btn('Cancel', 'closeModal')}${btn(label || 'Confirm', act, data, 'primary')}</div>`
    );
  }

  function result(res, quiet) {
    if (!res) return;
    if (!res.ok) UI.toast(res.msg, 'bad');
    else if (!quiet) UI.toast(res.msg, 'good');
    commit();
  }
  function commit() {
    if (state) G.save(state);
    UI.render();
  }

  // ---------- Layout ----------
  UI.render = function () {
    const app = $('#app');
    if (!state) {
      app.innerHTML = titleScreen();
      return;
    }
    if (ui.storeId && !G.store(state, ui.storeId)) ui.storeId = null;
    const tabs = navTabs();
    if (!tabs.some((t) => t.id === ui.tab)) ui.tab = 'showroom';
    app.innerHTML =
      header() +
      `<nav class="tabs">${tabs
        .map((t) => `<button class="tab ${ui.tab === t.id ? 'active' : ''}" data-act="tab" data-id="${t.id}">${t.icon}<span>${t.label}</span>${t.badge ? `<b class="badge">${t.badge}</b>` : ''}</button>`)
        .join('')}</nav>` +
      `<div class="layout"><main id="view" class="view-${ui.tab}">${view()}</main><aside class="feed">${feed()}</aside></div>`;
    const chat = $('#chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
    updateOfferPreview();
  };

  function navTabs() {
    const owner = G.isOwner(state);
    const waiting = S.visibleCustomers(state).filter((c) => c.status === 'waiting').length;
    const tabs = [{ id: 'showroom', icon: '🚘', label: 'Showroom', badge: state.deal ? '●' : waiting || '' }];
    if (owner) {
      tabs.push({ id: 'empire', icon: '📊', label: 'Empire' });
      tabs.push({ id: 'stores', icon: '🏢', label: 'Stores' });
      tabs.push({ id: 'auction', icon: '🔨', label: 'Auction' });
      tabs.push({ id: 'hiring', icon: '🧑‍💼', label: 'Hiring' });
    } else {
      tabs.push({ id: 'career', icon: '🎖️', label: 'Career' });
    }
    tabs.push({ id: 'market', icon: '🪧', label: 'Buy a Dealership' });
    if (owner) tabs.push({ id: 'bank', icon: '🏦', label: 'Bank', badge: state.loans.length || '' });
    tabs.push({ id: 'skills', icon: '⭐', label: 'Skills', badge: state.player.skillPoints || '' });
    tabs.push({ id: 'awards', icon: '🏆', label: 'Awards' });
    tabs.push({ id: 'log', icon: '📜', label: 'Log' });
    return tabs;
  }

  function header() {
    const p = state.player;
    const owner = G.isOwner(state);
    const store = G.activeStore(state);
    const rep = owner && store ? store.rep : p.rep;
    const closed = G.isClosed(state);
    return `<header class="topbar">
      <div class="brand"><span class="logo">🔑</span><div><b>The Dealership</b><small>${esc(p.name)} · ${G.rank(state).title}</small></div></div>
      <div class="stats">
        <div class="stat"><label>Day</label><span>${state.day} <em>${G.weekday(state.day)}</em></span></div>
        <div class="stat"><label>Clock</label><span class="${closed ? 'neg' : ''}">${closed ? 'Closed' : G.clockLabel(state.minutes)}</span></div>
        <div class="stat"><label>Cash</label><span class="${p.cash < 0 ? 'neg' : 'cash'}">${money(p.cash)}</span></div>
        <div class="stat"><label>Net worth</label><span>${money(G.netWorth(state), true)}</span></div>
        <div class="stat"><label>${owner ? 'Store rep' : 'Reputation'}</label><span>${Math.round(rep)}<em>/100</em></span></div>
      </div>
      <div class="actions">
        ${owner ? btn('⏩ Skip week', 'skipWeek', null, 'ghost', false, 'Simulate 7 days without working the floor') : ''}
        ${btn('End day ▶', 'endDay', null, 'primary')}
        ${btn('☰', 'menu', null, 'ghost icon', false, 'Menu')}
      </div>
    </header>`;
  }

  function feed() {
    const events = state.events
      .map((e) => {
        const def = D.EVENTS.find((x) => x.id === e.id);
        return def ? `<div class="event"><b>${def.icon} ${def.title}</b><small>${def.text} <em>${e.daysLeft}d left</em></small></div>` : '';
      })
      .join('');
    const log = state.log
      .slice(0, 16)
      .map((l) => `<li class="${l.type}"><span>D${l.day}</span>${esc(l.text)}</li>`)
      .join('');
    return `${events ? `<h4>Market news</h4>${events}` : ''}<h4>Activity</h4><ul class="log">${log}</ul>`;
  }

  function view() {
    switch (ui.tab) {
      case 'career': return viewCareer();
      case 'empire': return viewEmpire();
      case 'stores': return viewStores();
      case 'auction': return viewAuction();
      case 'hiring': return viewHiring();
      case 'market': return viewMarket();
      case 'bank': return viewBank();
      case 'skills': return viewSkills();
      case 'awards': return viewAwards();
      case 'log': return viewLog();
      default: return viewShowroom();
    }
  }

  // ---------- Title ----------
  function titleScreen() {
    const save = G.hasSave() ? G.load() : null;
    const carRow = ['sports', 'suv', 'sedan', 'truck', 'ev']
      .map((cls, i) => C.svg({ cls, color: D.COLORS[[4, 5, 0, 1, 10][i]] }, 'title-car'))
      .join('');
    return `<div class="title-screen">
      <div class="title-card">
        <div class="title-logo">🔑</div>
        <h1>The Dealership</h1>
        <p class="tag">Start on the sales floor. Build an automotive empire.</p>
        <div class="title-cars">${carRow}</div>
        <div class="title-form">
          <input id="player-name" type="text" maxlength="24" placeholder="Your name" autocomplete="off" />
          ${btn('Start your career', 'newGame', null, 'primary big')}
          ${save ? btn(`Continue — Day ${save.day}, ${D.RANKS[save.player.rank].title}`, 'continue', null, 'big') : ''}
        </div>
        <details class="howto"><summary>How to play</summary>${howToPlay()}</details>
      </div>
    </div>`;
  }

  function howToPlay() {
    return `<ol class="howto-list">
      <li><b>Work the floor.</b> Customers walk into the showroom throughout the day. Greet them, figure out what they want, show them the right car and negotiate a price.</li>
      <li><b>Read people.</b> Small talk reveals personality; asking about needs reveals the vehicle class and budget. Bargain hunters haggle, impulse buyers have no patience, high rollers pay for good service.</li>
      <li><b>Negotiate.</b> Customers have a hidden maximum price. Counter too high and their mood drops; run out of patience and they walk. Accepting their counter is always safe.</li>
      <li><b>F&amp;I.</b> After shaking hands, pitch financing, warranties and protection. Each "no" sours the mood a little — satisfaction drives your reputation.</li>
      <li><b>Get promoted.</b> Sales, gross profit and reputation earn promotions: Senior Consultant → Sales Manager → General Manager. Managers earn overrides on team sales.</li>
      <li><b>Buy a dealership.</b> As a Sales Manager the bank will finance up to 70% of a used car lot. Hire staff, set prices and marketing, buy inventory at auction.</li>
      <li><b>Build an empire.</b> Franchise dealerships and Mega Auto Malls unlock as you grow. Own ${D.WIN_STORES} stores and reach a ${money(D.WIN_NET_WORTH, true)} net worth to become an <b>Automotive Mogul</b>.</li>
    </ol>`;
  }

  // ---------- Showroom ----------
  function viewShowroom() {
    const wp = G.workplace(state);
    if (!wp) {
      return empty('🏚️', 'No dealership', "You don't own a store right now. Buy one to get back on the floor.", btn('Browse dealerships for sale', 'tab', { id: 'market' }, 'primary'));
    }
    if (state.deal) return viewDeal(wp);
    const closed = G.isClosed(state);
    const pct = (Math.min(state.minutes, D.DAY_MINUTES) / D.DAY_MINUTES) * 100;
    const left = Math.max(0, D.DAY_MINUTES - state.minutes);
    const customers = S.visibleCustomers(state).sort((a, b) => (a.status === 'waiting' ? 0 : 1) - (b.status === 'waiting' ? 0 : 1));
    const upcoming = S.upcomingCount(state);
    const cards = customers.map((c) => customerCard(c, closed)).join('');
    const city = D.CITIES[wp.city];
    return `<div class="section-head">
        <div><h2>${esc(wp.name)}</h2><p>${city.name} · ${wp.inventory.length} vehicles on the lot${state.player.employed ? ` · You are a ${G.rank(state).title}` : ''}</p></div>
      </div>
      <div class="clock card">
        <div class="clock-row"><b>${closed ? '🌙 Showroom closed' : `🕘 ${G.clockLabel(state.minutes)}`}</b><span>${closed ? 'End the day to continue.' : `${Math.floor(left / 60)}h ${left % 60}m until closing`}</span></div>
        ${bar(pct, 'time')}
      </div>
      ${state.day <= 2 && state.player.stats.sales < 2 ? tipCard() : ''}
      <div class="customers">${cards || empty('🪑', 'Quiet showroom', closed ? 'Everyone has gone home.' : 'Nobody is here yet. Customers trickle in throughout the day.')}</div>
      <div class="showroom-footer">
        <span>${closed ? '' : upcoming ? `🚶 ${upcoming} more customer${upcoming > 1 ? 's' : ''} expected later today.` : 'No more customers expected today.'}</span>
        ${!closed && upcoming ? btn('⏳ Wait for next customer', 'wait', null, 'ghost') : ''}
        ${closed || (!upcoming && !customers.some((c) => c.status === 'waiting')) ? btn('End day ▶', 'endDay', null, 'primary') : ''}
      </div>`;
  }

  function tipCard() {
    return `<div class="card tip"><b>💡 How a deal works</b>
      <span>1. Approach a customer · 2. Small talk &amp; ask about needs · 3. Present a matching car (a test drive helps) · 4. Negotiate · 5. Pitch add-ons and close.</span></div>`;
  }

  function customerCard(c, closed) {
    const t = D.CUSTOMER_TYPES[c.type];
    const wait = S.waitTime(state, c);
    const statusChip =
      c.status === 'sold' ? chip('Sold ✓', 'good') : c.status === 'left' ? chip(esc(c.leftReason || 'Left'), 'muted') : chip(`Waiting ${wait}m`, wait > 90 ? 'bad' : wait > 45 ? 'warn' : '');
    return `<div class="cust card ${c.status}">
      <div class="avatar">${c.avatar}</div>
      <div class="cust-body">
        <div class="cust-top"><b>${esc(c.name)}</b>${statusChip}</div>
        <div class="cust-type">${c.revealed.type ? `${t.icon} ${t.label}` : '❓ Unknown'}</div>
        <p class="hint">“${esc(c.hint)}”</p>
      </div>
      ${c.status === 'waiting' ? btn('Approach', 'approach', { id: c.id }, 'primary', closed) : ''}
    </div>`;
  }

  const STAGES = [
    ['discover', 'Meet'],
    ['select', 'Lot'],
    ['negotiate', 'Negotiate'],
    ['fi', 'F&I'],
    ['summary', 'Sold'],
  ];

  function viewDeal() {
    const deal = state.deal;
    const c = S.dealCustomer(state);
    const idx = STAGES.findIndex((s) => s[0] === deal.stage);
    const steps = STAGES.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}">${s[1]}</li>`).join('');
    let panel;
    switch (deal.stage) {
      case 'discover': panel = stageDiscover(c); break;
      case 'select': panel = stageSelect(c); break;
      case 'negotiate': panel = stageNegotiate(c); break;
      case 'fi': panel = stageFI(c); break;
      case 'summary': panel = stageSummary(); break;
      default: panel = stageWalked(c);
    }
    return `<div class="deal">
      <div class="deal-left">${customerPanel(c)}</div>
      <div class="deal-right">
        ${deal.stage !== 'walked' ? `<ol class="steps">${steps}</ol>` : ''}
        ${panel}
      </div>
    </div>`;
  }

  function customerPanel(c) {
    const t = D.CUSTOMER_TYPES[c.type];
    const deal = state.deal;
    const fact = (k, v) => `<div class="fact"><span>${k}</span><b>${v}</b></div>`;
    const wants = c.revealed.needs ? `${c.wantsNew ? 'New' : 'Pre-owned'} ${clsLabel(c.desired)}${c.alt ? ` <small>(or ${clsLabel(c.alt)})</small>` : ''}` : '???';
    const budget = c.budgetRange ? `${money(c.budgetRange[0], true)} – ${money(c.budgetRange[1], true)}` : '???';
    const chat = deal.chat
      .slice(-14)
      .map((m) => `<div class="msg ${m.who}">${m.who === 'them' ? `<span class="who">${c.avatar}</span>` : ''}<p>${esc(m.text)}</p></div>`)
      .join('');
    return `<div class="card cust-panel">
      <div class="cust-head">
        <div class="avatar big">${c.avatar}</div>
        <div><h3>${esc(c.name)}</h3><div class="cust-type">${c.revealed.type ? `${t.icon} ${t.label}` : '❓ Personality unknown'}</div></div>
      </div>
      <div class="meter"><span>Mood ${moodFace(c.mood)}</span>${bar(c.mood, moodCls(c.mood))}</div>
      <div class="meter"><span>Patience</span>${pips(c.patience, Math.max(c.patience, D.CUSTOMER_TYPES[c.type].patience[1] + 1), c.patience <= 1 ? 'bad' : '')}</div>
      <div class="facts">
        ${fact('Looking for', wants)}
        ${fact('Budget', budget)}
        ${fact('Financing', c.revealed.needs ? (c.needsFinancing ? 'Needs a loan' : 'Paying cash') : '???')}
      </div>
      <p class="hint">“${esc(c.hint)}”</p>
      <div class="chat" id="chat">${chat}</div>
    </div>`;
  }

  function stageDiscover(c) {
    const done = state.deal.done;
    const t = D.CUSTOMER_TYPES[c.type];
    const option = (act, icon, title, time, desc) =>
      `<button class="option ${done[act] ? 'used' : ''}" data-act="discover" data-id="${act}" ${done[act] ? 'disabled' : ''}>
        <span class="option-icon">${icon}</span><span><b>${title}</b><small>${desc}</small></span><em>${time}</em></button>`;
    const any = done.smalltalk || done.needs;
    return `<div class="card stage">
      <h3>Get to know ${esc(c.name.split(' ')[0])}</h3>
      <p class="muted">Every minute counts — but knowing your customer makes the sale.${c.revealed.type ? ` <b>${t.icon} ${t.label}:</b> ${t.desc}` : ''}</p>
      <div class="options">
        ${option('smalltalk', '💬', 'Small talk', '10m', 'Build rapport and read their personality. Some customers hate chit-chat.')}
        ${option('needs', '🎯', 'Ask about needs', '10m', 'Learn the vehicle they want and roughly what they can spend.')}
        <button class="option go" data-act="discover" data-id="lot"><span class="option-icon">🚗</span><span><b>${any ? 'Show them the lot' : 'Skip straight to the lot'}</b><small>${any ? 'Time to find the right car.' : 'Impatient customers appreciate speed. Others feel rushed.'}</small></span><em>→</em></button>
      </div>
      <div class="stage-foot">${btn('Let them go', 'abandon', null, 'ghost danger')}</div>
    </div>`;
  }

  function stageSelect(c) {
    const deal = state.deal;
    const wp = G.workplace(state);
    const markup = G.workplaceMarkup(state);
    const car = S.dealCar(state);
    let selected = '';
    if (car) {
      const r = S.reaction(deal.presented[car.id]);
      selected = `<div class="card selected-car">
        ${C.svg(car, 'big')}
        <div class="sel-body">
          <h3>${C.name(car)}</h3>
          <p class="muted">${clsLabel(car.cls)} · ${car.color.name} · ${carMeta(car)}</p>
          <div class="reaction">${r.face} <b>${r.label}</b></div>
          <div class="row">
            ${btn(deal.testDriven[car.id] ? 'Test driven ✓' : '🔑 Test drive (25m)', 'testDrive', null, '', deal.testDriven[car.id])}
            ${btn('Talk numbers →', 'negotiate', null, 'primary')}
          </div>
        </div>
      </div>`;
    }
    const counts = {};
    wp.inventory.forEach((x) => (counts[x.cls] = (counts[x.cls] || 0) + 1));
    if (ui.invFilter !== 'all' && !counts[ui.invFilter]) ui.invFilter = 'all';
    const filters = ['all'].concat(Object.keys(D.CLASSES).filter((k) => counts[k]));
    const fchips = filters
      .map((k) => {
        const wanted = c.revealed.needs && (k === c.desired || k === c.alt);
        return `<button class="fchip ${ui.invFilter === k ? 'on' : ''} ${wanted ? 'wanted' : ''}" data-act="invFilter" data-id="${k}">${k === 'all' ? 'All' : clsLabel(k)} <small>${k === 'all' ? wp.inventory.length : counts[k]}</small>${wanted ? ' ⭐' : ''}</button>`;
      })
      .join('');
    let list = wp.inventory.filter((x) => ui.invFilter === 'all' || x.cls === ui.invFilter);
    if (c.revealed.needs) list = list.slice().sort((a, b) => (b.cls === c.desired) - (a.cls === c.desired) || a.value - b.value);
    else list = list.slice().sort((a, b) => a.cls.localeCompare(b.cls) || a.value - b.value);
    const cards = list
      .map((x) => {
        const shown = deal.presented[x.id];
        const r = shown !== undefined ? S.reaction(shown) : null;
        return `<div class="car card ${deal.carId === x.id ? 'sel' : ''}">
          ${x.isNew ? '<span class="ribbon">NEW</span>' : ''}
          ${C.svg(x)}
          <b class="car-name">${x.year} ${x.make} ${x.model}</b>
          <small class="muted">${clsLabel(x.cls)} · ${carMeta(x)}</small>
          <div class="car-price"><b>${money(C.listPrice(x, markup))}</b><small>cost ${money(x.cost)}</small></div>
          ${r ? btn(`${r.face} ${r.label}`, 'present', { id: x.id }, 'small ghost') : btn('Present (10m)', 'present', { id: x.id }, 'small')}
        </div>`;
      })
      .join('');
    return `${selected}
      <div class="card stage">
        <div class="stage-title"><h3>The lot</h3>${btn('Let them go', 'abandon', null, 'ghost danger small')}</div>
        <div class="fchips">${fchips}</div>
        <div class="car-grid">${cards || '<p class="muted">No cars in this category.</p>'}</div>
      </div>`;
  }

  function stageNegotiate(c) {
    const deal = state.deal;
    const car = S.dealCar(state);
    const def = deal.lastOffer ? U.roundTo((deal.lastOffer + deal.counter) / 2, 100) : deal.listPrice;
    const floor = S.floorPrice(state, car);
    return `<div class="card stage negotiate">
      <div class="neg-car">${C.svg(car)}<div><b>${C.name(car)}</b><small class="muted">${clsLabel(car.cls)} · ${carMeta(car)}</small></div></div>
      <div class="price-board">
        <div><label>Sticker</label><b>${money(deal.listPrice)}</b></div>
        <div><label>Dealer cost</label><b>${money(car.cost)}</b></div>
        <div class="them"><label>Their offer</label><b>${money(deal.counter)}</b></div>
        <div><label>Your last</label><b>${deal.lastOffer ? money(deal.lastOffer) : '—'}</b></div>
      </div>
      <div class="offer-form">
        <label for="offer-input">Your price</label>
        <div class="offer-row">
          <span class="dollar">$</span><input id="offer-input" type="number" inputmode="numeric" step="100" min="0" value="${def}" />
          ${btn('Make offer', 'offer', null, 'primary')}
        </div>
        <div class="quick">
          ${btn('Sticker', 'quick', { v: deal.listPrice }, 'small ghost')}
          ${btn('−$500', 'quickDelta', { v: -500 }, 'small ghost')}
          ${btn('−$1,000', 'quickDelta', { v: -1000 }, 'small ghost')}
          ${btn('Split the difference', 'quick', { v: U.roundTo(((deal.lastOffer || deal.listPrice) + deal.counter) / 2, 50) }, 'small ghost')}
        </div>
        <div id="offer-preview" class="preview"></div>
        ${floor ? `<small class="muted">Your manager won't approve deals under ${money(floor)}.</small>` : ''}
      </div>
      <div class="neg-actions">
        ${btn(`🤝 Accept ${money(deal.counter)}`, 'acceptCounter', null, 'good')}
        ${btn(S.assistLabel(state), 'assist', null, '', deal.assistUsed)}
        ${btn('↩ Show another car', 'backToLot', null, 'ghost')}
        ${btn('Let them go', 'abandon', null, 'ghost danger')}
      </div>
    </div>`;
  }

  function updateOfferPreview() {
    const inp = $('#offer-input');
    const out = $('#offer-preview');
    if (!inp || !out || !state || !state.deal) return;
    const car = S.dealCar(state);
    if (!car) return;
    const price = Number(inp.value) || 0;
    const front = price - car.cost - state.deal.freebieCost;
    const off = state.deal.listPrice ? 1 - price / state.deal.listPrice : 0;
    let text;
    if (state.player.employed) {
      const r = G.rank(state);
      text = `Front gross ${money(front)} → your commission ≈ <b>${money(Math.max(150, front * r.front))}</b>`;
    } else {
      text = `Store profit on the car ≈ <b class="${front < 0 ? 'neg' : 'pos'}">${money(front)}</b>`;
    }
    const floor = S.floorPrice(state, car);
    if (floor && price < floor) text += ' · <span class="neg">below manager floor</span>';
    out.innerHTML = `${text} · ${off > 0 ? U.pct(off, 1) + ' off sticker' : 'at/above sticker'}`;
  }

  function stageFI(c) {
    const deal = state.deal;
    const employed = state.player.employed;
    const r = G.rank(state);
    const rows = Object.entries(D.PRODUCTS)
      .map(([pid, p]) => {
        const status = deal.products[pid];
        const profit = S.productProfit(state, pid);
        const locked = p.needsFinancing && deal.products.financing !== 'accepted';
        const chance = S.productChance(state, pid);
        const odds = locked ? 'Needs financing' : chance >= 0.6 ? 'Likely' : chance >= 0.3 ? 'Maybe' : 'Unlikely';
        let action;
        if (status === 'accepted') action = chip('Accepted ✓', 'good');
        else if (status === 'declined') action = chip('Declined', 'bad');
        else action = btn('Pitch (5m)', 'pitch', { id: pid }, 'small', locked);
        return `<div class="product ${status || ''}">
          <div><b>${p.label}</b><small class="muted">${p.desc}</small></div>
          <div class="prod-num"><b>${pid === 'financing' ? money(profit) : money(p.price)}</b><small>${employed ? `you earn ${money(profit * r.back)}` : `profit ${money(profit)}`}</small></div>
          <div class="prod-odds">${chip(odds, locked ? 'muted' : chance >= 0.6 ? 'good' : chance >= 0.3 ? 'warn' : 'bad')}</div>
          <div class="prod-act">${action}</div>
        </div>`;
      })
      .join('');
    return `<div class="card stage">
      <h3>🤝 Price agreed: ${money(deal.agreedPrice)}</h3>
      <p class="muted">Welcome to the F&amp;I office. Add-ons are pure profit, but every "no" chips away at ${esc(c.name.split(' ')[0])}'s mood — and satisfaction drives your reputation.</p>
      <div class="products">${rows}</div>
      <div class="stage-foot">${btn('✍️ Sign the paperwork', 'finalize', null, 'primary big')}</div>
    </div>`;
  }

  function stageSummary() {
    const s = state.deal.summary;
    const stars = Math.max(1, Math.round(s.satisfaction / 20));
    const row = (k, v) => `<div class="sum-row"><span>${k}</span><b>${v}</b></div>`;
    return `<div class="card stage summary">
      <div class="sold-banner">SOLD!</div>
      ${C.svg(s.car, 'big')}
      <h3>${C.name(s.car)} → ${esc(s.customerName)}</h3>
      <div class="sum">
        ${row('Sale price', `${money(s.price)} <small class="muted">(sticker ${money(s.listPrice)})</small>`)}
        ${row('Front gross', signed(s.front))}
        ${row(`Back gross (${s.products.length} add-on${s.products.length === 1 ? '' : 's'})`, signed(s.back))}
        ${row(s.commission !== null ? 'Your commission' : 'Your profit', `<span class="pos big-num">${money(s.earned)}</span>`)}
        ${row('Customer satisfaction', `<span class="stars">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span> ${s.satisfaction}`)}
        ${row('Experience', `+${s.xp} XP${s.levels ? ` · <b class="pos">Level up!</b>` : ''}`)}
      </div>
      <div class="stage-foot">${btn('Back to the showroom', 'closeDeal', null, 'primary big')}</div>
    </div>`;
  }

  function stageWalked(c) {
    return `<div class="card stage walked">
      <div class="walk-icon">🚶💨</div>
      <h3>${esc(c.name)} walked out</h3>
      <p class="muted">They ${esc(state.deal.walkReason || 'left')}. Watch their mood and patience — a smaller margin beats no sale at all.</p>
      <div class="stage-foot">${btn('Back to the showroom', 'closeDeal', null, 'primary')}</div>
    </div>`;
  }

  // ---------- Career ----------
  function viewCareer() {
    const p = state.player;
    const r = G.rank(state);
    const prog = G.promotionProgress(state);
    const ladder = D.RANKS.slice(0, 5)
      .map((rk) => `<li class="${rk.id < p.rank ? 'done' : rk.id === p.rank ? 'now' : ''}"><b>${rk.title}</b>${rk.owner ? '<small>Buy your own store</small>' : `<small>${money(rk.weekly)}/wk · ${U.pct(rk.front)} front · ${U.pct(rk.back)} back</small>`}</li>`)
      .join('');
    const progHtml = prog
      ? `<h3>Next promotion: ${prog.title}</h3>${prog.items
          .map((i) => `<div class="req"><div class="req-top"><span>${i.label}</span><b>${i.fmt(i.cur)} / ${i.fmt(i.req)}</b></div>${bar((i.cur / i.req) * 100, i.cur >= i.req ? 'good' : '')}</div>`)
          .join('')}<p class="muted">Promotions are reviewed at the end of each day.</p>`
      : `<h3>Top of the ladder</h3><p class="muted">You're the General Manager. The only way up is to buy your own dealership.</p>`;
    const lot = state.listings.filter((l) => l.tier === 'usedLot').sort((a, b) => a.price - b.price)[0];
    const st = p.stats;
    const stat = (k, v) => `<div class="kpi"><label>${k}</label><b>${v}</b></div>`;
    return `<div class="section-head"><div><h2>Your career</h2><p>${D.EMPLOYER.name} · ${D.CITIES[D.EMPLOYER.city].name}</p></div></div>
      <div class="grid-2">
        <div class="card">
          <h3>🎖️ ${r.title}</h3>
          <p>Base pay <b>${money(r.weekly)}</b>/week (paid Sundays). Commission <b>${U.pct(r.front)}</b> of front gross (min $150) and <b>${U.pct(r.back)}</b> of F&amp;I profit.</p>
          ${r.override[1] ? `<p>Management override: <b>${money(r.override[0])}–${money(r.override[1])}</b> per day on team sales.</p>` : ''}
          ${p.rank < 2 ? `<p class="muted">From Sales Manager up, your manager stops policing your minimum price.</p>` : ''}
          <ol class="ladder">${ladder}</ol>
        </div>
        <div class="card">${progHtml}</div>
      </div>
      <div class="kpis">
        ${stat('Cars sold', U.num(st.sales))}
        ${stat('Front gross', money(st.grossFront, true))}
        ${stat('Back gross', money(st.grossBack, true))}
        ${stat('Total earned', money(st.earned, true))}
        ${stat('Walkouts', U.num(st.walkouts))}
        ${stat('Best deal', money(st.bestFront))}
      </div>
      <div class="card goal">
        <h3>🪧 The road to ownership</h3>
        <p>Once you're a <b>Sales Manager</b>, banks will finance up to ${U.pct(D.MAX_LOAN_PCT)} of a used car lot. ${lot ? `The cheapest lot on the market right now is <b>${esc(lot.name)}</b> for ${money(lot.price)} — you'd need about <b>${money(lot.price * (1 - D.MAX_LOAN_PCT))}</b> down.` : ''}</p>
        ${bar(lot ? (p.cash / (lot.price * (1 - D.MAX_LOAN_PCT))) * 100 : 0, 'cash')}
        <div class="row">${btn('Browse dealerships', 'tab', { id: 'market' }, 'primary')}</div>
      </div>`;
  }

  // ---------- Owner: Empire ----------
  function weekNet(d) {
    return U.sum(d.history.slice(-7), (h) => h.net);
  }

  function viewEmpire() {
    const p = state.player;
    const stores = state.dealerships;
    const kpi = (k, v, cls) => `<div class="kpi ${cls || ''}"><label>${k}</label><b>${v}</b></div>`;
    const totalWeek = U.sum(stores, weekNet);
    const rows = stores
      .map((d) => {
        const T = D.TIERS[d.tier];
        const last = d.history[d.history.length - 1];
        return `<tr>
          <td><b>${T.icon} ${esc(d.name)}</b>${d.id === state.activeStoreId ? ' ' + chip('You work here', 'good') : ''}<small class="muted">${T.label} · ${D.CITIES[d.city].name}</small></td>
          <td>${Math.round(d.rep)}${bar(d.rep, 'thin')}</td>
          <td>${d.inventory.length}/${B.capacity(d)}</td>
          <td>${d.staff.length}/${B.staffSlots(d)}</td>
          <td>${last ? last.sold : '—'}</td>
          <td>${last ? signed(last.net) : '—'}</td>
          <td>${signed(weekNet(d))}</td>
          <td class="actions-cell">${btn('Manage', 'manageStore', { id: d.id }, 'small')}</td>
        </tr>`;
      })
      .join('');
    return `<div class="section-head"><div><h2>${esc(p.name)}'s Auto Group</h2><p>${G.rank(state).title}</p></div></div>
      <div class="kpis">
        ${kpi('Net worth', money(G.netWorth(state), true), 'big')}
        ${kpi('Cash', money(p.cash, true), p.cash < 0 ? 'bad' : '')}
        ${kpi('Debt', money(G.loanBalance(state), true))}
        ${kpi('Stores', `${stores.length}<small>/${D.WIN_STORES} goal</small>`)}
        ${kpi('7-day profit', money(totalWeek, true), totalWeek < 0 ? 'bad' : 'good')}
        ${kpi('Cars sold (group)', U.num(state.groupSold))}
      </div>
      <div class="card"><h3>Net worth</h3>${netWorthChart()}
        <div class="goal-line"><span>Mogul goal: ${D.WIN_STORES} stores &amp; ${money(D.WIN_NET_WORTH, true)} net worth</span>${bar((G.netWorth(state) / D.WIN_NET_WORTH) * 100, 'cash')}</div>
      </div>
      <div class="card">
        <h3>Your dealerships</h3>
        ${stores.length
          ? `<div class="table-wrap"><table class="table"><thead><tr><th>Store</th><th>Rep</th><th>Cars</th><th>Staff</th><th>Sold (yday)</th><th>Net (yday)</th><th>Net (7d)</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
          : empty('🏚️', 'No stores', 'Buy a dealership to start your group.', btn('Browse dealerships', 'tab', { id: 'market' }, 'primary'))}
      </div>`;
  }

  function netWorthChart() {
    const pts = state.history.slice(-120);
    if (pts.length < 2) return '<p class="muted">Play a few days to see your progress.</p>';
    const W = 640;
    const H = 150;
    const vals = pts.map((p) => p.netWorth);
    const min = Math.min(0, ...vals);
    const max = Math.max(...vals, 1);
    const x = (i) => (i / (pts.length - 1)) * W;
    const y = (v) => H - 8 - ((v - min) / (max - min || 1)) * (H - 20);
    const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.netWorth).toFixed(1)}`).join(' ');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Net worth over time">
      <defs><linearGradient id="nwg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      <polygon points="0,${H} ${line} ${W},${H}" fill="url(#nwg)"/>
      <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
    </svg><div class="chart-axis"><span>Day ${pts[0].day}</span><span>Peak ${money(max, true)}</span><span>Day ${pts[pts.length - 1].day}</span></div>`;
  }

  // ---------- Owner: Stores ----------
  function currentStore() {
    return G.store(state, ui.storeId) || G.activeStore(state) || state.dealerships[0] || null;
  }

  function storePicker(selectedId, act) {
    return `<div class="store-picker">${state.dealerships
      .map((d) => `<button class="fchip ${d.id === selectedId ? 'on' : ''}" data-act="${act}" data-id="${d.id}">${D.TIERS[d.tier].icon} ${esc(d.name)}</button>`)
      .join('')}</div>`;
  }

  function viewStores() {
    const d = currentStore();
    if (!d) return empty('🏚️', 'No stores', 'Buy a dealership first.', btn('Browse dealerships', 'tab', { id: 'market' }, 'primary'));
    ui.storeId = d.id;
    const sub = [
      ['overview', 'Overview'],
      ['inventory', `Inventory (${d.inventory.length})`],
      ['staff', `Staff (${d.staff.length})`],
      ['upgrades', 'Upgrades'],
    ];
    let body;
    if (ui.storeTab === 'inventory') body = storeInventory(d);
    else if (ui.storeTab === 'staff') body = storeStaff(d);
    else if (ui.storeTab === 'upgrades') body = storeUpgrades(d);
    else body = storeOverview(d);
    return `${storePicker(d.id, 'pickStore')}
      <div class="section-head">
        <div><h2>${D.TIERS[d.tier].icon} ${esc(d.name)}</h2><p>${D.TIERS[d.tier].label}${d.brand ? ` · ${d.brand} franchise` : ''} · ${D.CITIES[d.city].name} (${D.CITIES[d.city].desc})</p></div>
        <div class="row">${d.id === state.activeStoreId ? chip('📍 You work here', 'good') : btn('Work this floor', 'workHere', { id: d.id }, '', false, 'Sell personally at this store starting tomorrow')}</div>
      </div>
      <div class="subtabs">${sub.map(([id, label]) => `<button class="subtab ${ui.storeTab === id ? 'on' : ''}" data-act="storeTab" data-id="${id}">${label}</button>`).join('')}</div>
      ${body}`;
  }

  function storeOverview(d) {
    const strat = Object.entries(D.STRATEGIES)
      .map(([id, s]) => `<button class="seg ${d.strategy === id ? 'on' : ''}" data-act="strategy" data-id="${id}"><b>${s.label}</b><small>${s.desc}</small></button>`)
      .join('');
    const mkt = D.MARKETING.map((m, i) => `<option value="${i}" ${d.marketing === i ? 'selected' : ''}>${m.label} — ${money(B.marketingCost(d, i))}/day (+${Math.round((m.traffic - 1) * 100)}% traffic)</option>`).join('');
    const targets = [0.5, 0.7, 0.85, 1].map((t) => `<option value="${t}" ${Math.abs(d.restockTarget - t) < 0.01 ? 'selected' : ''}>${U.pct(t)} full</option>`).join('');
    const hist = d.history.slice(-7).reverse();
    const rows = hist
      .map((h) => `<tr><td>Day ${h.day}</td><td>${h.visitors}</td><td>${h.sold}${h.personalSold ? ` <small class="muted">(${h.personalSold} you)</small>` : ''}</td><td>${money(h.front)}</td><td>${money(h.back + h.service)}</td><td>${money(h.expenses + h.commissions)}</td><td>${signed(h.net)}</td></tr>`)
      .join('');
    const last = d.history[d.history.length - 1];
    const notes = last && last.notes.length ? `<ul class="notes">${last.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
    const value = B.value(state, d);
    const loan = state.loans.find((l) => l.storeId === d.id);
    const daily = D.TIERS[d.tier].overhead * Math.sqrt(D.CITIES[d.city].price) + U.sum(d.staff, (s) => s.salary) + B.marketingCost(d, d.marketing);
    return `<div class="kpis">
        <div class="kpi"><label>Reputation</label><b>${Math.round(d.rep)}<small>/100</small></b>${bar(d.rep, d.rep >= 60 ? 'good' : d.rep >= 35 ? 'warn' : 'bad')}</div>
        <div class="kpi"><label>Store value</label><b>${money(value, true)}</b></div>
        <div class="kpi"><label>Fixed costs</label><b>${money(daily, true)}<small>/day</small></b></div>
        <div class="kpi"><label>Lifetime sales</label><b>${U.num(d.totals.sold)}</b></div>
        <div class="kpi"><label>Lifetime profit</label><b>${money(d.totals.net, true)}</b></div>
      </div>
      <div class="grid-2">
        <div class="card">
          <h3>Pricing strategy</h3>
          <div class="segs">${strat}</div>
          <h3>Marketing</h3>
          <select class="select" data-change="marketing">${mkt}</select>
          <h3>Inventory</h3>
          <label class="toggle"><input type="checkbox" data-change="autoRestock" ${d.autoRestock ? 'checked' : ''}/> Auto-restock from wholesalers each night</label>
          <div class="row"><select class="select" data-change="restockTarget" ${d.autoRestock ? '' : 'disabled'}>${targets}</select>
          ${btn('Fill the lot now', 'restockNow', null, '', d.inventory.length >= B.capacity(d))}</div>
          <p class="muted">Wholesalers cost more than the auction, but they never sleep.</p>
        </div>
        <div class="card">
          <h3>Last 7 days</h3>
          ${rows ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Day</th><th>Shoppers</th><th>Sold</th><th>Front</th><th>Back+Svc</th><th>Costs</th><th>Net</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No history yet — end a day to see results.</p>'}
          ${notes}
        </div>
      </div>
      <div class="card danger-zone">
        <div><h3>Sell this dealership</h3><p class="muted">A buyer will pay about ${money(value * 0.92)}${loan ? `, and ${money(loan.balance)} goes to repay its loan` : ''}.</p></div>
        ${btn('Sell store', 'sellStore', { id: d.id }, 'danger')}
      </div>`;
  }

  function storeInventory(d) {
    const cap = B.capacity(d);
    const markup = D.STRATEGIES[d.strategy].sticker;
    const rows = d.inventory
      .slice()
      .sort((a, b) => b.daysOnLot - a.daysOnLot)
      .map((c) => `<tr>
        <td class="car-cell">${C.svg(c, 'tiny')}<div><b>${C.name(c)}</b><small class="muted">${clsLabel(c.cls)} · ${carMeta(c)}</small></div></td>
        <td class="${c.daysOnLot > 45 ? 'neg' : ''}">${c.daysOnLot}d</td>
        <td>${money(c.cost)}</td>
        <td>${money(c.value)}</td>
        <td>${money(C.listPrice(c, markup))}</td>
        <td class="actions-cell">${btn(`Wholesale ${money(B.wholesaleValue(state, c), true)}`, 'wholesale', { id: c.id }, 'small ghost')}</td>
      </tr>`)
      .join('');
    const models = B.factoryModels(d);
    const factory = models.length
      ? `<div class="card"><h3>🏭 ${d.brand} factory order</h3><p class="muted">Order brand-new ${d.brand} vehicles at invoice. New cars also earn a manufacturer holdback when sold.</p>
        <div class="factory">${models
          .map((m) => {
            const demo = { cls: m.cls, color: D.COLORS[2] };
            return `<div class="card car">${C.svg(demo)}<b>${m.make} ${m.model}</b><small class="muted">${clsLabel(m.cls)} · MSRP ${money(m.msrp)}</small><div class="car-price"><b>${money(B.invoice(m))}</b><small>invoice</small></div>${btn('Order', 'factory', { id: m.model }, 'small', d.inventory.length >= cap)}</div>`;
          })
          .join('')}</div></div>`
      : '';
    return `<div class="card">
        <div class="stage-title"><h3>On the lot: ${d.inventory.length}/${cap}</h3>${btn('🔨 Go to auction', 'gotoAuction', { id: d.id }, 'small')}</div>
        ${bar((d.inventory.length / cap) * 100, '')}
        <p class="muted">Cars older than 45 days lose value faster and cost floor-plan interest every day.</p>
        ${rows ? `<div class="table-wrap"><table class="table"><thead><tr><th>Vehicle</th><th>Age</th><th>Cost</th><th>Value</th><th>Sticker</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('🅿️', 'Empty lot', 'Buy cars at auction or turn on auto-restock.')}
      </div>${factory}`;
  }

  function storeStaff(d) {
    const slots = B.staffSlots(d);
    const cards = d.staff
      .map((s) => {
        const R = D.STAFF_ROLES[s.role];
        return `<div class="card staff">
          <div class="staff-top"><span class="avatar">${R.icon}</span><div><b>${esc(s.name)}</b><small class="muted">${R.label}</small></div></div>
          <div class="meter"><span>Skill ${s.skill}</span>${pips(s.skill, 10)}</div>
          <div class="facts"><div class="fact"><span>Salary</span><b>${money(s.salary)}/day</b></div><div class="fact"><span>${s.role === 'sales' ? 'Cars sold' : 'Deals handled'}</span><b>${U.num(s.sold)}</b></div></div>
          ${btn(`Fire (${money(B.severance(s))} severance)`, 'fire', { id: s.id }, 'small ghost danger')}
        </div>`;
      })
      .join('');
    const sellers = d.staff.filter((s) => s.role === 'sales');
    const cap = U.sum(sellers, (s) => 2 + Math.ceil(s.skill / 3));
    return `<div class="card">
        <div class="stage-title"><h3>Team: ${d.staff.length}/${slots} positions</h3>${btn('🧑‍💼 Hire staff', 'gotoHiring', { id: d.id }, 'small', d.staff.length >= slots)}</div>
        <p class="muted">Your salespeople can help about <b>${cap}</b> shoppers a day. ${d.staff.some((s) => s.role === 'finance') ? 'Your F&amp;I manager boosts back-end profit.' : 'Hire an F&amp;I manager to earn far more per sale.'} ${d.staff.some((s) => s.role === 'manager') ? '' : 'A sales manager makes every salesperson better.'}</p>
      </div>
      <div class="staff-grid">${cards || empty('🪑', 'No staff', 'Nobody works here yet. Hire salespeople to sell cars while you are away.')}</div>`;
  }

  function storeUpgrades(d) {
    return `<div class="upgrades">${Object.entries(D.UPGRADES)
      .map(([id, u]) => {
        const lvl = d.upgrades[id];
        const cost = B.upgradeCost(d, id);
        return `<div class="card upgrade">
          <div class="up-icon">${u.icon}</div>
          <b>${u.label}</b>
          ${pips(lvl, u.max)}
          <p class="muted">${u.desc}</p>
          ${cost === null ? chip('Maxed', 'good') : btn(`Upgrade · ${money(cost, true)}`, 'upgrade', { id }, 'small', state.player.cash < cost)}
        </div>`;
      })
      .join('')}</div>`;
  }

  // ---------- Owner: Auction & Hiring ----------
  function destStore() {
    let d = G.store(state, ui.dest);
    if (!d) d = currentStore();
    if (d) ui.dest = d.id;
    return d;
  }
  function destPicker(d, label) {
    return `<div class="card dest"><span>${label}</span>${storePicker(d.id, 'pickDest')}</div>`;
  }

  function viewAuction() {
    const d = destStore();
    if (!d) return empty('🔨', 'No stores', 'You need a dealership to buy inventory.');
    const cap = B.capacity(d);
    const full = d.inventory.length >= cap;
    const cards = state.auction
      .map((c) => {
        const margin = c.value - c.cost;
        const demand = D.CITIES[d.city].demand[c.cls];
        return `<div class="card car">
          ${c.isNew ? '<span class="ribbon">NEW</span>' : ''}
          ${C.svg(c)}
          <b class="car-name">${C.name(c)}</b>
          <small class="muted">${clsLabel(c.cls)} · ${carMeta(c)}</small>
          <div class="car-price"><b>${money(c.cost)}</b><small>retail ~${money(c.value)} · <span class="pos">+${money(margin, true)}</span></small></div>
          <small class="${demand >= 1.3 ? 'pos' : demand < 0.7 ? 'neg' : 'muted'}">Demand in ${D.CITIES[d.city].name}: ${demand >= 1.3 ? 'High' : demand < 0.7 ? 'Low' : 'Normal'}</small>
          ${btn('Buy', 'buyAuction', { id: c.id }, 'small primary', full || state.player.cash < c.cost)}
        </div>`;
      })
      .join('');
    return `<div class="section-head"><div><h2>🔨 Dealer auction</h2><p>A fresh lineup every morning. Prices here beat the wholesalers.</p></div></div>
      ${destPicker(d, `Deliver to (${d.inventory.length}/${cap} spaces used):`)}
      ${full ? '<div class="card tip bad">This lot is full. Sell or wholesale some cars, or expand the lot.</div>' : ''}
      <div class="car-grid">${cards || '<p class="muted">Sold out for today.</p>'}</div>`;
  }

  function viewHiring() {
    const d = destStore();
    if (!d) return empty('🧑‍💼', 'No stores', 'You need a dealership to hire staff.');
    const full = d.staff.length >= B.staffSlots(d);
    const cards = state.candidates
      .map((c) => {
        const R = D.STAFF_ROLES[c.role];
        const dup = c.role !== 'sales' && d.staff.some((s) => s.role === c.role);
        return `<div class="card staff">
          <div class="staff-top"><span class="avatar">${R.icon}</span><div><b>${esc(c.name)}</b><small class="muted">${R.label}</small></div></div>
          <div class="meter"><span>Skill ${c.skill}</span>${pips(c.skill, 10)}</div>
          <p class="muted">${R.desc}</p>
          <div class="facts"><div class="fact"><span>Salary</span><b>${money(c.salary)}/day</b></div><div class="fact"><span>Recruiting fee</span><b>${money(B.hireFee(c))}</b></div></div>
          ${btn(dup ? 'Position filled' : 'Hire', 'hire', { id: c.id }, 'small primary', full || dup)}
        </div>`;
      })
      .join('');
    return `<div class="section-head"><div><h2>🧑‍💼 Hiring</h2><p>New candidates every Monday.</p></div></div>
      ${destPicker(d, `Hire for (${d.staff.length}/${B.staffSlots(d)} positions filled):`)}
      <div class="staff-grid">${cards || '<p class="muted">No candidates left this week.</p>'}</div>`;
  }

  // ---------- Market ----------
  function viewMarket() {
    const p = state.player;
    const cards = state.listings
      .map((l) => {
        const T = D.TIERS[l.tier];
        const city = D.CITIES[l.city];
        const can = G.canBuyTier(state, l.tier);
        const pct = ui.down[l.id] || 1 - D.MAX_LOAN_PCT;
        const down = Math.round(l.price * pct);
        const loan = l.price - down;
        const opts = [0.3, 0.5, 0.75, 1].map((v) => `<option value="${v}" ${Math.abs(v - pct) < 0.01 ? 'selected' : ''}>${U.pct(v)} down</option>`).join('');
        const fact = (k, v) => `<div class="fact"><span>${k}</span><b>${v}</b></div>`;
        return `<div class="card listing ${l.tier}">
          <div class="listing-top"><span class="tier-icon">${T.icon}</span><div><h3>${esc(l.name)}</h3><small class="muted">${T.label} · ${city.name} — ${city.desc}</small></div></div>
          <p class="muted">${T.blurb}</p>
          <div class="facts">
            ${fact('Asking price', `<span class="cash">${money(l.price)}</span>`)}
            ${fact('Included', `${l.cars.length} cars · ${l.staff.length} staff`)}
            ${fact('Lot capacity', `${T.capacity} cars`)}
            ${fact('Reputation', `${l.rep}/100`)}
            ${fact('Overhead', `${money(T.overhead * Math.sqrt(city.price))}/day`)}
          </div>
          ${can.ok
            ? `<div class="buy-row"><select class="select" data-change="downPct" data-id="${l.id}">${opts}</select>
                <div class="buy-math"><span>Down: <b class="${p.cash < down ? 'neg' : ''}">${money(down)}</b></span>${loan ? `<span>Loan: ${money(loan)} @ ${U.pct(D.LOAN_RATE, 1)}</span>` : '<span>No loan</span>'}</div>
                ${btn('Buy', 'buyStore', { id: l.id }, 'primary', p.cash < down)}</div>`
            : `<div class="locked">🔒 ${can.reasons.join(' · ')}</div>`}
        </div>`;
      })
      .join('');
    return `<div class="section-head"><div><h2>🪧 Dealerships for sale</h2><p>New listings appear every Monday. Prices include the cars and staff on site.</p></div></div>
      ${p.employed ? `<div class="card tip">Buying a dealership means resigning from ${D.EMPLOYER.name}. Make sure you have cash left over for payroll and inventory.</div>` : ''}
      <div class="listings">${cards}</div>`;
  }

  // ---------- Bank ----------
  function viewBank() {
    const p = state.player;
    const rows = state.loans
      .map((l) => `<tr>
        <td><b>${esc(l.label)}</b></td>
        <td>${money(l.original)}</td>
        <td><b>${money(l.balance)}</b>${bar((1 - l.balance / l.original) * 100, 'good thin')}</td>
        <td>${U.pct(l.rate, 1)}</td>
        <td>${money(B.weeklyPrincipal(l))}/wk + interest</td>
        <td class="actions-cell">
          ${btn('Pay $10k', 'payLoan', { id: l.id, v: 10000 }, 'small ghost', p.cash < Math.min(10000, l.balance))}
          ${btn('Pay $100k', 'payLoan', { id: l.id, v: 100000 }, 'small ghost', p.cash < Math.min(100000, l.balance))}
          ${btn('Pay off', 'payLoan', { id: l.id, v: l.balance }, 'small', p.cash < l.balance)}
        </td>
      </tr>`)
      .join('');
    return `<div class="section-head"><div><h2>🏦 First Auto Bank</h2><p>Business loans are repaid at 1.5% of the original principal every Sunday, plus daily interest.</p></div></div>
      ${p.cash < 0 ? `<div class="card tip bad">You're overdrawn by ${money(-p.cash)} and paying daily overdraft interest. ${state.insolventDays ? `<b>${7 - state.insolventDays} days</b> until the bank calls in your debts!` : ''}</div>` : ''}
      <div class="card">${rows ? `<div class="table-wrap"><table class="table"><thead><tr><th>Loan</th><th>Original</th><th>Balance</th><th>Rate</th><th>Payment</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('🕊️', 'Debt free', 'You have no outstanding business loans.')}</div>`;
  }

  // ---------- Skills ----------
  function viewSkills() {
    const p = state.player;
    const need = G.xpForLevel(p.level);
    const cards = Object.entries(G.SKILLS)
      .map(([id, s]) => `<div class="card skill">
        <div class="skill-top"><span class="up-icon">${s.icon}</span><div><b>${s.label}</b><small class="muted">${s.desc}</small></div></div>
        <div class="meter"><span>Level ${p.skills[id]}</span>${pips(p.skills[id], G.MAX_SKILL)}</div>
        ${btn('+1', 'skill', { id }, 'small primary', p.skillPoints <= 0 || p.skills[id] >= G.MAX_SKILL)}
      </div>`)
      .join('');
    const cost = G.trainingCost(state);
    return `<div class="section-head"><div><h2>⭐ Skills</h2><p>Earn XP on every sale. Each level grants a skill point.</p></div></div>
      <div class="card level">
        <div class="level-top"><b>Level ${p.level}</b><span>${U.num(p.xp)} / ${U.num(need)} XP</span><span class="sp">${p.skillPoints} skill point${p.skillPoints === 1 ? '' : 's'} available</span></div>
        ${bar((p.xp / need) * 100, 'xp')}
      </div>
      <div class="skills">${cards}</div>
      <div class="card goal"><div><h3>📖 Sales seminar</h3><p class="muted">Spend a weekend with a famous sales guru for an extra skill point. Gets pricier each time.</p></div>${btn(`Attend · ${money(cost)}`, 'training', null, '', p.cash < cost)}</div>`;
  }

  // ---------- Awards & Log ----------
  function viewAwards() {
    const got = Object.keys(state.achievements).length;
    return `<div class="section-head"><div><h2>🏆 Achievements</h2><p>${got} of ${G.ACHIEVEMENTS.length} unlocked</p></div></div>
      <div class="awards">${G.ACHIEVEMENTS.map((a) => {
        const day = state.achievements[a.id];
        return `<div class="card award ${day ? 'got' : ''}"><span class="award-icon">${day ? a.icon : '🔒'}</span><div><b>${a.title}</b><small class="muted">${a.desc}</small>${day ? `<small class="pos">Day ${day}</small>` : ''}</div></div>`;
      }).join('')}</div>`;
  }

  function viewLog() {
    return `<div class="section-head"><div><h2>📜 Activity log</h2></div></div>
      <div class="card"><ul class="log full">${state.log.map((l) => `<li class="${l.type}"><span>Day ${l.day}</span>${esc(l.text)}</li>`).join('')}</ul></div>`;
  }

  // ---------- Day reports ----------
  function reportModal(r) {
    const personal = r.personal;
    const lines = r.lines.map(([k, v]) => `<div class="sum-row"><span>${k}</span><b>${signed(v)}</b></div>`).join('');
    const stores = r.stores.length
      ? `<h3>Stores</h3><div class="table-wrap"><table class="table compact"><thead><tr><th>Store</th><th>Sold</th><th>Net</th></tr></thead><tbody>${r.stores
          .map((s) => `<tr><td>${esc(s.name)}${s.notes.length ? `<small class="muted">${esc(s.notes[0])}</small>` : ''}</td><td>${s.sold}</td><td>${signed(s.net)}</td></tr>`)
          .join('')}</tbody></table></div>`
      : '';
    const events = r.events.map((e) => `<div class="event"><b>${e.icon} ${e.title}</b><small>${e.text}</small></div>`).join('');
    const ach = r.achievements.map((a) => `<div class="ach-pop">${a.icon} <b>${a.title}</b> <small>${a.desc}</small></div>`).join('');
    return `<h2>Day ${r.day} wrap-up</h2>
      <div class="kpis small">
        <div class="kpi"><label>You sold</label><b>${personal.sales}</b></div>
        <div class="kpi"><label>${state.player.employed ? 'Commission' : 'Personal profit'}</label><b>${money(personal.earned)}</b></div>
        <div class="kpi"><label>Walkouts</label><b>${personal.walkouts}</b></div>
        <div class="kpi"><label>Net worth</label><b>${money(r.netWorth, true)}</b></div>
      </div>
      ${lines ? `<div class="sum">${lines}</div>` : ''}
      ${stores}
      ${events ? `<h3>Market news</h3>${events}` : ''}
      ${ach}
      <div class="modal-actions">${btn(`Start day ${r.day + 1} ▶`, 'closeModal', null, 'primary', false)}</div>`;
  }

  function weekModal(reports) {
    const byStore = {};
    let sold = 0;
    reports.forEach((r) =>
      r.stores.forEach((s) => {
        byStore[s.storeId] = byStore[s.storeId] || { name: s.name, sold: 0, net: 0 };
        byStore[s.storeId].sold += s.sold;
        byStore[s.storeId].net += s.net;
        sold += s.sold;
      })
    );
    const lines = {};
    reports.forEach((r) => r.lines.forEach(([k, v]) => (lines[k] = (lines[k] || 0) + v)));
    const total = U.sum(Object.values(byStore), (s) => s.net);
    const last = reports[reports.length - 1];
    const ach = [].concat(...reports.map((r) => r.achievements)).map((a) => `<div class="ach-pop">${a.icon} <b>${a.title}</b> <small>${a.desc}</small></div>`).join('');
    const events = [].concat(...reports.map((r) => r.events)).map((e) => `<div class="event"><b>${e.icon} ${e.title}</b><small>${e.text}</small></div>`).join('');
    return `<h2>Week in review · Days ${reports[0].day}–${last.day}</h2>
      <div class="kpis small">
        <div class="kpi"><label>Cars sold</label><b>${sold}</b></div>
        <div class="kpi"><label>Store profit</label><b>${signed(total)}</b></div>
        <div class="kpi"><label>Net worth</label><b>${money(last.netWorth, true)}</b></div>
      </div>
      <div class="table-wrap"><table class="table compact"><thead><tr><th>Store</th><th>Sold</th><th>Net</th></tr></thead><tbody>${Object.values(byStore)
        .map((s) => `<tr><td>${esc(s.name)}</td><td>${s.sold}</td><td>${signed(s.net)}</td></tr>`)
        .join('')}</tbody></table></div>
      <div class="sum">${Object.entries(lines).map(([k, v]) => `<div class="sum-row"><span>${k}</span><b>${signed(v)}</b></div>`).join('')}</div>
      ${events ? `<h3>Market news</h3>${events}` : ''}
      ${ach}
      <div class="modal-actions">${btn('Continue', 'closeModal', null, 'primary')}</div>`;
  }

  function afterReports(reports) {
    reports.forEach((r) => {
      if (r.promotion) {
        showModal(`<div class="celebrate">🎖️</div><h2>You've been promoted!</h2><p>Congratulations, <b>${r.promotion.title}</b>. Your base pay is now <b>${money(r.promotion.weekly)}</b>/week and your commission rises to <b>${U.pct(r.promotion.front)}</b> of front gross. You also earned a bonus skill point.</p>
          ${r.promotion.id === 2 ? '<p>Banks now take you seriously: you can finance a <b>used car lot</b> of your own. Check the <b>Buy a Dealership</b> tab.</p>' : ''}
          <div class="modal-actions">${btn('Back to work', 'closeModal', null, 'primary')}</div>`, { cls: 'celebration' });
      }
      if (r.won) {
        showModal(`<div class="celebrate">👑</div><h2>Automotive Mogul!</h2><p>From a nervous rookie on the ${D.EMPLOYER.name} floor to the owner of ${state.dealerships.length} dealerships worth ${money(G.netWorth(state), true)}. You won <b>The Dealership</b> in ${state.day} days.</p><p class="muted">Keep playing to grow even bigger.</p><div class="modal-actions">${btn('Keep building', 'closeModal', null, 'primary')}</div>`, { cls: 'celebration' });
      }
      if (r.gameOver) {
        showModal(`<div class="celebrate">💥</div><h2>Bankrupt</h2><p>The bank called in your debts after a week of deep overdraft. You lasted ${state.day} days and peaked at ${money(Math.max(...state.history.map((h) => h.netWorth)), true)} net worth.</p><div class="modal-actions">${btn('Start over', 'newGameConfirmed', null, 'primary')}</div>`, { locked: true });
      }
    });
  }

  // ---------- Actions ----------
  const ACT = {
    closeModal: () => closeModal(),
    tab: (d) => {
      ui.tab = d.id;
      closeModal();
      UI.render();
      window.scrollTo(0, 0);
    },
    newGame: () => {
      const name = ($('#player-name') || {}).value || '';
      if (G.hasSave()) {
        UI.pendingName = name;
        confirmModal('Start over?', 'Starting a new career will erase your saved game.', 'newGameConfirmed', null, 'Erase & start');
      } else ACT.newGameConfirmed();
    },
    newGameConfirmed: () => {
      const name = UI.pendingName !== undefined ? UI.pendingName : ($('#player-name') || {}).value || (state ? state.player.name : '');
      UI.pendingName = undefined;
      modalQueue.length = 0;
      drawModal();
      state = G.newGame(name);
      ui.tab = 'showroom';
      commit();
      showModal(`<div class="celebrate">🔑</div><h2>Welcome to ${D.EMPLOYER.name}, ${esc(state.player.name)}!</h2>
        <p>You're the newest <b>Sales Associate</b> on the floor in ${D.CITIES[D.EMPLOYER.city].name}. You earn a small base salary plus commission on every car you sell.</p>
        ${howToPlay()}
        <div class="modal-actions">${btn("Let's sell some cars", 'closeModal', null, 'primary')}</div>`, { cls: 'wide' });
    },
    continue: () => {
      state = G.load();
      if (!state) return UI.toast('Could not load your save.', 'bad');
      UI.render();
    },
    menu: () => {
      showModal(`<h2>Menu</h2>
        <div class="menu">
          ${btn('💾 Save game', 'saveGame')}
          ${btn('❓ How to play', 'howto')}
          ${btn('🏠 Title screen', 'toTitle')}
          ${btn('🗑️ New game', 'newGameAsk', null, 'danger')}
        </div>
        <p class="muted">Your game autosaves after every action in this browser.</p>
        <div class="modal-actions">${btn('Close', 'closeModal', null, 'primary')}</div>`);
    },
    saveGame: () => {
      closeModal();
      const saved = G.save(state);
      UI.toast(saved ? 'Game saved.' : 'Saving is not available in this browser.', saved ? 'good' : 'bad');
    },
    howto: () => {
      closeModal();
      showModal(`<h2>How to play</h2>${howToPlay()}<div class="modal-actions">${btn('Got it', 'closeModal', null, 'primary')}</div>`, { cls: 'wide' });
    },
    toTitle: () => {
      closeModal();
      G.save(state);
      state = null;
      UI.render();
    },
    newGameAsk: () => {
      closeModal();
      UI.pendingName = state.player.name;
      confirmModal('Start over?', 'This erases your current career for good.', 'newGameConfirmed', null, 'Erase & start');
    },
    endDay: () => {
      if (state.deal && !['summary', 'walked'].includes(state.deal.stage)) {
        const c = S.dealCustomer(state);
        return confirmModal('End the day?', `${esc(c.name)} will go home without buying.`, 'endDayConfirmed', null, 'End day');
      }
      ACT.endDayConfirmed();
    },
    endDayConfirmed: () => {
      closeModal();
      const r = G.endDay(state);
      commit();
      if (!r) return;
      showModal(reportModal(r));
      afterReports([r]);
    },
    skipWeek: () => {
      if (state.deal && !['summary', 'walked'].includes(state.deal.stage)) S.abandon(state, true);
      const reports = G.skipDays(state, 7);
      commit();
      if (!reports.length) return;
      showModal(weekModal(reports), { cls: 'wide' });
      afterReports(reports);
    },
    approach: (d) => {
      ui.invFilter = 'all';
      result(S.startDeal(state, d.id), true);
    },
    wait: () => result(S.waitForCustomer(state)),
    discover: (d) => result(S.discover(state, d.id), true),
    invFilter: (d) => {
      ui.invFilter = d.id;
      UI.render();
    },
    present: (d) => result(S.presentCar(state, d.id), true),
    testDrive: () => result(S.testDrive(state), true),
    negotiate: () => result(S.startNegotiation(state), true),
    offer: () => {
      const v = Number(($('#offer-input') || {}).value);
      const res = S.makeOffer(state, v);
      result(res, !res.walked);
    },
    quick: (d) => {
      const inp = $('#offer-input');
      if (inp) inp.value = d.v;
      updateOfferPreview();
    },
    quickDelta: (d) => {
      const inp = $('#offer-input');
      if (inp) inp.value = Math.max(0, (Number(inp.value) || 0) + Number(d.v));
      updateOfferPreview();
    },
    acceptCounter: () => result(S.acceptCounter(state), true),
    assist: () => result(S.assist(state), true),
    backToLot: () => result(S.backToLot(state), true),
    pitch: (d) => result(S.pitchProduct(state, d.id), true),
    finalize: () => result(S.finalize(state), true),
    abandon: () => result(S.abandon(state), true),
    closeDeal: () => result(S.closeDeal(state), true),

    manageStore: (d) => {
      ui.storeId = d.id;
      ui.tab = 'stores';
      ui.storeTab = 'overview';
      UI.render();
    },
    pickStore: (d) => {
      ui.storeId = d.id;
      UI.render();
    },
    storeTab: (d) => {
      ui.storeTab = d.id;
      UI.render();
    },
    workHere: (d) => {
      state.activeStoreId = d.id;
      UI.toast(`You'll work the floor at ${G.store(state, d.id).name} starting tomorrow.`, 'good');
      commit();
    },
    strategy: (d) => result(B.setStrategy(state, ui.storeId, d.id)),
    restockNow: () => result(B.restockNow(state, ui.storeId)),
    wholesale: (d) => result(B.wholesale(state, ui.storeId, d.id)),
    factory: (d) => result(B.factoryOrder(state, ui.storeId, d.id)),
    fire: (d) => {
      const s = currentStore().staff.find((x) => x.id === d.id);
      confirmModal(`Fire ${esc(s.name)}?`, `Severance costs ${money(B.severance(s))}.`, 'fireConfirmed', { id: d.id }, 'Fire');
    },
    fireConfirmed: (d) => {
      closeModal();
      result(B.fire(state, ui.storeId, d.id));
    },
    upgrade: (d) => result(B.buyUpgrade(state, ui.storeId, d.id)),
    sellStore: (d) => {
      const store = G.store(state, d.id);
      confirmModal(`Sell ${esc(store.name)}?`, `You'll receive about ${money(B.value(state, store) * 0.92)} before paying off any loan. This can't be undone.`, 'sellConfirmed', { id: d.id }, 'Sell');
    },
    sellConfirmed: (d) => {
      closeModal();
      ui.storeId = null;
      result(B.sellDealership(state, d.id));
    },
    gotoAuction: (d) => {
      ui.dest = d.id;
      ui.tab = 'auction';
      UI.render();
    },
    gotoHiring: (d) => {
      ui.dest = d.id;
      ui.tab = 'hiring';
      UI.render();
    },
    pickDest: (d) => {
      ui.dest = d.id;
      UI.render();
    },
    buyAuction: (d) => result(B.buyAuction(state, d.id, ui.dest)),
    hire: (d) => result(B.hire(state, ui.dest, d.id)),
    buyStore: (d) => {
      const l = state.listings.find((x) => x.id === d.id);
      const pct = ui.down[d.id] || 1 - D.MAX_LOAN_PCT;
      const down = Math.round(l.price * pct);
      const text = `Pay <b>${money(down)}</b> down${pct < 1 ? ` and finance <b>${money(l.price - down)}</b> at ${U.pct(D.LOAN_RATE, 1)}` : ''}.${state.player.employed ? ` You'll resign from ${D.EMPLOYER.name}.` : ''}`;
      confirmModal(`Buy ${esc(l.name)}?`, text, 'buyConfirmed', { id: d.id }, 'Sign the deal');
    },
    buyConfirmed: (d) => {
      closeModal();
      const wasEmployed = state.player.employed;
      const pct = ui.down[d.id] || 1 - D.MAX_LOAN_PCT;
      const res = B.buyDealership(state, d.id, pct);
      if (res.ok) {
        ui.storeId = res.storeId;
        ui.tab = wasEmployed ? 'showroom' : 'stores';
        ui.storeTab = 'overview';
      }
      result(res);
      if (res.ok && wasEmployed) {
        showModal(`<div class="celebrate">🪧</div><h2>Your name is on the sign!</h2>
          <p>You now own <b>${esc(G.store(state, res.storeId).name)}</b>. Every sale is your profit now — but so is every bill.</p>
          <ul class="howto-list"><li><b>Showroom:</b> keep selling personally at the store you work at.</li><li><b>Stores:</b> set pricing, marketing and auto-restock, buy upgrades.</li><li><b>Hiring:</b> salespeople sell while you're busy. An F&amp;I manager boosts profit on every deal.</li><li><b>Auction:</b> buy cheap inventory every morning.</li><li><b>Skip week:</b> fast-forward once your stores run themselves.</li></ul>
          <div class="modal-actions">${btn("Let's go", 'closeModal', null, 'primary')}</div>`, { cls: 'celebration wide' });
      }
    },
    payLoan: (d) => result(B.payLoan(state, d.id, Number(d.v))),
    skill: (d) => result(G.upgradeSkill(state, d.id)),
    training: () => result(G.buyTraining(state)),
  };

  const CHANGE = {
    marketing: (v) => result(B.setMarketing(state, ui.storeId, v)),
    autoRestock: (v, d, el) => result(B.setAutoRestock(state, ui.storeId, el.checked)),
    restockTarget: (v) => {
      const store = currentStore();
      result(B.setAutoRestock(state, ui.storeId, store.autoRestock, v));
    },
    downPct: (v, d) => {
      ui.down[d.id] = Number(v);
      UI.render();
    },
  };

  UI.init = function () {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled || !el.dataset.act) return;
      const fn = ACT[el.dataset.act];
      if (!fn) return;
      e.preventDefault();
      fn(el.dataset, el);
    });
    document.addEventListener('change', (e) => {
      const el = e.target.closest('[data-change]');
      if (!el) return;
      const fn = CHANGE[el.dataset.change];
      if (fn) fn(el.value, el.dataset, el);
    });
    document.addEventListener('input', (e) => {
      if (e.target.id === 'offer-input') updateOfferPreview();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'offer-input') ACT.offer();
      else if (e.key === 'Enter' && e.target.id === 'player-name') ACT.newGame();
      else if (e.key === 'Escape' && modalQueue.length && !modalQueue[0].opts.locked) closeModal();
    });
    UI.render();
  };

  // Exposed for debugging in the console.
  UI.state = () => state;
})(typeof window !== 'undefined' ? window : globalThis);
