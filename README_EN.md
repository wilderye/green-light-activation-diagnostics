[中文](./README.md) | **English**

# Green Light Activation Diagnostics

**You've set up a bunch of green-lit World Info entries — but did they actually fire, and how?**
This plugin answers that.

## What problem does it solve?

If you use World Info, you've probably run into these situations:

- Not sure where to check the full prompt to see if your green-lit entries actually triggered
- You know how to check the prompt, but digging through it to find specific entries is tedious — especially when you have a lot of them
- Can't figure out why a green-lit entry did or didn't trigger

Green Light Activation Diagnostics adds a button to the `More` menu on each AI reply. Click it and you'll see:

- ✅ **Which entries triggered and made it into the prompt** (what keyword matched, which message triggered it)
- ❌ **Which entries triggered but got blocked by rules** (probability didn't hit, got bumped by another entry in the same group, still on cooldown…)

Especially handy for character card authors with complex World Info setups.

## Installation

Go to SillyTavern's Extensions → Install Extension, and paste this URL:

```
https://github.com/wilderye/green-light-activation-diagnostics
```

Refresh the page after installing. That's it.

Version requirement: SillyTavern **1.15.0 or newer**. Version 1.14 and earlier do not expose the full World Info scan event required for this plugin's complete diagnostics.

## How to use

Open Extensions → Green Light Activation Diagnostics to find the toggle and related debug options.

Day-to-day usage:
1. Chat with the AI as usual
2. On any **AI reply**, open the `More` menu — you'll see a 🚦 button
3. Click it to open the diagnostics panel, which shows what happened with green-lit entries when that reply was generated

The panel is mobile-friendly.

## Notes

- **Your data stays local**: Diagnostics are stored in your browser only. Nothing is written to chat files or uploaded anywhere. Switching browsers or clearing cache will lose the records — this is intentional for automatic cleanup.
- **Auto-cleanup**: Records older than 7 days or exceeding 500 entries are automatically removed. You can also clear them manually in the settings panel.
- **Accuracy**: "Which entries were sent to the AI" is 100% accurate — it comes from SillyTavern's own events. "Why an entry wasn't sent" is the plugin's own analysis — accurate in most cases, but some edge-case rules may not be fully covered.

## License

This project is licensed under the [GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0-only).

## Author

荒行 · [GitHub](https://github.com/wilderye/green-light-activation-diagnostics)
