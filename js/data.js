/* Static game data: vehicles, customers, careers, cities, dealership tiers, events. */
(function (root) {
  const DS = (root.DS = root.DS || {});

  const CLASSES = {
    economy: { label: 'Economy', ref: 18000 },
    sedan: { label: 'Sedan', ref: 27000 },
    suv: { label: 'SUV', ref: 38000 },
    truck: { label: 'Truck', ref: 44000 },
    minivan: { label: 'Minivan', ref: 34000 },
    luxury: { label: 'Luxury', ref: 62000 },
    sports: { label: 'Sports', ref: 56000 },
    ev: { label: 'Electric', ref: 42000 },
  };

  // Fictional manufacturers.
  const MODELS = [
    { make: 'Brisa', model: 'Pico', cls: 'economy', msrp: 16900 },
    { make: 'Brisa', model: 'Sol', cls: 'sedan', msrp: 23900 },
    { make: 'Brisa', model: 'Familia', cls: 'minivan', msrp: 33500 },
    { make: 'Brisa', model: 'Andes', cls: 'suv', msrp: 29900 },
    { make: 'Kestrel', model: 'Glide', cls: 'sedan', msrp: 28400 },
    { make: 'Kestrel', model: 'Trailhawk', cls: 'suv', msrp: 36200 },
    { make: 'Kestrel', model: 'Summit', cls: 'suv', msrp: 47500 },
    { make: 'Kestrel', model: 'Wren', cls: 'economy', msrp: 19800 },
    { make: 'Ironhorse', model: 'Ranchhand', cls: 'truck', msrp: 38900 },
    { make: 'Ironhorse', model: 'Goliath HD', cls: 'truck', msrp: 59800 },
    { make: 'Ironhorse', model: 'Stallion Ridge', cls: 'suv', msrp: 44500 },
    { make: 'Ironhorse', model: 'Caravan Pro', cls: 'minivan', msrp: 38500 },
    { make: 'Valora', model: 'S4', cls: 'luxury', msrp: 52800 },
    { make: 'Valora', model: 'Regent', cls: 'luxury', msrp: 84500 },
    { make: 'Valora', model: 'Altezza X', cls: 'suv', msrp: 68900 },
    { make: 'Zephyr', model: 'Spark', cls: 'ev', msrp: 32900 },
    { make: 'Zephyr', model: 'Volt X', cls: 'ev', msrp: 54900 },
    { make: 'Zephyr', model: 'Current', cls: 'ev', msrp: 41500 },
    { make: 'Strada', model: 'Vento', cls: 'sports', msrp: 44800 },
    { make: 'Strada', model: 'Furia GT', cls: 'sports', msrp: 112000 },
    { make: 'Strada', model: 'Corsa', cls: 'sports', msrp: 61500 },
  ];

  const BRANDS = ['Brisa', 'Kestrel', 'Ironhorse', 'Valora', 'Zephyr', 'Strada'];

  const COLORS = [
    { name: 'Arctic White', hex: '#e8edf2' },
    { name: 'Midnight Black', hex: '#1d2027' },
    { name: 'Silver Mist', hex: '#a9b2bd' },
    { name: 'Graphite', hex: '#5a616b' },
    { name: 'Racing Red', hex: '#d63a3a' },
    { name: 'Ocean Blue', hex: '#2f6fd6' },
    { name: 'Forest Green', hex: '#2f7d4f' },
    { name: 'Sunburst Yellow', hex: '#f0c23b' },
    { name: 'Copper Orange', hex: '#d9773a' },
    { name: 'Deep Burgundy', hex: '#7b2338' },
    { name: 'Sky Teal', hex: '#2fb3b0' },
  ];

  const FIRST_NAMES = [
    'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Rowan',
    'Maria', 'James', 'Priya', 'Wei', 'Fatima', 'Diego', 'Hannah', 'Omar', 'Grace', 'Luis',
    'Keiko', 'Samuel', 'Aisha', 'Noah', 'Elena', 'Marcus', 'Sofia', 'Darnell', 'Ingrid', 'Tomas',
    'Nadia', 'Victor', 'Chloe', 'Ravi', 'Brenda', 'Hank', 'Lucia', 'Oscar', 'Mei', 'Frank',
  ];
  const LAST_NAMES = [
    'Smith', 'Garcia', 'Nguyen', 'Patel', 'Johnson', 'Kim', 'Okafor', 'Rossi', 'Novak', 'Silva',
    'Brown', 'Cohen', 'Martinez', 'Haddad', 'Larsen', 'Tanaka', 'Murphy', 'Dubois', 'Schmidt', 'Reyes',
    'Walker', 'Chen', 'Hughes', 'Ivanova', 'Mensah', 'Fischer', 'Lopez', 'Moreau', 'Baker', 'Singh',
  ];
  const AVATARS = ['👨', '👩', '🧔', '👱‍♀️', '👴', '👵', '🧑', '👨‍🦰', '👩‍🦱', '👨‍🦳', '👩‍🦰', '🧑‍🦱', '👱', '🧕', '👲'];

  // reaction to discovery approaches: positive numbers raise mood.
  const CUSTOMER_TYPES = {
    bargain: {
      label: 'Bargain Hunter', icon: '🏷️', weight: 18,
      classes: { economy: 4, sedan: 3, suv: 1.5, truck: 1, minivan: 1 },
      budget: [0.5, 0.82], priceSens: 1.5, patience: [4, 6], addon: 0.14, financing: 0.4, wantsNew: 0.08,
      wtpMod: 0.95, opener: [0.78, 0.86], talk: { smalltalk: 2, lot: 4 },
      hints: ['Clutching a stack of competitor ads', 'Asked where the "cheap cars" are', 'Already mentioned the word "discount" twice'],
      desc: 'Price is everything. Expect hard haggling and few add-ons.',
    },
    firstTime: {
      label: 'First-Time Buyer', icon: '🎓', weight: 16,
      classes: { economy: 4, sedan: 3, ev: 1 },
      budget: [0.55, 0.88], priceSens: 1.1, patience: [3, 5], addon: 0.42, financing: 0.92, wantsNew: 0.25,
      wtpMod: 1.0, opener: [0.84, 0.9], talk: { smalltalk: 10, lot: -3 },
      hints: ['Came in with a parent', 'Looks a little nervous', 'Keeps checking a budgeting app'],
      desc: 'Needs reassurance and financing. Responds well to a friendly approach.',
    },
    family: {
      label: 'Family Shopper', icon: '👨‍👩‍👧', weight: 16,
      classes: { suv: 4, minivan: 3, sedan: 1 },
      budget: [0.72, 1.02], priceSens: 1.1, patience: [3, 5], addon: 0.5, financing: 0.6, wantsNew: 0.35,
      wtpMod: 1.0, opener: [0.84, 0.9], talk: { smalltalk: 8, lot: -2 },
      hints: ['Two kids in tow', 'Measuring trunk space with a tape measure', 'Asking about safety ratings'],
      desc: 'Wants space and safety. Warranties are an easy sell.',
    },
    enthusiast: {
      label: 'Car Enthusiast', icon: '🏁', weight: 9,
      classes: { sports: 5, luxury: 2, truck: 1 },
      budget: [0.82, 1.25], priceSens: 0.8, patience: [3, 5], addon: 0.3, financing: 0.4, wantsNew: 0.45,
      wtpMod: 1.03, opener: [0.86, 0.92], talk: { smalltalk: 9, lot: 3 },
      hints: ['Wearing a racing team jacket', 'Already popped a hood to look at the engine', 'Talking about 0-60 times'],
      desc: 'Loves to talk shop. Will pay up for the right car.',
    },
    researcher: {
      label: 'Internet Researcher', icon: '💻', weight: 12,
      classes: { sedan: 2, suv: 2, ev: 2, truck: 1, luxury: 1 },
      budget: [0.78, 1.02], priceSens: 1.35, patience: [5, 7], addon: 0.1, financing: 0.3, wantsNew: 0.5,
      wtpMod: 0.96, opener: [0.8, 0.87], talk: { smalltalk: -6, lot: 5 },
      hints: ['Has a spreadsheet open on their phone', 'Quoting invoice prices from a forum', 'Printed out three online listings'],
      desc: 'Knows the numbers. Patient, firm and hates small talk.',
    },
    impulse: {
      label: 'Impulse Buyer', icon: '⚡', weight: 9,
      classes: { sports: 2, luxury: 2, suv: 1, truck: 1, ev: 1 },
      budget: [0.9, 1.35], priceSens: 0.65, patience: [2, 3], addon: 0.55, financing: 0.5, wantsNew: 0.6,
      wtpMod: 1.05, opener: [0.88, 0.94], talk: { smalltalk: -5, lot: 8 },
      hints: ['Just got a big bonus at work', 'Walked straight onto the lot', 'Saw a car in the window and "had to have it"'],
      desc: 'Decides fast and pays well — but has very little patience.',
    },
    business: {
      label: 'Contractor', icon: '🧰', weight: 10,
      classes: { truck: 5, suv: 1, minivan: 1 },
      budget: [0.78, 1.12], priceSens: 1.0, patience: [3, 5], addon: 0.3, financing: 0.5, wantsNew: 0.35,
      wtpMod: 1.0, opener: [0.84, 0.9], talk: { smalltalk: 1, lot: 6 },
      hints: ['Work boots and a hi-vis vest', 'Asking about towing capacity', 'Needs something for the job site'],
      desc: 'Practical and direct. Wants a workhorse.',
    },
    eco: {
      label: 'Eco-Conscious', icon: '🌱', weight: 10,
      classes: { ev: 5, economy: 2 },
      budget: [0.72, 1.05], priceSens: 1.0, patience: [3, 5], addon: 0.3, financing: 0.5, wantsNew: 0.5,
      wtpMod: 1.0, opener: [0.84, 0.9], talk: { smalltalk: 7, lot: 0 },
      hints: ['Rode in on a bicycle', 'Asking about charging stations', 'Wearing a "Save the Bees" T-shirt'],
      desc: 'Cares about efficiency and the planet.',
    },
    highRoller: {
      label: 'High Roller', icon: '💼', weight: 6,
      classes: { luxury: 4, sports: 2, suv: 1 },
      budget: [1.0, 1.5], priceSens: 0.7, patience: [3, 4], addon: 0.5, financing: 0.2, wantsNew: 0.75,
      wtpMod: 1.04, opener: [0.87, 0.93], talk: { smalltalk: 6, lot: 2 },
      hints: ['Arrived in a chauffeured car', 'Designer sunglasses and a gold watch', 'On the phone closing a "big deal"'],
      desc: 'Money is no object — service is. Treat them like royalty.',
    },
  };

  // Front and back commission percentages for employees.
  const RANKS = [
    { id: 0, title: 'Sales Associate', weekly: 450, front: 0.18, back: 0.05, override: [0, 0], req: null },
    { id: 1, title: 'Senior Sales Consultant', weekly: 650, front: 0.22, back: 0.08, override: [0, 0], req: { sales: 12, gross: 30000, rep: 52 } },
    { id: 2, title: 'Sales Manager', weekly: 1100, front: 0.25, back: 0.1, override: [150, 350], req: { sales: 35, gross: 110000, rep: 58 } },
    { id: 3, title: 'General Manager', weekly: 1800, front: 0.28, back: 0.12, override: [400, 800], req: { sales: 70, gross: 240000, rep: 64 } },
    { id: 4, title: 'Dealer Principal', owner: true },
    { id: 5, title: 'Auto Group Owner', owner: true },
    { id: 6, title: 'Automotive Mogul', owner: true },
  ];

  const PRODUCTS = {
    financing: { label: 'Dealer Financing', desc: 'Arrange the loan in-house (profit from rate markup).', price: 0, cost: 0, pct: 0.02, mins: 5 },
    warranty: { label: 'Extended Warranty', desc: '5 years / 100k miles bumper-to-bumper.', price: 1895, cost: 780, mins: 5,
      affinity: { family: 1.5, firstTime: 1.25, impulse: 1.1, highRoller: 1.0, business: 1.0, eco: 0.9, enthusiast: 0.7, researcher: 0.6, bargain: 0.5 } },
    gap: { label: 'GAP Insurance', desc: 'Covers the loan balance if the car is totaled.', price: 795, cost: 240, mins: 5, needsFinancing: true,
      affinity: { firstTime: 1.5, family: 1.2 } },
    protection: { label: 'Paint & Interior Protection', desc: 'Ceramic coating and fabric guard.', price: 995, cost: 160, mins: 5,
      affinity: { highRoller: 1.5, enthusiast: 1.4, impulse: 1.2, family: 0.9, bargain: 0.4 } },
    tires: { label: 'Tire & Wheel Package', desc: 'Covers road-hazard damage for 5 years.', price: 695, cost: 220, mins: 5,
      affinity: { business: 1.5, family: 1.1, enthusiast: 1.2 } },
  };

  const CITIES = {
    riverton: { name: 'Riverton', desc: 'Family-friendly suburb', pop: 1.0, price: 1.0,
      demand: { economy: 1, sedan: 1.2, suv: 1.5, truck: 0.9, minivan: 1.4, luxury: 0.6, sports: 0.5, ev: 0.8 } },
    mapleFalls: { name: 'Maple Falls', desc: 'Small mountain town', pop: 0.75, price: 0.8,
      demand: { economy: 1, sedan: 0.8, suv: 1.5, truck: 1.9, minivan: 0.8, luxury: 0.4, sports: 0.4, ev: 0.5 } },
    dustyGulch: { name: 'Dusty Gulch', desc: 'Rural farm country', pop: 0.65, price: 0.65,
      demand: { economy: 1.3, sedan: 0.8, suv: 1.0, truck: 2.3, minivan: 0.8, luxury: 0.3, sports: 0.3, ev: 0.3 } },
    siliconMesa: { name: 'Silicon Mesa', desc: 'Booming tech hub', pop: 1.2, price: 1.35,
      demand: { economy: 0.9, sedan: 1.1, suv: 1.0, truck: 0.5, minivan: 0.7, luxury: 1.2, sports: 1.0, ev: 2.2 } },
    lakeside: { name: 'Lakeside Heights', desc: 'Affluent lakeside enclave', pop: 0.9, price: 1.5,
      demand: { economy: 0.5, sedan: 1.0, suv: 1.4, truck: 0.7, minivan: 0.9, luxury: 2.1, sports: 1.3, ev: 1.2 } },
    portAvalon: { name: 'Port Avalon', desc: 'Glitzy coastal city', pop: 1.35, price: 1.45,
      demand: { economy: 0.8, sedan: 1.0, suv: 1.0, truck: 0.6, minivan: 0.7, luxury: 1.8, sports: 1.8, ev: 1.2 } },
    grandMetro: { name: 'Grand Metro', desc: 'Sprawling metropolis', pop: 1.75, price: 1.65,
      demand: { economy: 1.3, sedan: 1.4, suv: 1.2, truck: 0.8, minivan: 1.0, luxury: 1.2, sports: 1.0, ev: 1.3 } },
  };

  const TIERS = {
    usedLot: {
      label: 'Used Car Lot', icon: '🚙', capacity: 12, overhead: 280, baseTraffic: 7, staffSlots: 3,
      price: [95000, 150000], startStaff: ['sales'], startCars: 7, newCars: false, scale: 1,
      minRank: 2, minOwned: 0,
      blurb: 'A gravel lot with a trailer office. Every empire starts somewhere.',
    },
    franchise: {
      label: 'Franchise Dealership', icon: '🏢', capacity: 30, overhead: 1100, baseTraffic: 20, staffSlots: 8,
      price: [850000, 1400000], startStaff: ['sales', 'sales', 'sales', 'finance'], startCars: 16, newCars: true, scale: 3,
      minRank: 3, minOwned: 1,
      blurb: 'A branded showroom selling new cars from the factory plus trade-ins.',
    },
    mega: {
      label: 'Mega Auto Mall', icon: '🏟️', capacity: 70, overhead: 4000, baseTraffic: 34, staffSlots: 16,
      price: [3800000, 6200000], startStaff: ['sales', 'sales', 'sales', 'sales', 'sales', 'sales', 'finance', 'manager'], startCars: 34, newCars: true, scale: 8,
      minRank: 3, minOwned: 2,
      blurb: 'A glass-and-steel palace with acres of inventory. The big leagues.',
    },
  };

  const STAFF_ROLES = {
    sales: { label: 'Salesperson', icon: '🤝', baseSalary: 60, perSkill: 12, desc: 'Works the floor and closes deals. Earns 20% commission on front gross.' },
    finance: { label: 'F&I Manager', icon: '📑', baseSalary: 130, perSkill: 25, desc: 'Sells warranties and financing on every deal. One per store.' },
    manager: { label: 'Sales Manager', icon: '📋', baseSalary: 180, perSkill: 32, desc: 'Coaches the sales team, boosting their close rate. One per store.' },
  };

  const UPGRADES = {
    lot: { label: 'Lot Expansion', icon: '🅿️', max: 3, cost: [40000, 90000, 180000], desc: '+40% vehicle capacity per level.' },
    showroom: { label: 'Showroom Renovation', icon: '✨', max: 3, cost: [60000, 140000, 300000], desc: '+12% foot traffic and faster reputation growth per level.' },
    service: { label: 'Service Department', icon: '🔧', max: 3, cost: [80000, 180000, 380000], desc: 'Earns daily repair income that grows with reputation.' },
    detail: { label: 'Detail Shop', icon: '🧽', max: 2, cost: [35000, 90000], desc: 'Cars look their best: +3% sale price per level.' },
    online: { label: 'Online Sales Portal', icon: '🌐', max: 1, cost: [50000], desc: '+18% foot traffic from internet leads.' },
  };

  const MARKETING = [
    { label: 'None', cost: 0, traffic: 1.0 },
    { label: 'Flyers', cost: 120, traffic: 1.18 },
    { label: 'Local Radio', cost: 350, traffic: 1.4 },
    { label: 'TV Spots', cost: 800, traffic: 1.68 },
    { label: 'Billboards + TV', cost: 1600, traffic: 2.0 },
    { label: 'Regional Blitz', cost: 3200, traffic: 2.4 },
  ];

  const STRATEGIES = {
    discount: { label: 'Discount', sticker: 1.03, npcPrice: 0.97, close: 1.25, rep: 0.12, desc: 'Low prices move metal fast and win goodwill.' },
    market: { label: 'Market', sticker: 1.07, npcPrice: 1.0, close: 1.0, rep: 0.05, desc: 'Fair, competitive pricing.' },
    premium: { label: 'Premium', sticker: 1.12, npcPrice: 1.045, close: 0.75, rep: -0.03, desc: 'Fat margins, fewer sales.' },
  };

  const EVENTS = [
    { id: 'gasSpike', title: 'Gas Price Spike', icon: '⛽', days: [6, 10], text: 'Gas prices are through the roof. EVs and economy cars are hot; trucks are not.',
      demand: { ev: 1.5, economy: 1.3, truck: 0.7, suv: 0.85, sports: 0.85 } },
    { id: 'taxRefund', title: 'Tax Refund Season', icon: '💸', days: [6, 9], text: 'Refund checks are landing. Showrooms are packed!', traffic: 1.25 },
    { id: 'rateHike', title: 'Interest Rate Hike', icon: '🏦', days: [8, 14], text: 'Borrowing just got pricier. Buyers are cautious.', traffic: 0.85, close: 0.92 },
    { id: 'racingMovie', title: 'Blockbuster Racing Movie', icon: '🎬', days: [5, 9], text: 'A hit street-racing film has everyone wanting a sports car.', demand: { sports: 1.8, luxury: 1.15 } },
    { id: 'chipShortage', title: 'Chip Shortage', icon: '🔌', days: [8, 14], text: 'New-car production is stalled. Used values climb.', value: 1.06 },
    { id: 'babyBoom', title: 'Suburban Baby Boom', icon: '🍼', days: [7, 12], text: 'Growing families need bigger vehicles.', demand: { minivan: 1.6, suv: 1.3 } },
    { id: 'construction', title: 'Construction Boom', icon: '🏗️', days: [7, 12], text: 'New housing developments everywhere. Contractors need trucks.', demand: { truck: 1.7 } },
    { id: 'recession', title: 'Economic Slowdown', icon: '📉', days: [10, 16], text: 'Consumers are tightening belts. Traffic is down.', traffic: 0.72, demand: { economy: 1.3, luxury: 0.6, sports: 0.6 } },
    { id: 'evCredit', title: 'EV Tax Credit', icon: '🔋', days: [7, 12], text: 'A new government rebate makes electric cars irresistible.', demand: { ev: 1.9 } },
    { id: 'autoShow', title: 'Regional Auto Show', icon: '🏆', days: [3, 5], text: 'The auto show is in town. Car fever is everywhere.', traffic: 1.2, close: 1.05 },
  ];

  const INCIDENTS = [
    { id: 'viral', weight: 3, text: 'A glowing review of {store} went viral. Reputation up!', rep: 5 },
    { id: 'badReview', weight: 3, text: 'An angry one-star rant about {store} is making the rounds.', rep: -4 },
    { id: 'hail', weight: 2, text: 'A hailstorm dented cars on the lot at {store}. Repairs cost {amount}.', cost: [2500, 7000] },
    { id: 'inspection', weight: 2, text: 'State inspectors fined {store} {amount} for paperwork violations.', cost: [1500, 4500] },
    { id: 'star', weight: 3, text: '{name} at {store} attended a sales seminar and leveled up!', star: true },
    { id: 'quit', weight: 1, text: '{name} quit {store} to work for a competitor.', quit: true },
    { id: 'fleet', weight: 2, text: 'A local business bought a small fleet from {store}!', fleet: true },
  ];

  const STORE_NAMES_A = ['Sunset', 'Liberty', 'Summit', 'Blue Ridge', 'Gateway', 'Eagle', 'Pioneer', 'Crown', 'Heritage', 'Lone Star', 'Main Street', 'Golden Mile', 'Victory', 'Redwood', 'Harbor'];
  const STORE_NAMES_B = ['Motors', 'Auto Sales', 'Autos', 'Car Company', 'Motor Works', 'Auto Center', 'Motor Co.'];

  DS.data = {
    START_YEAR: 2026,
    DAY_MINUTES: 480,
    OPEN_HOUR: 9,
    WEEKLY_LIVING: 400,
    WEEKDAYS: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    CLASSES, MODELS, BRANDS, COLORS, FIRST_NAMES, LAST_NAMES, AVATARS, CUSTOMER_TYPES,
    RANKS, PRODUCTS, CITIES, TIERS, STAFF_ROLES, UPGRADES, MARKETING, STRATEGIES, EVENTS, INCIDENTS,
    STORE_NAMES_A, STORE_NAMES_B,
    EMPLOYER: { name: 'Sunrise Motors', city: 'riverton', inventorySize: 20 },
    LOAN_RATE: 0.085,
    MAX_LOAN_PCT: 0.7,
    WIN_NET_WORTH: 25000000,
    WIN_STORES: 5,
  };
})(typeof window !== 'undefined' ? window : globalThis);
