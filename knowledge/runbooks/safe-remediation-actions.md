---
title: Runbook - Approved Remediation Actions
type: runbook
service:
tags: [remediation, approval, safety, actions]
---

# Runbook: Approved Remediation Actions

Only the actions in this catalogue may be executed against the platform. Each
one is a parameterised operation with a known blast radius and a defined
rollback. Free-form commands are not permitted under any circumstances.

## Catalogue

### rollback_deployment

Parameters: service. Reverts the named service to its previous released
artifact. Correct response to a regression introduced by a release. Risk:
medium. Rollback: redeploy the newer version once a fix exists.

### revert_config

Parameters: service, key. Restores the previous value of a single configuration
key. Correct response to a bad configuration change, and preferred over a binary
rollback when only configuration changed. Risk: low. Rollback: re-apply the new
value.

### increase_connection_pool

Parameters: service, max_connections. Raises the connection ceiling on a
datastore. Correct response to connection exhaustion. Risk: medium - a very
large increase can push memory pressure onto the database. Rollback: restore the
previous ceiling during a maintenance window.

### scale_out

Parameters: service, replicas. Adds replicas. Appropriate for genuine demand
saturation. Not appropriate for code regressions or for services queued behind
an exhausted datastore pool, where it makes matters worse. Risk: low.

### restart_service

Parameters: service. Restarts replicas in a rolling fashion. Only useful for
transient in-process state such as a leaked resource or a wedged worker. It does
not fix anything present in the deployed artifact or in configuration. Risk:
low.

### enable_circuit_breaker

Parameters: service, dependency. Sheds calls to a failing dependency to protect
the caller. A blast-radius mitigation, not a resolution. Risk: low.

## Approval

Every action requires explicit human approval before execution. Aegis proposes
exactly one action per incident, records the rationale and the evidence it
rests on, and waits. Nothing executes without an approval recorded against a
named operator.

## After execution

Recovery is verified deterministically, not by asking a model whether the fix
worked: the affected service and everything downstream of it must be inside
their SLOs for three consecutive sample windows.
