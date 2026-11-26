/*
 * PopUp Card for Home Assistant
 *
 * A custom Home Assistant Lovelace card that triggers a pop-up modal based on 
 * an entity state or numerical threshold (with anti-spam hysteresis), 
 * supporting text, entity states, and live camera streams.
 * 
 * type: custom:hvl-popup-card
 *
 * https://github.com/ErickHVL/hvl-popup-card
 */

const CARD_VERSION = '2.0.0';
import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit@3.1.2/index.js?module";

// ==========================================
// CHAPTER 1: REGISTRATION IN HOME ASSISTANT
// ==========================================
window.customCards = window.customCards || [];
window.customCards.push({
  type: "hvl-popup-card",
  name: "HVL Popup Card",
  preview: true,
  description: "Displays a pop-up with live status or a camera stream upon a specific state change.",
});

function sanitizeAndTruncateText(text, maxLength = 150) {
  if (!text) return "";
  const plainText = String(text).replace(/<\/?[^>]+(>|$)/g, "");

  if (plainText.length <= maxLength) {
    return plainText;
  }
  return plainText.slice(0, maxLength).trim() + "...";
}

// ==========================================
// CHAPTER 2: THE CARD CLASS
// ==========================================
class HvlPopupCard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      _showPopup: { type: Boolean, reflect: true, attribute: 'popup-active' },
    };
  }

  constructor() {
    super();
    this._showPopup = false;
    this._previousState = undefined;
    this._hasTriggered = false;
    this._closeTimestamp = 0;
    this._checkTimerInterval = null;
  }

  static getConfigElement() {
    return document.createElement("hvl-popup-card-editor");
  }

  static getStubConfig() {
    return {
      title: "Title Popup",
      trigger_entity: "",
      target_state: "open",
      auto_close: 10,
      overlay_color: "rgba(0, 0, 0, 0.75)",
      bg_color: "var(--card-background-color, #ffffff)",
      text_color: "var(--primary-text-color, #000000)",
      font_family: "inherit",
      border_radius: "14px",
      button_bg_color: "var(--primary-color, #03a9f4)",
      button_txt_color: "#ffffff",
    };
  }
  
  _runAction(entityId) {
    if (!this.hass || !entityId) return;
    const domain = entityId.split(".")[0];

    if (domain === "script") {
      // Scripts aanroepen via script.turn_on
      this.hass.callService("script", "turn_on", { entity_id: entityId });
    } else if (domain === "input_button") {
      // Input buttons gebruiken hun eigen domein
      this.hass.callService("input_button", "press", { entity_id: entityId });
    } else if (domain === "button") {
      // Fysieke / integratie buttons
      this.hass.callService("button", "press", { entity_id: entityId });
    } else {
      // Werkt prima voor input_boolean, switch, light, automation, etc.
      this.hass.callService("homeassistant", "toggle", { entity_id: entityId });
    }
  }

  static get styles() {
    return css`
      :host {
        display: none !important;
      }

      :host-context(.edit-mode),
      :host([edit-mode]),
      .edit-mode :host,
      :host([popup-active]) {
        display: block !important;
      }

      .edit-placeholder {
        display: none;
        padding: 12px;
        background: var(--card-background-color, #ffffff);
        border: 2px dashed var(--divider-color, #ccc);
        border-radius: 8px;
        text-align: center;
        color: var(--secondary-text-color, #666666);
        font-size: 0.85em;
        font-weight: bold;
      }

      :host-context(.edit-mode) .edit-placeholder,
      :host([edit-mode]) .edit-placeholder,
      .edit-mode .edit-placeholder {
        display: block;
      }

      .test-btn {
        margin-top: 8px;
        background: var(--primary-color, #03a9f4);
        color: #fff;
        border: none;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8em;
      }

      /* Animation for the auto-close progress bar */
      @keyframes shrinkBar {
        from {
          width: 100%;
        }
        to {
          width: 0%;
        }
      }

      .countdown-bar-container {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 4px;
        background: rgba(0, 0, 0, 0.1);
        border-bottom-left-radius: var(--card-border-radius, 14px);
        border-bottom-right-radius: var(--card-border-radius, 14px);
        overflow: hidden;
      }

      .countdown-bar {
        height: 100%;
        background: var(--primary-color, #03a9f4);
        width: 100%;
        animation-name: shrinkBar;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
      }
      
      .button-section {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px;
        margin-bottom: 10px;
        margin-top: 10px;
        text-align: center;
        height: 120%;
        Padding: 2px;
        background-color: transparent;
      }
      
      .action-button {
        background: var(--primary-color, #03a9f4);
        color: #ffffff;
        border: none;
        padding: 5px 24px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        font-size: 1em;
        margin-top: 8px;
        display: flex;
        min-height: 50px;
        align-items: center;
        justify-content: center;
      }
      
      .camera-container {
        margin: 16px 0;
        border-radius: 8px;
        overflow: hidden;
        background: #000;
        contain: content;
        max-height: 55vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .camera-container ha-camera-stream {
        width: 100%;
        max-height: 55vh;
        display: block;
        object-fit: contain;
      }
      
      .popup-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 99999;
        backdrop-filter: blur(4px);
        padding: 16px;
        box-sizing: border-box;
      }

      .popup-modal {
        position: relative;
        padding: 24px;
        width: 90%;
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
        text-align: center;
        box-sizing: border-box;
        word-break: break-word;
      }

      .popup-modal--camera {
        max-width: 720px;
      }

      .popup-modal--default {
        max-width: 480px;
      }

      .popup-title {
        margin-top: 0;
        font-size: 1.4em;
        word-break: break-word;
      }

      .popup-text {
        opacity: 0.9;
        margin: 16px 0;
        font-size: 1.1em;
        line-height: 1.5;
        word-break: break-word;
      }

      .popup-status {
        opacity: 0.85;
        line-height: 1.5;
        margin: 20px 0;
        word-break: break-word;
      }

      .popup-status-value {
        font-size: 1.3em;
        font-weight: bold;
        display: inline-block;
        margin-top: 8px;
        word-break: break-word;
      }
    `;
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Invalid configuration.");
    }
    this.config = {
      title: "State Changed",
      trigger_entity: "",
      popup_entity: "",
      additional_action_01: "",
      buttonTextAdd01: "second button",
      buttonTextAdd02: "third button",
      trigger: "",
      auto_close: 0,
      overlay_color: "rgba(0, 0, 0, 0.75)",
      bg_color: "var(--card-background-color, #ffffff)",
      text_color: "var(--primary-text-color, #000000)",
      button_bg_color: "var(--primary-color, #03a9f4)",
      button_txt_color: "#ffffff",
      font_family: "inherit",
      border_radius: "14px",
      ...config,
    };

    // Reset trigger-state bij een nieuwe/gewijzigde configuratie
    this._previousState = undefined;
    this._hasTriggered = false;
  }

  getCardSize() {
    return 0;
  }

  _normalizeState(state) {
    if (state === null || state === undefined) return "";
    
    const str = String(state).trim().toLowerCase();

    if (["on", "open", "opened", "aan", "active", "true", "home", "thuis"].includes(str)) {
      return "on";
    }

    if (["off", "close", "closed", "dicht", "uit", "inactive", "false", "not_home", "afwezig"].includes(str)) {
      return "off";
    }

    return str;
  }

  _getTranslatedState(entityObj) {
    if (!entityObj) return "Unknown";
    
    if (this.hass && typeof this.hass.formatEntityState === "function") {
      return this.hass.formatEntityState(entityObj);
    }

    const state = entityObj.state;
    const translations = {
      on: "On",
      off: "Off",
      open: "Open",
      closed: "Closed",
      home: "Home",
      not_home: "Away",
      unavailable: "Unavailable",
      unknown: "Unknown"
    };

    return translations[state?.toLowerCase()] || state;
  }
  
  _getConfigValue(key, defaultValue = null) {
    if (!this.config) return defaultValue;
    if (this.config[key] !== undefined) return this.config[key];

    for (const group of Object.values(this.config)) {
      if (typeof group === 'object' && group !== null && group[key] !== undefined) {
        return group[key];
      }
    }
    return defaultValue;
  }
  
  _clampNumber(value, min, max, fallback = min) {
    const num = Number(value);
    if (value === "" || value === null || value === undefined || Number.isNaN(num)) {
      return fallback;
    }
    return Math.min(Math.max(num, min), max);
  }
  
  _evaluateTrigger(state, configTrigger) {
    if (!configTrigger) return true;
    const clean = String(configTrigger).trim();
    
    const match = clean.match(/^(>|<|>=|<=|==|!=)?\s*(-?\d+(?:\.\d+)?)$/);
    if (match) {
      const op = match[1] || ">";
      const threshold = parseFloat(match[2]);
      const val = parseFloat(state);
      
      if (isNaN(val) || isNaN(threshold)) return false;
      
      switch (op) {
        case '>': return val > threshold;
        case '<': return val < threshold;
        case '>=': return val >= threshold;
        case '<=': return val <= threshold;
        case '==': return val === threshold;
        case '!=': return val !== threshold;
        default: return val > threshold;
      }
    }
    
    return this._normalizeState(state) === this._normalizeState(clean);
  }

  willUpdate(changedProperties) {
    if (!changedProperties.has("hass") && !changedProperties.has("config")) {
      return;
    }
    if (!this.hass || !this.config?.trigger_entity) return;

    const triggerEntityId = this.config.trigger_entity;
    const stateObj = this.hass.states[triggerEntityId];
    if (!stateObj) return;

    const currentState = stateObj.state;
    const targetRaw = (this.config.trigger || "").trim();

    if (this._previousState === undefined) {
      this._previousState = currentState;
      this._hasTriggered = targetRaw
        ? this._evaluateTrigger(currentState, targetRaw)
        : false;
      return;
    }

    if (currentState !== this._previousState) {
      this._previousState = currentState;

      if (!targetRaw) {
        this.triggerPopup();
        return;
      }

      const isSatisfied = this._evaluateTrigger(currentState, targetRaw);
      if (isSatisfied) {
        if (!this._hasTriggered) {
          this._hasTriggered = true;
          this.triggerPopup();
        }
      } else {
        this._hasTriggered = false;
      }
    }
  }

  _getAutoCloseSeconds() {
    const rawAutoClose = this._getConfigValue("auto_close", 0);
    const parsed = parseInt(rawAutoClose, 10);
    if (isNaN(parsed) || parsed <= 0) return 0;
    return Math.floor(this._clampNumber(rawAutoClose, 0, 120, 0));
  }

  triggerPopup() {
    this._showPopup = true;

    if (this._checkTimerInterval) {
      clearInterval(this._checkTimerInterval);
      this._checkTimerInterval = null;
    }

    const timeoutSec = this._getAutoCloseSeconds();
    if (timeoutSec > 0) {
      this._closeTimestamp = Date.now() + timeoutSec * 1000;

      this._checkTimerInterval = setInterval(() => {
        if (Date.now() >= this._closeTimestamp) {
          this.closePopup();
        }
      }, 250);
    }
  }

  closePopup() {
    if (this._checkTimerInterval) {
      clearInterval(this._checkTimerInterval);
      this._checkTimerInterval = null;
    }
    this._showPopup = false;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._checkTimerInterval) {
      clearInterval(this._checkTimerInterval);
      this._checkTimerInterval = null;
    }
  }

  render() {
    const editPlaceholder = html`
      <div class="edit-placeholder">
        🔔 <strong>${this.config.title || 'HVL Popup'}</strong><br />
        <small>(${this.config.trigger_entity || 'No trigger selected'})</small><br />
        <button class="test-btn" @click=${() => this.triggerPopup()}>
          Example button
        </button>
      </div>
    `;

    let popupHtml = html``;
    if (this._showPopup) {
      const TriggerEntityId = this._getConfigValue("trigger_entity");
      const TargetEntityId = this._getConfigValue("popup_entity");
      const Additional_action01_Id = this._getConfigValue("additional_action_01");
      const Additional_action02_Id = this._getConfigValue("additional_action_02");
      const popupTextRaw = this.config.popup_text ? this.config.popup_text.trim() : "";
      const popupText = sanitizeAndTruncateText(popupTextRaw, 250);
      
      const isCamera = TargetEntityId && TargetEntityId.startsWith("camera.") && !popupText;
      //const autoCloseSec = parseInt(this.config.auto_close, 10) || 0;
      const autoCloseSec = this._getAutoCloseSeconds();

      const overlayBg = this.config.overlay_color || "rgba(0, 0, 0, 0.75)";
      const cardBg = this.config.bg_color || "var(--card-background-color, #ffffff)";
      const textColor = this.config.text_color || "var(--primary-text-color, #000000)";
      const fontFamily = this.config.font_family || "inherit";
      const borderRadius = this.config.border_radius || "14px";
      const buttonBgColor = this.config.button_bg_color || "var(--primary-color, #03a9f4)";
      const buttonTxtColor = this.config.button_text_color || "#ffffff";
      
      const buttonTextAddO1Raw = this.config.button_text_action_01 || "";
      let buttonTextAddO1 = sanitizeAndTruncateText(buttonTextAddO1Raw, 15);
      
      const buttonTextAddO2Raw = this.config.button_text_action_02 || "";
      let buttonTextAddO2 = sanitizeAndTruncateText(buttonTextAddO2Raw, 15);
      
      const TriggerEntityObj = TriggerEntityId ? this.hass.states[TriggerEntityId] : null;
      const TargetEntityObj = TargetEntityId ? this.hass.states[TargetEntityId] : null;
      const Additional_action01_Obj = Additional_action01_Id ? this.hass.states[Additional_action01_Id] : null
      const Additional_action02_Obj = Additional_action02_Id ? this.hass.states[Additional_action02_Id] : null
      
      const friendlyNameAdd01 = Additional_action01_Obj?.attributes?.friendly_name || Additional_action01_Id;
      const friendlyNameAdd02 = Additional_action02_Obj?.attributes?.friendly_name || Additional_action02_Id;
      
      if(buttonTextAddO1 == " "){ 
        buttonTextAddO1 = friendlyNameAdd01};
      
      if(buttonTextAddO2 == " "){ 
        buttonTextAddO2 = friendlyNameAdd02}; 
        
      let repeat_frames = 1;
      if(Additional_action01_Id){
        repeat_frames = repeat_frames + 1};
        
      if(Additional_action02_Id){
        repeat_frames = repeat_frames + 1};   

      let contentHtml = html``;

      if (popupText) {
        contentHtml = html`
          <p class="popup-text" style="color: ${textColor};">
            ${popupText}
          </p>
        `;
      } else if (TargetEntityId) {
        if (isCamera) {
          contentHtml = html`
            <div class="camera-container">
              <ha-camera-stream
                .hass=${this.hass}
                .stateObj=${TargetEntityObj}
                streamType="live"
              ></ha-camera-stream>
            </div>
          `;
        } else {
          const friendlyName = TargetEntityObj?.attributes?.friendly_name || TargetEntityId;
          const currentValue = this._getTranslatedState(TargetEntityObj);
          contentHtml = html`
            <p class="popup-status" style="color: ${textColor};">
              Status of <strong>${friendlyName}</strong>:
              <br />
              <span class="popup-status-value" style="color: ${textColor};">
                ${currentValue}
              </span>
            </p>
          `;
        }
      } else {
        const friendlyName = TriggerEntityObj?.attributes?.friendly_name || TriggerEntityId || "Trigger";
        const currentValue = this._getTranslatedState(TriggerEntityObj);
        contentHtml = html`
          <p class="popup-status" style="color: ${textColor};">
            Status of <strong>${friendlyName}</strong>:
            <br />
            <span class="popup-status-value" style="color: var(--primary-color, #03a9f4);">
              ${currentValue}
            </span>
          </p>
        `;
      }

      popupHtml = html`
        <div
          class="popup-backdrop"
          style="
            background: ${overlayBg};
            font-family: ${fontFamily};
          "
          @click=${() => this.closePopup()}
        >
          <div
            class="popup-modal ${isCamera ? 'popup-modal--camera' : 'popup-modal--default'}"
            style="
              background: ${cardBg};
              color: ${textColor};
              border-radius: ${borderRadius};
              --card-border-radius: ${borderRadius};
            "
            @click=${(e) => e.stopPropagation()}
          >
            <h3 class="popup-title" style="color: ${textColor};">
              ${this.config.title}
            </h3>

            ${contentHtml}
            <div class="button-section" 
            style="
                  grid-template-columns: repeat(${repeat_frames}, 1fr);
                  margin-bottom: ${autoCloseSec > 0 ? '6px' : '0px'};
                  ">
              <button class="action-button" style="
                background-color: ${buttonBgColor} !important;
                color: ${buttonTxtColor}"
                @click=${() => this.closePopup()}
              >
                Close
              </button>
              ${Additional_action01_Id ? 
                html`
                <button class="action-button" style="
                  background-color: ${buttonBgColor} !important;
                  color: ${buttonTxtColor}"
                  ?disabled=${!Additional_action01_Id}
                  @click="${() => this._runAction(Additional_action01_Id)}"
                >
                  ${buttonTextAddO1}
                </button>
              ` : ''}
              ${Additional_action02_Id ? 
                html`
                <button class="action-button" style="
                  background-color: ${buttonBgColor} !important;
                  color: ${buttonTxtColor}"
                  ?disabled=${!Additional_action02_Id}
                  @click="${() => this._runAction(Additional_action02_Id)}"
                >
                  ${buttonTextAddO2}
                </button>
              ` : ''}  
            </div>
            
            ${autoCloseSec > 0 ? html`
              <div class="countdown-bar-container">
                <div class="countdown-bar" style="animation-duration: ${autoCloseSec}s;"></div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    return html`
      ${editPlaceholder}${popupHtml}
    `;
  }
}

// ==========================================
// CHAPTER 3: THE UI-EDITOR CLASS
// ==========================================
class HvlPopupCardEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      _config: { type: Object },
      _activeTab: { type: String },
    };
  }

  constructor() {
    super();
    this._activeTab = "general";
    this._sliderObserver = null;
  }

  _findElementDeep(id, root = document) {
    if (!root) return null;

    const elements = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (const el of elements) {
      if (el.id === id) return el;
      if (el.shadowRoot) {
        const found = this._findElementDeep(id, el.shadowRoot);
        if (found) return found;
      }
    }

    return null;
  }

  _attachSliderClass() {
    const slider =
      this._findElementDeep("slider", this.renderRoot) ||
      this._findElementDeep("slider", document);

    if (!slider) return false;
    
    if (!slider.classList.contains("add_padding")) {
      slider.classList.add("add_padding");
    }

    slider.style.setProperty("padding", "10px", "important");
    return true;
  }

  _watchForSlider() {
    if (this._attachSliderClass() || this._sliderObserver) return;

    this._sliderObserver = new MutationObserver(() => {
      if (this._attachSliderClass()) {
        this._sliderObserver.disconnect();
        this._sliderObserver = null;
      }
    });

    this._sliderObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    this._watchForSlider();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._sliderObserver) {
      this._sliderObserver.disconnect();
      this._sliderObserver = null;
    }
  }

  setConfig(config) {
    this._config = config;
  }

  _getGeneralSchema() {
    return [
      {
        name: "title",
        label: "Popup title",
        selector: { text: {} },
      },
      {
        name: "popup_entity",
        label: "Popup: common entity / camera entity",
        selector: { entity: {} },
      },
      {
        name: "trigger_entity",
        label: "Trigger entity",
        selector: { entity: {} },
      },
      {
        name: "trigger",
        label: "Trigger state condition (e.g. 'off', 'open', '> 20')",
        selector: { text: {} },
      },
      {
        name: "popup_text",
        label: "Popup text (max. characters = 150)",
        selector: { text: {} },
      },
      {
        name: "auto_close",
        label: "Auto-close after X seconds (0 = disabled, 120 = max.)",
        selector: { number: { min: 0, max: 120, unit_of_measurement: "sec" } },
      },
    ];
  }

  _getAdvancedSchema() {
    return [
      {
        name: "overlay_color",
        label: "Backdrop Background Color (e.g. rgba(0,0,0,0.75))",
        selector: { text: {} },
      },
      {
        name: "bg_color",
        label: "Popup Background Color (CSS color or var(...))",
        selector: { text: {} },
      },
      {
        name: "text_color",
        label: "Popup Text Color (CSS color or var(...))",
        selector: { text: {} },
      },
      {
        name: "font_family",
        label: "Font Family",
        selector: {
          select: {
            options: [
              { value: "Arial, sans-serif", label: "Arial" },
              { value: "Helvetica, sans-serif", label: "Helvetica" },
              { value: "Verdana, sans-serif", label: "Verdana" },
              { value: "Trebuchet MS, sans-serif", label: "Trebuchet MS" },
              { value: "Tahoma, sans-serif", label: "Tahoma" }
            ],
            mode: "dropdown"
          }
        }
      },
      {
        name: "button_bg_color",
        label: "Button Background Color (CSS color or var(...))",
        selector: { text: {} },
      },
      {
        name: "button_text_color",
        label: "Button Text Color (CSS color or var(...))",
        selector: { text: {} },
      },
      {
        name: "border_radius",
        label: "Corner Border Radius (e.g. '14px' or '0px')",
        selector: { text: {} },
      },
    ];
  }
  
   _getAdditonalSchema() {
    return [
      {
        name: "additional_action_01",
        label: "Additional action 1",
        selector: { entity: { domain: ["button", "input_button", "switch", "script", "input_boolean"] } },
      },
      {
        name: "button_text_action_01",
        label: "Button text (leave empty for friendly name)",
        selector: { text: {} },
      },
      {
        name: "additional_action_02",
        label: "Additional action 2",
        selector: { entity: { domain: ["button", "input_button", "switch", "script", "input_boolean"] } },
      },
      {
        name: "button_text_action_02",
        label: "Button text (leave empty for friendly name)",
        selector: { text: {} },
      },
    ];
  }
   

  static get styles() {
    return css`
      .tabs {
        display: flex;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        margin-bottom: 16px;
      }

      .tab {
        padding: 10px 16px;
        cursor: pointer;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        font-weight: 500;
        color: var(--secondary-text-color, #666);
        font-size: 0.95em;
        outline: none;
        transition: all 0.2s ease-in-out;
      }

      .tab.active {
        border-bottom-color: var(--primary-color, #03a9f4);
        color: var(--primary-color, #03a9f4);
        font-weight: bold;
      }

      .tab:hover {
        color: var(--primary-text-color, #000);
      }

      ha-form {
        display: block;
      }

      .preview-container {
        margin-top: 20px;
        border: 1px solid var(--divider-color, #ccc);
        border-radius: 8px;
        padding: 12px;
        background: var(--card-background-color, #fafafa);
      }

      .preview-title {
        font-size: 0.85em;
        font-weight: bold;
        color: var(--secondary-text-color, #666);
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .preview-viewport {
        position: relative;
        height: 300px;
        border-radius: 6px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px dashed var(--divider-color, #ccc);
      }

      .preview-card {
        padding: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        text-align: center;
        width: 80%;
        max-width: 260px;
        box-sizing: border-box;
      }
      
      .preview-action-button{
        font-size: 0.7em; 
        padding: 3px 8px; 
        border-radius: 4px; 
        display: flex; 
        min-height: 25px;
        align-items: center;
        justify-content: center;
      }
      
    `;
  }

  render() {
    if (!this.hass || !this._config) return html``;

    const overlayBg = this._config.overlay_color || "rgba(0, 0, 0, 0.75)";
    const cardBg = this._config.bg_color || "var(--card-background-color, #ffffff)";
    const textColor = this._config.text_color || "var(--primary-text-color, #000000)";
    const fontFamily = this._config.font_family || "inherit";
    const borderRadius = this._config.border_radius || "14px";
    const buttonBgColor = this._config.button_bg_color || "var(--primary-color, #03a9f4)";
    const buttonTxtColor = this._config.button_text_color || "#ffffff";

    const previewEntityId = this._config.popup_entity || this._config.trigger_entity;
    const previewEntityObj = previewEntityId ? this.hass.states[previewEntityId] : null;
    const previewFriendlyName = previewEntityObj?.attributes?.friendly_name || previewEntityId || "Sample Entity";
    const isCameraEntity = previewEntityId && previewEntityId.startsWith("camera.");
    const Additional_action01_Id = this._config.additional_action_01;
    const Additional_action02_Id = this._config.additional_action_02;
    
    const buttonTextAdd01Raw = this._config.button_text_action_01|| "";
    let buttonTextAdd01 = sanitizeAndTruncateText(buttonTextAdd01Raw, 15);
    
    const buttonTextAdd02Raw = this._config.button_text_action_02 || "";
    let buttonTextAdd02 = sanitizeAndTruncateText(buttonTextAdd02Raw, 15);
    
    const Additional_action01_Obj = Additional_action01_Id ? this.hass.states[Additional_action01_Id] : null
    const Additional_action02_Obj = Additional_action02_Id ? this.hass.states[Additional_action02_Id] : null
    
    const friendlyNameAdd01 = Additional_action01_Obj?.attributes?.friendly_name || Additional_action01_Id;
    const friendlyNameAdd02 = Additional_action02_Obj?.attributes?.friendly_name || Additional_action02_Id;
    
    if(buttonTextAdd01 == ""){ 
      buttonTextAdd01 = friendlyNameAdd01};
    
    if(buttonTextAdd02 == ""){ 
      buttonTextAddO02 = friendlyNameAdd02}; 
      
    let repeat_frames = 1;
    if(Additional_action01_Id){
      repeat_frames = repeat_frames + 1};
      
    if(Additional_action02_Id){
      repeat_frames = repeat_frames + 1};
    
    let previewStatusText = "OPEN";
    if (this._config.popup_text) {
      previewStatusText = this._config.popup_text;
    } else if (previewEntityObj) {
      const translations = { on: "On", off: "Off", open: "Open", closed: "Closed", home: "Home", not_home: "Away" };
      previewStatusText = translations[previewEntityObj.state?.toLowerCase()] || previewEntityObj.state;
    } 
    
    if (isCameraEntity){
      previewStatusText = "Camera view";
    }

    let tabContent = html``;

    if (this._activeTab === "general") {
      tabContent = html`
        <ha-form
          .hass=${this.hass}
          .data=${this._config}
          .schema=${this._getGeneralSchema()}
          .computeLabel=${(schema) => schema.label}
          @value-changed=${this._valueChanged}
        ></ha-form>
      `;
    } else if (this._activeTab === "advanced") {
      tabContent = html`
        <ha-form
          .hass=${this.hass}
          .data=${this._config}
          .schema=${this._getAdvancedSchema()}
          .computeLabel=${(schema) => schema.label}
          @value-changed=${this._valueChanged}
        ></ha-form>

        <div class="preview-container">
          <div class="preview-title">Live Preview Viewport</div>
          <div 
            class="preview-viewport" 
            style="background: ${overlayBg}; font-family:${fontFamily};"
          >
            <div 
              class="preview-card"
              style="background: ${cardBg}; color: ${textColor}; border-radius: ${borderRadius};"
            >
              <div style="font-weight: bold; font-size: 0.9em; color: ${textColor}; word-break: break-word;">
                ${this._config.title || 'Sample Title'}
              </div>
              
              ${isCameraEntity ? html`
              <div style="margin: 16px 0; border-radius: 8px; overflow: hidden; background: #000; contain: content;">
                <ha-camera-stream
                  .hass=${this.hass}
                  .stateObj=${previewEntityObj}
                  streamType="live"
                ></ha-camera-stream>
              </div>
              ` : html`
              <div style="font-size: 0.75em; opacity: 0.8; margin: 8px 0; word-break: break-word;">
                ${previewEntityId ? html`Status of <strong>${previewFriendlyName}</strong>:` : 'Status:'}
                <br>
                <span style="color: ${textColor}; font-weight: bold; font-size: 1.1em;">
                  ${previewStatusText}
                </span>
              </div>
              ` } 
              <div class="preview-button-container" style="
                display: grid;
                grid-template-columns: repeat(${repeat_frames}, 1fr);
                align-items: center;
                gap: 6px;
                color: ${buttonTxtColor};
                margin-bottom: 10px;
                margin-top: 10px;
                text-align: center;
                height: 120%;
                Padding: 2px;
                background-color: transparent;">
                <div class="preview-action-button" 
                  style="background: ${buttonBgColor};">
                    Close
                </div>
                ${Additional_action01_Id ? html`
                <div class="preview-action-button" 
                  style="background: ${buttonBgColor};">
                    ${buttonTextAdd01}
                </div>
                ` : ''}
                 ${Additional_action02_Id ? html`
                <div class="preview-action-button" 
                  style="background: ${buttonBgColor};">
                    ${buttonTextAdd02}
                </div>
                ` : ''}    
               </div> 
            </div>
          </div>
        </div>
      `;
    } else if (this._activeTab === "additional") {
      tabContent = html`
        <ha-form
          .hass=${this.hass}
          .data=${this._config}
          .schema=${this._getAdditonalSchema()}
          .computeLabel=${(schema) => schema.label}
          @value-changed=${this._valueChanged}
        ></ha-form>  
      `;  
    } else if (this._activeTab === "help") {
      tabContent = html`
        <div style="font-size: 0.9em; line-height: 1.6; color: var(--primary-text-color, #333); padding: 4px;">
          <h4 style="margin-top: 0; color: var(--primary-color, #03a9f4);">📖 HVL Popup Card Documentation</h4>
          
          <p><strong>1. Triggers & Thresholds:</strong><br>
          • <em>Text (e.g. on, off, open):</em> Triggers on state change.<br>
          • <em>Numbers (e.g. > 20, <= 15, == 22):</em> Activates when the threshold is crossed.</p>

          <p><strong>2. Display Priority inside Popup:</strong><br>
          1. <strong>Popup Text:</strong> Highest priority.<br>
          2. <strong>Popup Entity / Camera:</strong> Displays live camera stream or entity state.<br>
          3. <strong>Trigger Entity:</strong> Fallback to the state of the trigger entity itself.</p>

          <p><strong>3. Auto Close:</strong><br>
          Set a timeout in seconds for 'auto_close' to automatically dismiss the modal (0 = disabled).</p>
          
          <p><strong>4. Additional actions/buttons (new):</strong><br>
          Add one or two buttons to perform actions. (Example: In case of a camera: Add a button to open the door 
          or/and add a button to take a snapshot...)</p>
          
        </div>
      `;
    }

    return html`
      <!-- Tab Navigation -->
      <div class="tabs">
        <button class="tab ${this._activeTab === 'general' ? 'active' : ''}" @click=${() => this._switchTab('general')}>General</button>
        <button class="tab ${this._activeTab === 'advanced' ? 'active' : ''}" @click=${() => this._switchTab('advanced')}>Appearance</button>
        <button class="tab ${this._activeTab === 'additional' ? 'active' : ''}" @click=${() => this._switchTab('additional')}>Additional</button>
        <button class="tab ${this._activeTab === 'help' ? 'active' : ''}" @click=${() => this._switchTab('help')}>ℹ️ Help</button>
      </div>

      ${tabContent}
    `;
  }

  _switchTab(tab) {
    this._activeTab = tab;
  }

  _valueChanged(ev) {
    if (!this._config || !this.hass) return;

    this._config = ev.detail.value;

    const event = new CustomEvent("config-changed", {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }
}

// ==========================================
// CHAPTER 4: DEFINITIVE REGISTRATION
// ==========================================
customElements.define("hvl-popup-card", HvlPopupCard);
customElements.define("hvl-popup-card-editor", HvlPopupCardEditor);
