
## 86-02
- [pre-existing, out of scope] test/locale-account.test.mjs "an unknown code is rejected with 400" still flakes under --test-concurrency=2 when run alongside test/locale-registry-fixture.test.mjs (the xx.json fixture window). Reproduced identically on the 86-02 base commit (05c66289) in a throwaway worktree — NOT introduced by this plan. The fixture suite's tmpdir lockfile mutex narrows but does not close the race.
