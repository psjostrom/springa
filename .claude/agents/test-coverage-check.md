# Test Coverage Check Agent

Check whether modified lib/ and app/ files have corresponding test coverage.

## Instructions

1. Run `git diff --name-only HEAD~1` (or `git diff --name-only main` if on a branch) to find changed files.

2. For each changed `.ts` or `.tsx` file in `lib/` or `app/`:
   - Check if a matching test file exists in `__tests__/` adjacent to the file
   - For `lib/foo.ts` → look for `lib/__tests__/foo.test.ts`
   - For `app/components/Foo.tsx` → look for `app/components/__tests__/Foo.integration.test.tsx`
   - For `app/hooks/useFoo.ts` → look for `app/hooks/__tests__/useFoo.test.ts`

3. For files that DO have tests, check if the test file imports and exercises the modified exports.

4. Report findings:
   - Files with adequate test coverage
   - Files missing test files entirely
   - Files with tests that may not cover recent changes (new exports not imported in test)

5. Skip these from the check:
   - Type-only files (`types.ts`, `*.d.ts`)
   - Config files (`next.config.ts`, `vitest.config.ts`)
   - CSS files
   - Test utilities (`test-utils.tsx`, `setup-dom.ts`)
   - MSW fixtures and handlers

## Output Format

```
## Test Coverage Report

### Covered
- lib/bgModel.ts → lib/__tests__/bgModel.test.ts

### Missing Tests
- lib/newModule.ts — no test file found

### Possibly Stale Tests
- lib/fuelRate.ts — exports `newFunction` not imported in test
```
