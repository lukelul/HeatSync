"""
HeatRouter ESP32 Simulator — Stateful Thermal Model

Closed loop:
  1. GET /api/commands   (read routing decisions from frontend)
  2. Apply heat generation (sources gain, sinks lose)
  3. Apply routing commands (heat transfer from→to)
  4. Apply ambient cooling (everything drifts toward AMBIENT)
  5. Clamp temperatures to safe range
  6. POST /api/telemetry  (send updated temps to server)

Run: python simulate_esp32.py
"""

import time
import requests

# ── Configuration ──────────────────────────────────────────────
API = "http://localhost:3000"
TICK_INTERVAL = 1.0       # seconds between updates

AMBIENT    = 45.0          # ambient temperature (°C)
K          = 0.02          # heat transfer per unit routed
EFFICIENCY = 0.85          # fraction of heat that arrives at sink
COOL_RATE  = 0.03          # ambient drift rate per tick
TEMP_MIN   = 20.0          # clamp floor
TEMP_MAX   = 90.0          # clamp ceiling

# 11 nodes matching frontend config.js
# Sources start hot, sinks start cool, tanks in between
INITIAL_TEMPS = {
    0:  62.0,   # Switch SUPERNAP Chicago   (source)
    1:  55.0,   # CTA Blue Line Tunnel      (source)
    2:  35.0,   # Merchandise Mart           (sink)
    3:  38.0,   # River North District       (sink)
    4:  68.0,   # Kinzie Industrial Corr.    (source)
    # 5:  32.0,   # Goose Island Residential   (sink)
    # 6:  40.0,   # Northwestern Chicago       (sink)
    # 7:  58.0,   # Google Chicago HQ          (source)
    # 8:  48.0,   # Tank A — West Loop         (tank)
    # 9:  46.0,   # Tank B — River North       (tank)
    # 10: 47.0,   # Tank C — Goose Island      (tank)
}

# Per-tick heat generation: positive = produces heat, negative = consumes heat
HEAT_GEN = {
    0:  0.8,    # high waste heat from hyperscale DC
    1:  0.3,    # transit exhaust
    2: -0.5,    # commercial building heat demand
    3: -0.4,    # mixed residential demand
    4:  0.6,    # industrial waste heat
    # 5: -0.3,    # residential demand
    # 6: -0.4,    # university campus demand
    # 7:  0.2,    # corporate DC waste heat
    # 8:  0.0,    # tank (passive)
    # 9:  0.0,    # tank (passive)
    # 10: 0.0,    # tank (passive)
}


def main():
    temps = dict(INITIAL_TEMPS)
    tick = 0

    print("=" * 60)
    print("  HeatRouter ESP32 Simulator")
    print(f"  Nodes: {len(temps)}  |  AMBIENT={AMBIENT}°C  |  K={K}")
    print(f"  EFFICIENCY={EFFICIENCY}  |  COOL_RATE={COOL_RATE}")
    print(f"  API: {API}")
    print("=" * 60)

    # POST initial telemetry so frontend has data immediately
    try:
        payload = {
            "nodes": [{"id": nid, "tempC": round(temps[nid], 2)}
                      for nid in sorted(temps)]
        }
        requests.post(f"{API}/api/telemetry", json=payload, timeout=2)
        print("[Init] Posted initial temperatures")
    except Exception as e:
        print(f"[Init] Server not ready: {e}")

    while True:
        tick += 1

        # ── 1. GET routing commands ────────────────────────────
        routes = []
        try:
            r = requests.get(f"{API}/api/commands", timeout=2)
            data = r.json()
            routes = data.get("routes", [])
        except Exception as e:
            if tick <= 3:
                print(f"[Tick {tick}] Commands fetch failed: {e}")

        # ── 2. Heat generation (sources gain, sinks lose) ─────
        for nid, rate in HEAT_GEN.items():
            if nid in temps:
                temps[nid] += rate

        # ── 3. Apply routing (heat transfer) ──────────────────
        for route in routes:
            src = route.get("from")
            dst = route.get("to")
            units = route.get("units", 0)
            if src in temps and dst in temps:
                heat_out = K * units
                temps[src] -= heat_out
                temps[dst] += heat_out * EFFICIENCY

        # ── 4. Ambient cooling (drift toward AMBIENT) ─────────
        for nid in temps:
            temps[nid] += (AMBIENT - temps[nid]) * COOL_RATE

        # ── 5. Clamp to safe range ────────────────────────────
        for nid in temps:
            temps[nid] = max(TEMP_MIN, min(TEMP_MAX, temps[nid]))

        # ── 6. POST updated telemetry ─────────────────────────
        payload = {
            "nodes": [{"id": nid, "tempC": round(temps[nid], 2)}
                      for nid in sorted(temps)]
        }
        try:
            requests.post(f"{API}/api/telemetry", json=payload, timeout=2)
        except Exception as e:
            print(f"[Tick {tick}] Telemetry POST failed: {e}")

        # ── Log ───────────────────────────────────────────────
        hottest = max(temps, key=temps.get)
        coolest = min(temps, key=temps.get)
        spread = temps[hottest] - temps[coolest]
        print(
            f"[Tick {tick:4d}]  "
            f"Hot: #{hottest}={temps[hottest]:.1f}°C  "
            f"Cool: #{coolest}={temps[coolest]:.1f}°C  "
            f"Spread: {spread:.1f}°C  "
            f"Routes: {len(routes)}"
        )

        time.sleep(TICK_INTERVAL)


if __name__ == "__main__":
    main()
