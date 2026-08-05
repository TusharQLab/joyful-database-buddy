# Fuelio demo data & status simulator

## What exists

- **100 demo stations** across Delhi NCR (Delhi, Noida, Gurugram, Faridabad, Ghaziabad,
  Greater Noida) — 25 localities × 4 companies (IOCL, BPCL, HPCL, Reliance), each with
  real approximate coordinates, city, fuel mix and opening hours.
- **One `live_status` row per station** (created automatically by the
  `create_live_status_after_station_insert` trigger) seeded with believable values:
  fuel availability, queue of 0–45 minutes, power mostly ON, staggered `updated_at`.

## Re-running the seed

The seed insert is guarded with `WHERE NOT EXISTS (... s.name = g.name)`, so running it
again inserts nothing for stations that already exist — no duplicates. Re-run it whenever
new localities/companies are added to the list.

## Simulator

Two database helpers (service-role only, not callable from the browser):

```sql
-- nudge ~15% of stations: availability flips, queue drift, rare power toggle, updated_at
select public.simulate_station_activity();      -- default fraction 0.15
select public.simulate_station_activity(0.35);  -- livelier cycle

-- put every station back to a clean, believable baseline
select public.reset_demo_live_status();
```

Both keep data coherent: a station with `power_status = false` has all fuels false and a
NULL queue.

### Start / stop periodic simulation

Simulation is **off by default**. To run it every 5 minutes during development:

```sql
select cron.schedule(
  'fuelio-simulate-activity',
  '*/5 * * * *',
  $$ select public.simulate_station_activity(0.15); $$
);
```

Stop it:

```sql
select cron.unschedule('fuelio-simulate-activity');
```

Change the cadence by unscheduling and re-scheduling with a different cron expression, or
the intensity by changing the fraction argument.
