---
paths: ["**/*.test.tsx", "**/*.test.ts", "**/*.integration.test.tsx", "**/*.integration.test.ts"]
---

# Testing Guidelines

## Philosophy

- **Test user behavior, not code structure.** Users click buttons, read text, fill forms. Tests should do the same. Never assert on internal state, component instances, or hook return values. If the user can't see it or do it, don't test it.
- **Integration over unit.** Test components with real context — mock only the network boundary. A refactor should never break a test.
- **No mocks on business logic.** Test what the user sees after an action, not whether a callback was called.

## Structure

- **Flat tests, no nesting.** Avoid deeply nested `describe` blocks. Use setup functions instead of shared `beforeEach` state.
- **Each test is self-contained.** Arrange, act, assert — top to bottom. No scrolling to a `beforeEach` three levels up.
- **Prefer duplication over the wrong abstraction.** Three similar tests with inline setup beats a shared helper that hides what's being tested.
- **`beforeEach`/`afterEach` are for cleanup, not setup.** Restoring mocks, resetting spies — that's what hooks are for. Test-specific state belongs in the test.

## Queries (Testing Library)

Priority order — use the highest one that works:

1. **`getByRole`** — the default. Mirrors accessibility.
2. **`getByLabelText`** — for form fields.
3. **`getByPlaceholderText`** — fallback for unlabeled inputs.
4. **`getByText`** — for non-interactive content.
5. **`getByTestId`** — last resort.

Never use `container.querySelector()`.

## Common Mistakes

- Use `screen`, not destructured queries from `render()`.
- Use `userEvent` over `fireEvent`.
- Use `findBy*` for async elements, not `waitFor(() => getBy*)`.
- `query*` is only for asserting absence.
- Don't wrap `render` or `fireEvent` in `act()` — they handle it.
