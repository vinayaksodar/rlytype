# Issue 001: Add composition-aware input handling

## Summary

RlyType currently relies on global `keydown` events for typing input, which prevents proper support for IME/composition, dead keys, word deletion, and paste events.

## Expected Behavior

- Use composition and input events as the canonical source of text input.
- Respect `inputType` values for backspace and word deletion.
- Ignore intermediate composition updates and only commit finalized text.
- Handle pasted text as a batch of grapheme clusters.

## Notes

This aligns RlyType with modern browser input behavior (Monkeytype/Keybr-style) and improves compatibility across OS/IME setups.
