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
    };
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
      trigger: "",
      auto_close: 0,
      overlay_color: "rgba(0, 0, 0, 0.75)",
      bg_color: "var(--card-background-color, #ffffff)",
      text_color: "var(--primary-text-color, #000000)",
      font_family: "inherit",
      border_radius: "14px",
      ...config,
    };
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
  
  _sanitizeAndTruncateText(text, maxLength = 150) {
    if (!text) return "";
    const plainText = String(text).replace(/<\/?[^>]+(>|$)/g, "");
    
    if (plainText.length <= maxLength) {
      return plainText;
    }
    return plainText.slice(0, maxLength).trim() + "...";
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
    if (changedProperties.has("hass") && this.hass && this.config?.trigger_entity) {
      const triggerEntityId = this.config.trigger_entity;
      const stateObj = this.hass.states[triggerEntityId];
      if (!stateObj) return;
      
      const currentState = stateObj.state;

      if (this._previousState === undefined) {
        this._previousState = currentState;
        this._hasTriggered = this._evaluateTrigger(currentState, (this.config.trigger || "").trim());
        return;
      }

      if (currentState !== this._previousState) {
        const targetRaw = (this.config.trigger || "").trim();
        const isSatisfied = this._evaluateTrigger(currentState, targetRaw);

        this._previousState = currentState;

        if (!targetRaw) {
          this.triggerPopup();
          return;
        }

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
  }

  triggerPopup() {
    this._showPopup = true;

    if (this._checkTimerInterval) {
      clearInterval(this._checkTimerInterval);
      this._checkTimerInterval = null;
    }

    // Haal de waarde veilig op via je eigen helper functie
    const rawAutoClose = this._getConfigValue("auto_close", 0);
    let timeoutSec = parseInt(rawAutoClose, 10) || 0;
    
    if (timeoutSec > 0) {
      timeoutSec = Math.min(timeoutSec, 120); // Veiligheidshalve gemaximeerd op 120 sec
      this._closeTimestamp = Date.now() + (timeoutSec * 1000);

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
    }
  }

  render() {
    const editPlaceholder = html`
      <div class="edit-placeholder">
        🔔 <strong>${this.config.title || 'HVL Popup'}</strong><br />
        <small>(${this.config.trigger_entity || 'No trigger selected'})</small><br />
        <button class="test-btn" @click=${() => this.triggerPopup()}>
          Test Pop-up
        </button>
      </div>
    `;

    let popupHtml = html``;
    if (this._showPopup) {
      const TriggerEntityId = this._getConfigValue("trigger_entity");
      const TargetEntityId = this._getConfigValue("popup_entity");
      const popupTextRaw = this.config.popup_text ? this.config.popup_text.trim() : "";
      const popupText = this._sanitizeAndTruncateText(popupTextRaw, 150);
      
      const isCamera = TargetEntityId && TargetEntityId.startsWith("camera.") && !popupText;
      const autoCloseSec = parseInt(this.config.auto_close, 10) || 0;

      const overlayBg = this.config.overlay_color || "rgba(0, 0, 0, 0.75)";
      const cardBg = this.config.bg_color || "var(--card-background-color, #ffffff)";
      const textColor = this.config.text_color || "var(--primary-text-color, #000000)";
      const fontFamily = this.config.font_family || "inherit";
      const borderRadius = this.config.border_radius || "14px";
      
      const TriggerEntityObj = TriggerEntityId ? this.hass.states[TriggerEntityId] : null;
      const TargetEntityObj = TargetEntityId ? this.hass.states[TargetEntityId] : null;

      let contentHtml = html``;

      if (popupText) {
        contentHtml = html`
          <p style="color: ${textColor}; opacity: 0.9; margin: 16px 0; font-size: 1.1em; line-height: 1.5; word-break: break-word;">
            ${popupText}
          </p>
        `;
      } else if (TargetEntityId) {
        if (isCamera) {
          contentHtml = html`
            <div style="margin: 16px 0; border-radius: 8px; overflow: hidden; background: #000;">
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
            <p style="color: ${textColor}; opacity: 0.85; line-height: 1.5; margin: 20px 0; word-break: break-word;">
              Status of <strong>${friendlyName}</strong>:
              <br />
              <span style="font-size: 1.3em; font-weight: bold; color: ${textColor}; display: inline-block; margin-top: 8px; word-break: break-word;">
                ${currentValue}
              </span>
            </p>
          `;
        }
      } else {
        const friendlyName = TriggerEntityObj?.attributes?.friendly_name || TriggerEntityId || "Trigger";
        const currentValue = this._getTranslatedState(TriggerEntityObj);
        contentHtml = html`
          <p style="color: ${textColor}; opacity: 0.85; line-height: 1.5; margin: 20px 0; word-break: break-word;">
            Status of <strong>${friendlyName}</strong>:
            <br />
            <span style="font-size: 1.3em; font-weight: bold; color: var(--primary-color, #03a9f4); display: inline-block; margin-top: 8px; word-break: break-word;">
              ${currentValue}
            </span>
          </p>
        `;
      }

      popupHtml = html`
        <div 
          style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: ${overlayBg};
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 99999;
            backdrop-filter: blur(4px);
            font-family: ${fontFamily};
            padding: 16px;
            box-sizing: border-box;
          "
          @click=${() => this.closePopup()}
        >
          <div 
            style="
              position: relative;
              background: ${cardBg};
              color: ${textColor};
              padding: 24px;
              border-radius: ${borderRadius};
              width: 90%;
              max-width: ${isCamera ? '720px' : '480px'};
              max-height: 85vh;
              overflow-y: auto;
              box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
              text-align: center;
              box-sizing: border-box;
              word-break: break-word;
              --card-border-radius: ${borderRadius};
            "
            @click=${(e) => e.stopPropagation()}
          >
            <h3 style="margin-top: 0; font-size: 1.4em; color: ${textColor}; word-break: break-word;">
              ${this.config.title}
            </h3>

            ${contentHtml}

            <button 
              style="
                background: var(--primary-color, #03a9f4);
                color: #ffffff;
                border: none;
                padding: 10px 24px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: bold;
                font-size: 1em;
                margin-top: 8px;
                margin-bottom: ${autoCloseSec > 0 ? '6px' : '0px'};
              "
              @click=${() => this.closePopup()}
            >
              Close
            </button>

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
        name: "border_radius",
        label: "Corner Border Radius (e.g. '14px' or '0px')",
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
        height: 180px;
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
        max-width: 280px;
        box-sizing: border-box;
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

    const previewEntityId = this._config.popup_entity || this._config.trigger_entity;
    const previewEntityObj = previewEntityId ? this.hass.states[previewEntityId] : null;
    const previewFriendlyName = previewEntityObj?.attributes?.friendly_name || previewEntityId || "Sample Entity";
    
    let previewStatusText = "OPEN";
    if (this._config.popup_text) {
      previewStatusText = this._config.popup_text;
    } else if (previewEntityObj) {
      const translations = { on: "On", off: "Off", open: "Open", closed: "Closed", home: "Home", not_home: "Away" };
      previewStatusText = translations[previewEntityObj.state?.toLowerCase()] || previewEntityObj.state;
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
              <div style="font-size: 0.75em; opacity: 0.8; margin: 8px 0; word-break: break-word;">
                ${previewEntityId ? html`Status of <strong>${previewFriendlyName}</strong>:` : 'Status:'}
                <br>
                <span style="color: var(--primary-color, #03a9f4); font-weight: bold; font-size: 1.1em;">
                  ${previewStatusText}
                </span>
              </div>
              <div style="background: var(--primary-color, #03a9f4); color: #fff; font-size: 0.7em; padding: 3px 8px; border-radius: 4px; display: inline-block;">
                Close
              </div>
            </div>
          </div>
        </div>
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
        </div>
      `;
    }

    return html`
      <!-- Tab Navigation -->
      <div class="tabs">
        <button class="tab ${this._activeTab === 'general' ? 'active' : ''}" @click=${() => this._switchTab('general')}>General</button>
        <button class="tab ${this._activeTab === 'advanced' ? 'active' : ''}" @click=${() => this._switchTab('advanced')}>Appearance</button>
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