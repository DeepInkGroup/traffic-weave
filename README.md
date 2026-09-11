# Traffic Weave

Traffic Weave is a polished browser-based traffic-management game inspired by clean infographic design. Build streets, avenues, and highways between junctions, expand overloaded roads, and keep a growing city moving.

## Play

**Live game:** https://deepinkgroup.github.io/traffic-weave/

No installation or build step is required. To run locally:

```powershell
python -m http.server 4173
```

Then open http://localhost:4173.

## Game modes

- **Solo** — a balanced 90-second planning challenge.
- **Rush Hour** — a fast 60-second round with rapidly increasing demand.
- **Ranked** — a strict 120-second score run with persistent local best scores and planner ranks.
- **Sandbox** — unlimited time and budget for free-form city design.

## Build and manage

Select **Build Road**, choose a road class, then select two circular junctions:

| Road | Character | Starting lanes | Cost |
| --- | --- | ---: | ---: |
| Street | Affordable and flexible | 1 | $180 |
| Avenue | Balanced speed and capacity | 2 | $360 |
| Highway | Fast, wide, and high-capacity | 2 | $620 |

### Road Studio

The visual Road Studio works like a compact design canvas. Before placing a connection, you can:

- Choose a direct line, left arc, right arc, or fully drivable S-bend.
- Apply Mist, Coastal, Sand, or Graphite surface palettes.
- Place the route at street level, raise it as an overpass, or send it underground as a tunnel.
- Give the road a custom name.
- Add smart signals for better flow, a transit lane for more capacity, or a green buffer for design score.
- See the total construction price update instantly as options change.

Multiple differently shaped connections can link the same two junctions, creating parallel local and express routes. Infrastructure can also be installed later from the selected-road inspector.

### Tunnels and overpasses

Vertical design is part of the simulation rather than a cosmetic effect:

| Level | Cost modifier | Gameplay |
| --- | ---: | --- |
| Surface | Included | At-grade crossings create conflict delay |
| Overpass | +$240 | Bypasses crossing delay and stays visible above other roads |
| Tunnel | +$420 | Fastest grade-separated route with portal markers and underground traffic |

The game detects geometric intersections between surface roads. Their route cost increases until you add smart signals or build a grade-separated alternative.

### Living-city mechanics

- Roads wear down under sustained traffic. Poor condition reduces capacity and increases travel time; use the road inspector to fund repairs.
- Harbor shift changes, market days, park festivals, train arrivals, and heavy rain temporarily reshape demand.
- Event districts pulse on the map and generate more trips for their duration.
- Maintaining strong network flow during an event earns a response bonus.
- Every 25 completed trips unlocks a city infrastructure grant.

### Flow Lens and city policies

Use **Flow Lens** in the top bar to switch from the clean city view to an analytical overlay. It adds live utilization percentages, green-to-red load halos, and warnings for at-grade crossing conflicts without pausing the simulation.

At each 25-trip milestone, choose a permanent policy for the current run:

- **Mobility Fund** reduces tunnel and overpass construction costs by 30%.
- **Transit First** gives every transit lane five additional vehicles of capacity.
- **Care Program** slows road wear by 45% and makes maintenance cheaper.

The canvas also includes understated district context—waterfront contours, market blocks, park landscaping, station tracks, and infrastructure depth—to make the network easier to read while preserving the minimalist visual language.

Vehicles dynamically choose routes based on current travel time. Congestion reduces their speed, while road class, signals, transit infrastructure, and lane upgrades improve capacity. The live HUD reports trip time, network flow, score, planner rank, hottest road, and budget.

## Technology

The game is dependency-free HTML, CSS, and Canvas JavaScript. It includes responsive mouse/touch controls, high-DPI rendering, procedural traffic simulation, Web Audio feedback, local score persistence, and automated GitHub Pages deployment.
