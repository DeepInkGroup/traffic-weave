# Traffic Weave

A polished, browser-based traffic-management game. Route demand grows over a 90-second round; inspect busy roads, spend a limited city budget on extra lanes, and keep average trip time below 18 minutes.

## Play locally

No build step or dependencies are required.

```powershell
cd traffic-weave
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Controls

- Click or tap any road to select it.
- Use **Add a Lane** to increase that road's capacity.
- Keep an eye on road load, the live trip-time graph, network flow, and budget.
- Pause or mute from the top-right controls.

The simulation includes dynamic route selection, congestion-sensitive travel speed, increasing traffic demand, responsive touch controls, and a win/lose round state.
