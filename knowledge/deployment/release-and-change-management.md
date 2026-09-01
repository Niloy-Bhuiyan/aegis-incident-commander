---
title: Release and Change Management
type: deployment
service:
tags: [deploy, release, config, change-log, risk]
---

# Release and Change Management

## Two independent change streams

Every service has two things that can change, versioned and released
separately:

- The binary, released as service@semver, for example checkout-service@4.12.0.
- The configuration bundle, versioned as service/config@date.sequence, for
  example auth-service/config@2026-09-02.3.

Correlating an incident against only one of these streams is the most common
triage mistake. A config change is invisible in the deploy history and vice
versa. Capacity events - replica maintenance, traffic shifts, pool resizing -
are recorded in the same change log and are neither deploys nor config changes.

## Risk labels

Changes are labelled low, medium or high risk at merge time.

- high: touches a hot request path, a shared datastore, or an auth primitive
- medium: schema-compatible data changes, capacity changes
- low: dependency bumps, logging, documentation

During triage, a high-risk change to the affected service within 15 minutes of
the first SLO breach is the strongest available correlation. A low-risk change
to a service that is not on the affected request path is almost always a
coincidence.

## Rollback policy

Rollback is always permitted during an active incident and does not require a
change advisory review. Rolling forward requires a reviewed fix and is not the
default during an incident.

Configuration reverts are narrower than binary rollbacks and are preferred when
only configuration changed. Reverting a single key restores the previous value
within one 60-second refresh cycle.

## Deploy cadence

Application services deploy several times per day during business hours.
payments-db is patched during a monthly maintenance window. This asymmetry
matters: a recent deploy near a payments-db incident is likely coincidental,
whereas a recent deploy near an application-service incident is likely causal.
