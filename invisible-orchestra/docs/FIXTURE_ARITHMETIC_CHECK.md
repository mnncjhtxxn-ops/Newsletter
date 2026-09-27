# Fixture arithmetic verification

Verified using Python Decimal arithmetic and an independent 15-minute cheapest-slot allocation.
This confirms F01–F06 numerical expectations only. It is not an application build, rendering test, performance test, F07/F08 behavioural test or kiosk certification.

| Fixture | Target feasible? | EV input (kWh) | EV cost (£) | Final stored energy (kWh) | Shortfall (kWh) |
|---|---:|---:|---:|---:|---:|
| F01 | Yes | 20.000000 | 3.12 | 30.000000 | 0.000000 |
| F02 | Yes | 20.000000 | 6.00 | 30.000000 | 0.000000 |
| F03 | No | 13.333333 | 4.00 | 24.000000 | 6.000000 |
| F04 | No | 14.400000 | 4.32 | 24.960000 | 5.040000 |
| F05 | No | 16.000000 | 4.80 | 26.400000 | 3.600000 |
| F06 | Yes | 20.000000 | 4.40 | 30.000000 | 0.000000 |

Costs/final charge for infeasible cases describe bounded diagnostic partial charging, not an accepted or dispatched plan.
