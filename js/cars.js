/* Vehicle generation, valuation and illustration. */
(function (root) {
  const DS = (root.DS = root.DS || {});
  const U = DS.util;
  const D = DS.data;

  const SHAPES = {
    sedan: {
      body: 'M6 38 Q5 31 10 29 L24 26 L38 17 Q42 14 50 14 L74 14 Q82 14 88 19 L96 26 L108 28 Q114 30 114 36 L114 38 Q114 40 111 40 L9 40 Q6 40 6 38 Z',
      win: 'M41 26 L50 18 Q52 17 56 17 L62 17 L62 26 Z M65 26 L65 17 L74 17 Q79 17 83 20 L89 26 Z',
      wheels: [30, 92],
    },
    suv: {
      body: 'M6 38 L6 26 Q6 22 11 21 L24 19 L32 9 Q34 7 38 7 L94 7 Q99 7 101 11 L107 20 Q113 21 114 26 L114 38 Q114 40 111 40 L9 40 Q6 40 6 38 Z',
      win: 'M30 20 L37 11 L60 11 L60 20 Z M64 20 L64 11 L92 11 Q96 11 98 14 L102 20 Z',
      wheels: [30, 92],
    },
    truck: {
      body: 'M4 38 L4 22 L54 22 L54 10 Q54 7 58 7 L80 7 Q85 7 88 11 L95 20 L109 22 Q115 23 115 29 L115 38 Q115 40 112 40 L7 40 Q4 40 4 38 Z',
      win: 'M59 20 L59 11 L78 11 Q82 11 84 14 L89 20 Z M6 23 L52 23 L52 26 L6 26 Z',
      wheels: [26, 94],
    },
    sports: {
      body: 'M4 38 Q4 32 10 31 L30 28 L48 19 Q54 16 64 16 L78 16 Q88 17 96 24 L110 28 Q116 30 116 35 L116 38 Q116 40 113 40 L7 40 Q4 40 4 38 Z',
      win: 'M50 27 L57 21 Q60 19 66 19 L72 19 L72 27 Z M75 27 L75 19 L79 19 Q86 20 91 27 Z',
      wheels: [28, 94],
    },
    minivan: {
      body: 'M6 38 L6 22 Q6 13 16 10 L28 6 L98 6 Q104 6 106 11 L110 22 Q115 24 115 29 L115 38 Q115 40 112 40 L9 40 Q6 40 6 38 Z',
      win: 'M18 20 L26 10 L48 10 L48 20 Z M52 20 L52 10 L76 10 L76 20 Z M80 20 L80 10 L98 10 Q101 10 102 13 L105 20 Z',
      wheels: [28, 94],
    },
    economy: {
      body: 'M14 38 L14 28 Q14 24 20 23 L32 21 L42 11 Q45 9 50 9 L80 9 Q86 9 90 15 L98 23 Q106 24 106 31 L106 38 Q106 40 103 40 L17 40 Q14 40 14 38 Z',
      win: 'M37 21 L45 13 L62 13 L62 21 Z M66 21 L66 13 L80 13 Q84 13 87 17 L91 21 Z',
      wheels: [34, 88],
    },
    luxury: {
      body: 'M3 38 Q3 31 9 29 L24 26 L40 16 Q44 13 52 13 L78 13 Q86 13 92 18 L101 26 L111 28 Q117 30 117 36 L117 38 Q117 40 114 40 L6 40 Q3 40 3 38 Z',
      win: 'M43 26 L52 17 Q54 16 58 16 L66 16 L66 26 Z M69 26 L69 16 L78 16 Q84 16 88 20 L94 26 Z',
      wheels: [30, 94],
    },
    ev: {
      body: 'M5 38 Q5 31 11 29 L26 26 Q38 14 56 13 L72 13 Q88 14 98 24 L109 27 Q115 29 115 35 L115 38 Q115 40 112 40 L8 40 Q5 40 5 38 Z',
      win: 'M38 25 Q45 17 56 16 L62 16 L62 25 Z M65 25 L65 16 L72 16 Q84 17 92 25 Z',
      wheels: [30, 92],
    },
  };

  const C = (DS.cars = {});

  C.currentYear = (state) => D.START_YEAR + Math.floor(((state ? state.day : 1) - 1) / 365);

  C.create = function (model, opts) {
    opts = opts || {};
    const isNew = !!opts.isNew;
    const age = isNew ? 0 : opts.age || U.randInt(1, 9);
    const mileage = isNew ? U.randInt(3, 60) : Math.round(age * U.rand(7000, 16000));
    const condition = isNew ? 100 : U.clamp(Math.round(100 - age * 4 - U.rand(0, 24)), 22, 98);
    const dep = isNew ? 1 : 0.82 * Math.pow(0.9, age - 1);
    const condFactor = 0.75 + condition / 400;
    const mileFactor = isNew ? 1 : U.clamp(1 - (mileage - age * 12000) / 200000, 0.85, 1.1);
    const value = Math.max(2500, U.roundTo(model.msrp * dep * condFactor * mileFactor, 50));
    const costRatio = opts.costRatio || (isNew ? U.rand(0.89, 0.92) : U.rand(0.8, 0.9));
    return {
      id: U.uid('car'),
      make: model.make,
      model: model.model,
      cls: model.cls,
      msrp: model.msrp,
      year: (opts.year || D.START_YEAR) - age,
      isNew,
      mileage,
      condition,
      color: U.pick(D.COLORS),
      value,
      cost: U.roundTo(value * costRatio, 50),
      daysOnLot: 0,
    };
  };

  C.modelsBy = (filter) => D.MODELS.filter((m) => (!filter.cls || m.cls === filter.cls) && (!filter.make || m.make === filter.make));

  // Random vehicle suited to a city's tastes.
  C.randomFor = function (state, opts) {
    opts = opts || {};
    const city = D.CITIES[opts.city || 'riverton'];
    let pool = [];
    let cls = opts.cls;
    for (let tries = 0; tries < 6 && !pool.length; tries++) {
      if (!cls || tries > 0) cls = U.weighted(city.demand);
      pool = C.modelsBy({ cls, make: opts.make });
    }
    if (!pool.length) pool = opts.make ? C.modelsBy({ make: opts.make }) : D.MODELS;
    return C.create(U.pick(pool), { isNew: opts.isNew, year: C.currentYear(state), costRatio: opts.costRatio });
  };

  C.name = (car) => `${car.year} ${car.make} ${car.model}`;

  C.conditionLabel = function (cond) {
    if (cond >= 99) return 'Brand New';
    if (cond >= 85) return 'Excellent';
    if (cond >= 70) return 'Good';
    if (cond >= 50) return 'Fair';
    return 'Rough';
  };

  // Sticker price shown on the windshield.
  C.listPrice = (car, markup) => Math.max(1000, U.roundTo(car.value * (markup || 1.07), 100) - 1);

  C.svg = function (car, extraClass) {
    const s = SHAPES[car.cls] || SHAPES.sedan;
    const color = (car.color && car.color.hex) || '#888';
    const wheels = s.wheels
      .map((x) => `<circle cx="${x}" cy="40" r="8" fill="#15171c"/><circle cx="${x}" cy="40" r="3.6" fill="#a4adb8"/>`)
      .join('');
    return (
      `<svg class="car-svg ${extraClass || ''}" viewBox="0 0 120 52" aria-hidden="true">` +
      `<ellipse cx="60" cy="47" rx="54" ry="3" fill="rgba(0,0,0,.28)"/>` +
      `<path d="${s.body}" fill="${color}" stroke="rgba(0,0,0,.45)" stroke-width="1"/>` +
      `<path d="${s.win}" fill="rgba(20,30,45,.72)"/>` +
      `<rect x="${car.cls === 'economy' ? 101 : 109}" y="30" width="5" height="3" rx="1" fill="#ffe9a8"/>` +
      wheels +
      `</svg>`
    );
  };
})(typeof window !== 'undefined' ? window : globalThis);
