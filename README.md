# The Dealership 🔑

A browser-based car dealership simulator. You start as a nervous Sales Associate on the floor at Sunrise Motors, work your way up to General Manager, buy a dealership of your own, and grow it into a multi-store automotive empire.

## Play

There's no build step and nothing to install. Open `index.html` in a browser, or serve the folder:

```bash
npm start          # python3 -m http.server 8080, then visit http://localhost:8080
```

Your progress autosaves to the browser's `localStorage`.

## How the game works

### 1. The sales floor
Customers walk into the showroom throughout an 8-hour day. Every action takes time, so choose your customers carefully.

- **Meet:** Small talk reveals the customer's personality (bargain hunter, impulse buyer, high roller and so on). Asking about needs reveals the vehicle class they want, their rough budget and whether they need financing.
- **Lot:** Present cars and watch their reaction. A test drive increases their interest.
- **Negotiate:** Each customer has a hidden maximum price. If you counter too high their mood drops and they lose patience, and if they run out they walk out. Accepting their counter is always safe. Junior staff can't sell below the manager's floor price.
- **F&I:** Pitch financing, an extended warranty, GAP insurance, paint protection and a tire package. Add-ons are pure profit, but every "no" makes the customer less satisfied.
- **Satisfaction** affects your reputation, and reputation brings more and happier customers.

### 2. Career ladder
| Rank | Unlocks |
| --- | --- |
| Sales Associate | 18% front-gross commission |
| Senior Sales Consultant | Higher commission and base pay |
| Sales Manager | Daily override on team sales, no price floor, and **you can buy a used car lot** |
| General Manager | Biggest override and commission |

Promotions depend on cars sold, front gross and reputation, and they're checked at the end of each day. Each sale earns XP. Leveling up gives skill points for Charisma, Negotiation, Product Knowledge and Leadership.

### 3. Ownership
Buy a dealership with as little as 30% down; the bank finances the rest at 8.5%. As an owner you can:
- keep selling personally at the store you work at, where all the gross profit is yours
- set each store's **pricing strategy** (discount, market or premium), **marketing** budget and **auto-restock**
- **hire** salespeople, an F&I manager and a sales manager
- buy inventory at the daily **auction**, or order new cars from the factory if you own a franchise
- buy **upgrades**: lot expansion, showroom renovation, service department, detail shop and online portal
- pay down loans at the **bank**, and **skip a week** once your stores run themselves

Store tiers unlock as you grow: **Used Car Lot**, then **Franchise Dealership** (once you own a store), then **Mega Auto Mall** (once you own two). Cities have different demand. Trucks sell in Dusty Gulch, EVs in Silicon Mesa and luxury cars in Lakeside Heights. Market events such as gas price spikes, tax refund season and recessions shift demand over time.

**Win** by owning 5 dealerships with a $25M net worth to become an **Automotive Mogul**. You can keep playing after that. If you sit deep in overdraft for a week, you go bankrupt.

## Project layout

```
index.html          page shell
css/style.css       all styling (dark theme, responsive)
js/util.js          RNG, math and formatting helpers
js/data.js          vehicles, customer types, ranks, cities, tiers, events
js/cars.js          vehicle generation, valuation and SVG illustrations
js/game.js          state, day cycle, progression, achievements, save/load
js/sales.js         customers and the personal deal flow
js/business.js      dealership ownership and the daily store simulation
js/ui.js            rendering and input handling
js/main.js          bootstrap
tests/              Node tests and a scripted "bot" player
tools/simulate.js   balance simulator
```

The engine files (`util`, `data`, `cars`, `game`, `sales`, `business`) don't touch the DOM, so they run in Node for testing.

```bash
npm test                     # unit + integration tests
npm run simulate -- 400 7    # bot plays 400 days with seed 7 and prints milestones
```
