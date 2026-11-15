---
status: testing
phase: 66-task-project-templates
source: [66-VERIFICATION.md]
started: 2026-11-15T18:45:00Z
updated: 2026-11-15T18:45:00Z
---

## Current Test

number: 1
name: Editor visual polish (WR-01/02/04/06 paths)
expected: |
  Open the template editor in Settings, build a 3-level task tree, edit/delete a template, toggle FR — visually verify the drawer-style editor and offset column behave: deleting from inside the editor pops the editor (not an orphan "New template" stub), a failed save does not silently destroy the edited draft, the priority select shows and saves the same value, and Enter on an empty add-subtask input does not push a blank row.
awaiting: user response

## Tests

### 1. Editor visual polish (WR-01/02/04/06 paths)
expected: Open the template editor in Settings, build a 3-level task tree, edit/delete a template, toggle FR — visually verify the drawer-style editor and offset column behave: deleting from inside the editor pops the editor (not an orphan "New template" stub), a failed save does not silently destroy the edited draft, the priority select shows and saves the same value, and Enter on an empty add-subtask input does not push a blank row.
result: [pending]

### 2. Live FR rendering of template surfaces
expected: Switch the workspace language to FR — the "From template…" picker in both creation modals, the Settings templates section, and the "Save as template" context-menu action all render their FR strings (labels read from src/locales/fr.json, guillemets typography preserved).
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
