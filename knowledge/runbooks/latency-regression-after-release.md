---
title: Runbook - Latency Regression After a Release
type: runbook
service: checkout-service
tags: [latency, deploy, rollback, runbook]
---

# Runbook: Latency Regression After a Release

Use this runbook when a single application service breaches its latency SLO,
its error rate is broadly unchanged, and its dependencies are healthy.

## Confirm the shape

1. Check that the latency increase is a step, not a ramp. A step change points
   at a discrete event such as a deploy or a config change.
2. Check the error rate. A latency regression from a code change usually leaves
   the error rate close to baseline; requests are slow, not failing.
3. Check every dependency of the affected service. If they are within SLO, the
   cause is local to the service.
4. Check request rate. If traffic is flat, the regression is not load-driven.

## Correlate with the change log

Look for a deploy or config change to the affected service in the 15 minutes
before the first breach. A high-risk release landing minutes before a step
change in latency is the strongest single correlation available during triage.
Deploys to other services in the same window are usually coincidental - check
whether they are even on the request path before spending time on them.

## Remediate

Roll back the offending release. Rollback is preferred over rolling forward
during an active incident: it restores a known-good state in one step and does
not require the fix to be correct on the first attempt.

Do not scale out to absorb a code regression. Extra replicas execute the same
inefficient code path and buy at most a small constant factor while raising
load on shared dependencies.

Do not restart the service. A restart clears transient state but a regression
that is present in the deployed artifact returns as soon as traffic resumes.

## Verify recovery

Latency should return to baseline within one to two sample windows of the
rollback completing. Hold the incident open until at least three consecutive
samples are inside the SLO for the affected service and everything downstream
of it.
