---
title: Runbook - auth-service 5xx Spike
type: runbook
service: auth-service
tags: [auth, errors, config, revert, runbook]
---

# Runbook: auth-service 5xx Spike

Use this runbook when auth-service breaches its error rate SLO while latency
stays near baseline.

## Confirm the shape

1. A large error rate with near-baseline latency means requests are failing
   early and cheaply. Rule out saturation and slow dependencies first.
2. Confirm session-cache is healthy. If it is, the keyset is being served and
   the failure is in validation logic or configuration, not availability.
3. Confirm the gateway error rate moved at the same moment. auth-service is a
   hard dependency, so the gateway follows it closely.

## Distinguish 500 from 401

auth-service returns 500 - not 401 - when a token carries a key id that is
missing from the verification keyset. A 5xx spike therefore usually means a
configuration fault on our side, most often a key rotation performed out of
order. Client-side problems show up as 401s and do not breach the error SLO.

## Correlate with the change log

Check the auth-service config bundle version. A change to jwt_signing_key_id in
the minutes before the spike is the expected cause. The service binary version
is a distractor here unless it also changed.

## Remediate

Revert the configuration key. A config revert is the correct action because
configuration is what changed: it is a single-key change, it takes effect on the
next refresh cycle, and it does not require redeploying a binary that is not
implicated.

Rolling back the auth-service binary is the wrong remediation for a config-only
change. It is slower, it has a wider blast radius, and it leaves the bad
configuration in place.

Restarting the service does not help. The configuration is read at refresh time,
so a restarted process reloads the same broken keyset.

## Verify recovery

Error rate should fall to baseline within one refresh cycle - about 60 seconds.
Confirm both auth-service and the gateway are inside their error SLOs for three
consecutive samples before resolving.
