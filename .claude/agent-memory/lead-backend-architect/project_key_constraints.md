---
name: Euphoria Critical Architectural Constraints
description: Non-negotiable design constraints for the Euphoria backend — correctness, security, and scale properties
type: project
---

These constraints are load-bearing decisions that shape many downstream choices:

1. **Wallet uses row-level locking (FOR UPDATE), never optimistic concurrency.** IAP real money is behind coins — negative balance exploits are unacceptable. Correctness > performance.

2. **Correct answers are never in the client's hands until after submission window closes.** Answers are AES-256 encrypted at rest in the DB; decryption key is in Secrets Manager, fetched at show start. The client sees plaintext correct answer only in the round_result event (after round ends).

3. **Server-side timestamps are authoritative for response time.** Client-reported `client_ts` is stored for anti-cheat comparison but never used as the authoritative submission time. `response_time_ms = server_receipt_time - round.started_at`.

4. **Show Orchestrator: one isolated pod per active show.** Blast radius isolation — a buggy show cannot affect another. Pod anti-affinity rules enforce separate nodes.

5. **All wallet mutations require an idempotency key.** Idempotency keys follow the pattern `{type}:{referenceId}:{userId}`. Double-processing results in returning the existing transaction, never a duplicate debit/credit.

6. **IAP receipt validation is always server-to-server.** Never trust client-reported purchase completion.

7. **Deployments to Show WS Gateway and Show Orchestrator are blocked within 30 min of a scheduled show.** Enforced by CI/CD gate.

**How to apply:** Any new feature touching wallet, answer submission, or show lifecycle must respect these constraints. Exceptions require CPO + lead architect sign-off.
