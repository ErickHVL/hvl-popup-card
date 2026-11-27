# HVL Popup Card

A custom Home Assistant Lovelace card that triggers a pop-up modal based on an entity state or numerical threshold (with anti-spam hysteresis), supporting text, entity states, and live camera streams.

## What's New in v2.0.0

* **Inline Card Preview (`show_card_preview`):** Render a static, inline preview of the popup directly on your dashboard without triggering live button actions.
* **Live Visual Styling in Preview:** Displays the configured card background, text color, border radius, typography, content (text, entity state, or camera stream), and button grid.
* **Responsive Preview Layout:** Automatically centers the inline preview card and scales cleanly across desktop and narrower dashboard columns.

## Features

* **Flexible Triggers:** Open a popup automatically on a specific entity state or numerical threshold with built-in hysteresis to prevent repeated triggers.
* **Multiple Content Modes:** Display custom popup text, an entity's current translated state, or a live `<ha-camera-stream>` feed.
* **Inline Card Preview:** Toggle `show_card_preview` in the visual editor to inspect your popup styling directly on the dashboard.
* **Custom Action Buttons:** Includes a **Close** button plus up to two configurable additional entity actions (`additional_action_01` and `additional_action_02`).
* **Auto-Close Timer:** Optional countdown bar that automatically closes the modal after a set number of seconds.
* **Full Visual Editor:** Configure triggers, target entities, colors, typography, and preview visibility through the Home Assistant UI.

## Installation

### HACS (Custom Repository)
1. Open **HACS** in Home Assistant.
2. Go to **Frontend** → click the three dots in the top right → **Custom repositories**.
3. Add `https://github.com/ErickHVL/hvl-popup-card` with category **Dashboard** (or **Lovelace**).
4. Install **HVL Popup Card** and reload your browser.

### Manual
1. Download `hvl-popup-card.js` from the latest release.
2. Copy it to `/config/www/hvl-popup-card.js`.
3. Add `/local/hvl-popup-card.js` as a **JavaScript Module** under **Settings → Dashboards → Resources**.

## Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `type` | `string` | **Required** | `custom:hvl-popup-card` |
| `title` | `string` | `Title Popup` | Header title shown at the top of the popup and inline preview. |
| `trigger_entity` | `string` | Optional | Entity ID monitored to trigger the popup automatically. |
| `popup_entity` | `string` | Optional | Entity ID whose state or live camera stream (`camera.*`) is shown inside the popup. |
| `popup_text` | `string` | Optional | Custom text message (up to 250 characters). Overrides `popup_entity` when set. |
| `show_card_preview` | `boolean` | `false` | Displays a static, non-interactive inline preview of the popup card directly on the dashboard. |
| `additional_action_01` | `string` | Optional | Entity ID triggered by the first extra action button. |
| `button_text_action_01` | `string` | Friendly name | Custom label (max 15 characters) for the first extra action button. |
| `additional_action_02` | `string` | Optional | Entity ID triggered by the second extra action button. |
| `button_text_action_02` | `string` | Friendly name | Custom label (max 15 characters) for the second extra action button. |
| `auto_close` | `number` | `0` | Automatically closes the popup after *N* seconds (`0` disables auto-close). |
| `overlay_color` | `string` | `rgba(0, 0, 0, 0.75)` | Background color of the full-screen modal backdrop. |
| `bg_color` | `string` | `var(--card-background-color)` | Background color of the popup card and inline preview. |
| `text_color` | `string` | `var(--primary-text-color)` | Text color used for the title and body content. |
| `button_bg_color` | `string` | `var(--primary-color)` | Background color of the action buttons. |
| `button_text_color` | `string` | `#ffffff` | Text color of the action buttons. |
| `border_radius` | `string` | `14px` | Corner radius of the popup card and inline preview. |
| `font_family` | `string` | `inherit` | Custom CSS font family for the popup. |

## Example YAML

```yaml
type: custom:hvl-popup-card
title: Front Door Camera
trigger_entity: binary_sensor.front_door_contact
popup_entity: camera.front_door
show_card_preview: false
auto_close: 30
additional_action_01: script.unlock_front_door
button_text_action_01: Unlock
bg_color: "#1c1c1c"
text_color: "#ffffff"
button_bg_color: "#03a9f4"
button_text_color: "#ffffff"
border_radius: 14px