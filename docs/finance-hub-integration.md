# Finance HUB integration

New fill-ups can create an expense in the owner's private Finance HUB. The final mileage step offers Готівка (default), BoursoBank, Укрсиб and an opt-out checkbox. Укрсиб adds a fifth step for the actual UAH debit. Fuel history always keeps EUR; Finance HUB receives native UAH plus the known EUR purchase cost. No exchange rate is inferred.

## Runtime configuration

Set `FINANCE_HUB_SERVICE_TOKEN` as a **secret** in Sites runtime environment configuration. Obtain it through supported owner-private Sites service access for the fixed Finance HUB project. Never put the value in source, local screenshots, logs, browser storage or a public environment variable. The fixed destination is `https://finance-hub-sviat.opryshkosm.chatgpt.site/api/finance`; redirects are rejected. Both Sites must remain owner-private. Changing either audience requires an authorization review.

Publishing applies the schema-only `0002_clean_iron_man.sql` migration. It creates `finance_exports`; it does not alter or backfill existing fuel rows. No existing fill-ups are exported automatically. No scheduled task or new dependency is needed.

## Delivery and recovery

- The browser generates a stable UUID for each new form. Fuel creation retries with the same ID do not create another fuel row. Replaying that ID with changed input returns 409.
- D1 atomically saves the fill-up and immutable export intent. Finance HUB uses `fuel-log:<fuel UUID>` as the expense ID.
- Delivery reads the current Finance HUB revision, validates the selected account/category and submits `transaction.save`. CAS conflicts get at most three attempts within a shared ten-second timeout.
- Success requires a matching confirmed transaction. A lost response stays pending. On an explicit retry, an existing matching transaction confirms success without another POST.
- A different, manually changed or voided transaction with that ID is preserved and reported as a conflict. The app never overwrites it.
- Pending status and **Повторити передачу** are available when editing the fill-up. No automatic offline mutation replay is added. A Finance HUB outage does not discard the fuel entry.
- Fuel edits/deletion do not edit/delete the linked financial transaction. The edit form explains that financial changes must be made in Finance HUB. Export intents survive fuel deletion for reconciliation/auditing.
- ID protection covers network retries. A later bank-statement import could represent the same real purchase under a different ID; review such imports in Finance HUB.

## Validation

`node --test tests/finance-export.test.mjs tests/pwa.test.mjs tests/service.test.mjs tests/service-cache.test.mjs`

Transport tests use in-memory fixtures and cover EUR/UAH amounts, lost responses, duplicate prevention, concurrent revisions, changed remote records, authentication errors and missing confirmation. Browser QA exercises the real local D1-backed form, conditional fifth step, validation, pending/retry status, duplicate creation protection, existing edits and offline behavior. No sample transaction is written to the real financial ledger.
