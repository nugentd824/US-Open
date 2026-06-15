// Mock data source for tournaments + the golfer field with win odds.
//
// This is the canonical golfer list for the mock providers: BOTH the odds
// provider (draft pool) and the mock score provider read from here, so golfer
// ids always line up and the demo is internally consistent. Real providers
// (The Odds API, Sportradar) bring their own ids and are matched by name.

export const slugify = (name) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// [name, decimalOddsToWin] — favorites first. Odds are illustrative.
const FIELD = [
  ['Scottie Scheffler', 4.5],
  ['Rory McIlroy', 9],
  ['Xander Schauffele', 12],
  ['Ludvig Aberg', 16],
  ['Collin Morikawa', 18],
  ['Bryson DeChambeau', 20],
  ['Viktor Hovland', 22],
  ['Justin Thomas', 28],
  ['Hideki Matsuyama', 30],
  ['Patrick Cantlay', 33],
  ['Jon Rahm', 14],
  ['Brooks Koepka', 40],
  ['Tommy Fleetwood', 35],
  ['Wyndham Clark', 45],
  ['Shane Lowry', 50],
  ['Max Homa', 55],
  ['Tony Finau', 55],
  ['Sahith Theegala', 60],
  ['Russell Henley', 50],
  ['Sungjae Im', 66],
  ['Jordan Spieth', 45],
  ['Will Zalatoris', 55],
  ['Cameron Smith', 40],
  ['Matt Fitzpatrick', 60],
  ['Tyrrell Hatton', 50],
  ['Robert MacIntyre', 70],
  ['Sepp Straka', 66],
  ['Akshay Bhatia', 80],
  ['Jason Day', 70],
  ['Corey Conners', 80],
  ['Cameron Young', 66],
  ['Aaron Rai', 90],
  ['Billy Horschel', 90],
  ['Keegan Bradley', 80],
  ['Sam Burns', 75],
  ['Si Woo Kim', 100],
  ['Adam Scott', 100],
  ['Brian Harman', 90],
  ['J.T. Poston', 110],
  ['Denny McCarthy', 120],
  ['Nick Taylor', 110],
  ['Min Woo Lee', 100],
  ['Tom Kim', 90],
  ['Harris English', 110],
  ['Byeong Hun An', 120],
  ['Christiaan Bezuidenhout', 150],
  ['Maverick McNealy', 130],
  ['Taylor Pendrith', 140],
  ['Thomas Detry', 150],
  ['Davis Thompson', 160],
  ['Matthieu Pavon', 175],
  ['Stephan Jaeger', 200],
  ['Nicolai Hojgaard', 175],
  ['J.J. Spaun', 200],
  ['Eric Cole', 250],
  ['Lucas Glover', 250],
  ['Adam Hadwin', 220],
  ['Mackenzie Hughes', 250],
  ['Chris Kirk', 200],
  ['Patrick Rodgers', 300],
];

function buildField() {
  // Attach ids, implied probability and an odds rank (1 = biggest favorite).
  const withProb = FIELD.map(([name, odds]) => ({
    golferId: slugify(name),
    name,
    oddsDecimal: odds,
    impliedProb: +(1 / odds).toFixed(4), // raw implied prob (ignores bookmaker vig)
  }));
  withProb.sort((a, b) => a.oddsDecimal - b.oddsDecimal);
  withProb.forEach((g, i) => (g.oddsRank = i + 1));
  return withProb;
}

const SHARED_FIELD = buildField();

// A couple of selectable "scheduled" events. They share the field for the demo.
export const MOCK_TOURNAMENTS = [
  {
    id: 'mock-us-open-2026',
    name: 'U.S. Open',
    startDate: '2026-06-18',
    endDate: '2026-06-21',
    course: 'Shinnecock Hills Golf Club',
    location: 'Southampton, NY',
    par: 70,
    field: SHARED_FIELD,
  },
  {
    id: 'mock-travelers-2026',
    name: 'Travelers Championship',
    startDate: '2026-06-25',
    endDate: '2026-06-28',
    course: 'TPC River Highlands',
    location: 'Cromwell, CT',
    par: 70,
    field: SHARED_FIELD,
  },
];

export function getMockTournaments() {
  // List view: omit the (large) field array.
  return MOCK_TOURNAMENTS.map(({ field, ...rest }) => ({
    ...rest,
    fieldSize: field.length,
  }));
}

export function getMockTournament(id) {
  return MOCK_TOURNAMENTS.find((t) => t.id === id) || null;
}
