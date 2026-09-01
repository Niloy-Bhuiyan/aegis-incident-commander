---
title: Platform Architecture Overview
type: architecture
service:
tags: [topology, dependencies, slo]
---

# Platform Architecture Overview

The storefront is a six-component system. Traffic enters through the gateway and
fans out to two application services, which in turn depend on two datastores.

## Dependency graph

- gateway depends on auth-service and checkout-service
- auth-service depends on session-cache
- checkout-service depends on payments-db and inventory-service
- inventory-service depends on payments-db
- payments-db and session-cache have no dependencies

Because the gateway sits on top of everything, a gateway alert is almost never
the origin of an incident. When several services breach their SLOs at once, the
origin is the breaching service that has no breaching dependency; everything
downstream of it is explained by propagation. Diagnosing the gateway first is the
most common time sink during an incident.

## Service level objectives

| Service | p95 latency | error rate | saturation |
| --- | --- | --- | --- |
| gateway | 400 ms | 2.0% | 0.92 |
| auth-service | 180 ms | 1.5% | 0.92 |
| checkout-service | 600 ms | 2.0% | 0.92 |
| inventory-service | 300 ms | 2.0% | 0.92 |
| payments-db | 150 ms | 1.0% | 0.92 |
| session-cache | 40 ms | 1.0% | 0.92 |

An SLO breach must persist for three consecutive one-sample windows before it
opens an incident. Single-sample spikes are noise and are deliberately ignored.

## Failure propagation

Latency and errors propagate from a dependency to its dependents in proportion
to the coupling of the call path. The gateway inherits roughly 85% of downstream
latency because nearly every request traverses it. checkout-service inherits
about 75% of payments-db latency because order placement is a synchronous write
path with no cache in front of it.

Saturation propagates weakly - about 25% - because each service has its own
thread pool and connection limits.

## Traffic profile

Steady-state traffic is roughly 850 requests per second at the gateway, of which
about 320 reach checkout-service. Traffic is flat during the demo window, so a
change in latency or error rate is not explained by load unless request rate
also moved.
