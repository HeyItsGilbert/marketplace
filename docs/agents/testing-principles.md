# Testing Principles

Load this reference when strategic testing guidance is needed. It is shared by the testing reviewers; tactical Pester usage remains in the Pester skills.

- Write the smallest set of tests that gives meaningful confidence. A test earns its maintenance cost by detecting a plausible regression.
- Test behavior through a public boundary rather than implementation details. A test name and failure should describe what a user or caller loses when it fails.
- Use the testing pyramid deliberately: fast isolated tests for focused logic, integration tests for component interactions, and a small number of acceptance tests for user-visible workflows.
- Keep each test legible as arrange, act, and assert. Isolate external dependencies without mocking the behavior under test.
- Include the relevant unhappy paths: errors, null or empty input, boundaries, permissions, and dependency failure. State intentional omissions rather than implying coverage.
- Treat coverage as diagnostic evidence, not proof of confidence. Prefer assertions that distinguish a working behavior from a plausible wrong implementation.
