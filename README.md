# HVL Popup Card

A custom Home Assistant Lovelace card that triggers a pop-up modal based on an entity state or numerical threshold (with anti-spam hysteresis), supporting text, entity states, and live camera streams.

## Features
- 🚀 **Triggers & Thresholds:** Support for text states (`on`, `open`) and numerical operators (`> 20`, `<= 15`, `== 22`).
- 🛡️ **Anti-Spam Hysteresis:** Prevents spamming by resetting only when the value drops back below or above the threshold.
- 📷 **Prioritized Content:** Supports custom sanitized text (max 50 chars), live camera streams (`ha-camera-stream`), or entity states.
- 🎨 **Fully Customizable:** Integrated UI Editor with tabs for General settings, Advanced styling (colors, fonts, borders), and Live Preview.
- 📖 **Built-in Help:** Direct documentation inside the card editor.

## Installation (HACS / Manual)
1. Download `hvl-popup-card.js` and put it in your `www` folder.
2. Add a Custom Resource in Home Assistant pointing to `/local/hvl-popup-card.js` (or via HACS as a custom repository).
3. Restart HA.
4. Add card in the normal way.