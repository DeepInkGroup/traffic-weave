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
- Give the road a custom name.
- Add smart signals for better flow, a transit lane for more capacity, or a green buffer for design score.
- See the total construction price update instantly as options change.

Multiple differently shaped connections can link the same two junctions, creating parallel local and express routes. Infrastructure can also be installed later from the selected-road inspector.

Vehicles dynamically choose routes based on current travel time. Congestion reduces their speed, while road class, signals, transit infrastructure, and lane upgrades improve capacity. The live HUD reports trip time, network flow, score, planner rank, hottest road, and budget.

## Technology

The game is dependency-free HTML, CSS, and Canvas JavaScript. It includes responsive mouse/touch controls, high-DPI rendering, procedural traffic simulation, Web Audio feedback, local score persistence, and automated GitHub Pages deployment.
