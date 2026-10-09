# REPOSITORY GOVERNANCE

This repository is governed by the AI Operating System.

MASTER OPERATING SYSTEM

C:\Users\loneb\Documents\AI-OPERATING-SYSTEM\MASTER-AI-OPERATING-SYSTEM.md

## REQUIRED STARTUP PROCEDURE

Before performing any work:

1. Read MASTER-AI-OPERATING-SYSTEM.md
2. Run repository preflight
3. Confirm:

   * Repository name
   * Repository owner
   * Lifecycle stage
   * Repository class
   * Current task
4. Read repository documentation
5. Produce implementation plan
6. Await approval for material changes
7. Implement approved plan
8. Run verification
9. Update documentation
10. Produce handover summary

Do not skip preflight.

Do not code before understanding the repository.

## REPOSITORY DOCUMENTS

Read before implementation:

docs/repository-map.md
docs/product-brief.md
docs/architecture.md
docs/workflow-map.md
docs/decision-log.md
docs/known-risks.md
docs/data-ownership.md
docs/production-readiness.md

If a required document is missing:

* Report it
* Create it from the AI Operating System templates
* Continue only after repository context is established

## SAFETY RULES

Stop immediately if:

* Repository is unclear
* Working directory is unclear
* Documentation conflicts with code
* Security controls must be bypassed
* A material architecture decision is required

Escalate to repository owner.

## HUMAN APPROVAL REQUIRED

AI agents must not:

* Approve their own work
* Approve releases
* Approve security exceptions
* Approve architecture changes
* Approve production deployment

Human approval is required.

## MEMORY RULE

Chat history is not a source of truth.

Durable facts must be written to repository documentation.

Before ending a session:

* Update decision-log.md if decisions were made
* Update known-risks.md if risks were discovered
* Update change-log.md if changes were implemented
* Update lessons learned if applicable
