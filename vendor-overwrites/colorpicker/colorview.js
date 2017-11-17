/* global CodeMirror */
'use strict';

(mod => {
  if (typeof exports === 'object' && typeof module === 'object') { // CommonJS
    mod(window.require('codemirror'));
  } else if (typeof define === 'function' && window.define.amd) { // AMD
    window.define(['codemirror'], mod);
  } else { // Plain browser env
    mod(window.CodeMirror);
  }
})(function (CodeMirror) {
  const TOKEN_NAME = 'colorview';
  const TOKEN_DOM_CLASS = 'cm-' + TOKEN_NAME;
  const TOKEN_HOOKED_NAME = Object.assign({}, ...[
    'atom',
    'keyword',
  ].map(s => ({[s]: s + ' ' + TOKEN_NAME})));
  const BACKGROUND_CLASS = 'codemirror-colorview-background';

  const NAMED_COLORS = getNamedColorsMap();
  const RX_COLOR = {
    hex: /#(?:[a-f\d]{3,4}|[a-f\d]{6}|[a-f\d]{8})\b/yi,
    rgb: /rgb\((?:\s*\d{1,3},\s*){2}\d{1,3}\s*\)/yi,
    rgba: /rgba\((?:\s*\d{1,3},\s*){3}\d*\.?\d+\s*\)/yi,
    hsl: /hsl\(\s*(?:-?\d+|-?\d*\.\d+)\s*(?:,\s*(?:-?\d+|-?\d*\.\d+)%\s*){2}\)/yi,
    hsla: /hsla\(\s*(?:-?\d+|-?\d*\.\d+)\s*(?:,\s*(?:-?\d+|-?\d*\.\d+)%\s*){2},\s*(?:-?\d+|-?\d*\.\d+)\s*\)/yi,
    named: new RegExp([...NAMED_COLORS.keys()].join('|'), 'i'),
  };
  RX_COLOR.combined = new RegExp(
    /(^|[\s,:"'(])/.source +
    '(' + Object.keys(RX_COLOR).map(k => RX_COLOR[k].source).join('|') + ')' +
    /(?:$|[\s,;"')}])/.source,
    'gi');

  const CM_EVENTS = {
    change(cm, {from, to, removed}) {
      const cache = cm.state.colorpicker.cache;
      if (removed.length === 1 && from.ch === 0 && to.ch > 0) {
        console.log('deleted', cache.delete(removed[0]));
        //cache.delete(removed[0]);
      } else if (removed.length > 1) {
        for (const [text, lineCache] of cache.entries()) {
          const line = lineCache.size && lineCache.values().next().value.line;
          if (line === undefined || line >= from.line && line <= to.line) {
            console.log('deleted', line);
            cache.delete(text);
          }
        }
      }
    },
    update(cm) {
      if (cm.state.colorpicker.cache.size) {
        renderMarkers(cm);
      }
    },
    keyup(cm) {
      const popup = cm.state.colorpicker.popup;
      if (popup && popup.isShortCut() === false) {
        popup.hide();
      }
    },
    mousedown(cm, event) {
      const self = cm.state.colorpicker;
      if (event.target.classList.contains(BACKGROUND_CLASS)) {
        event.preventDefault();
        self.openPopupForMarker(event.target.parentNode);
      } else {
        self.closePopup();
      }
    },
  };

  class ColorMarker {
    constructor(cm, {
      tooltip = 'Open color picker',
      tooltipForSwitcher = 'Switch formats: HEX -> RGB -> HSL',
      hideDelay = 2000,
      colorpicker,
    } = {}) {
      this.cm = cm;
      this.opt = {tooltip, tooltipForSwitcher, hideDelay};
      this.popup = cm.colorpicker ? cm.colorpicker() : colorpicker;
      this.cache = new Map();
      this.registerEvents();
    }

    registerEvents() {
      Object.keys(CM_EVENTS).forEach(name => this.cm.on(name, CM_EVENTS[name]));
    }

    unregisterEvents() {
      Object.keys(CM_EVENTS).forEach(name => this.cm.off(name, CM_EVENTS[name]));
    }

    openPopup(defaultColor = '#FFFFFF') {
      const cursor = this.cm.getCursor();
      const data = {
        line: cursor.line,
        ch: cursor.ch,
        color: defaultColor,
        isShortCut: true,
      };
      for (const {from, marker} of this.cm.getLineHandle(cursor.line).markedSpans || []) {
        if (from <= data.ch && (marker.replacedWith || {}).colorpickerData) {
          const {color, colorValue} = marker.replacedWith.colorpickerData;
          if (data.ch <= from + color.length) {
            data.ch = from;
            data.color = color;
            data.colorValue = colorValue;
            break;
          }
        }
      }
      this.openPopupForMarker({colorpickerData: data});
    }

    openPopupForMarker(el) {
      if (!this.popup) {
        return;
      }
      const {line, ch, color, colorValue = color} = el.colorpickerData;
      const pos = {line, ch};
      const coords = this.cm.charCoords(pos);
      let prevColor = color;
      this.popup.show({
        left: coords.left,
        top: coords.bottom,
        isShortCut: false,
        hideDelay: this.opt.hideDelay,
        tooltipForSwitcher: this.opt.tooltipForSwitcher,
      }, colorValue, newColor => {
        this.cm.replaceRange(newColor, pos, {line, ch: ch + prevColor.length}, '*colorpicker');
        prevColor = newColor;
      });
    }

    closePopup() {
      if (this.popup) {
        this.popup.hide();
      }
    }
  }

  function getNamedColorsMap() {
    return new Map([
      ['aliceblue', '#f0f8ff'],
      ['antiquewhite', '#faebd7'],
      ['aqua', '#00ffff'],
      ['aquamarine', '#7fffd4'],
      ['azure', '#f0ffff'],
      ['beige', '#f5f5dc'],
      ['bisque', '#ffe4c4'],
      ['black', '#000000'],
      ['blanchedalmond', '#ffebcd'],
      ['blue', '#0000ff'],
      ['blueviolet', '#8a2be2'],
      ['brown', '#a52a2a'],
      ['burlywood', '#deb887'],
      ['cadetblue', '#5f9ea0'],
      ['chartreuse', '#7fff00'],
      ['chocolate', '#d2691e'],
      ['coral', '#ff7f50'],
      ['cornflowerblue', '#6495ed'],
      ['cornsilk', '#fff8dc'],
      ['crimson', '#dc143c'],
      ['cyan', '#00ffff'],
      ['darkblue', '#00008b'],
      ['darkcyan', '#008b8b'],
      ['darkgoldenrod', '#b8860b'],
      ['darkgray', '#a9a9a9'],
      ['darkgreen', '#006400'],
      ['darkgrey', '#a9a9a9'],
      ['darkkhaki', '#bdb76b'],
      ['darkmagenta', '#8b008b'],
      ['darkolivegreen', '#556b2f'],
      ['darkorange', '#ff8c00'],
      ['darkorchid', '#9932cc'],
      ['darkred', '#8b0000'],
      ['darksalmon', '#e9967a'],
      ['darkseagreen', '#8fbc8f'],
      ['darkslateblue', '#483d8b'],
      ['darkslategray', '#2f4f4f'],
      ['darkslategrey', '#2f4f4f'],
      ['darkturquoise', '#00ced1'],
      ['darkviolet', '#9400d3'],
      ['deeppink', '#ff1493'],
      ['deepskyblue', '#00bfff'],
      ['dimgray', '#696969'],
      ['dimgrey', '#696969'],
      ['dodgerblue', '#1e90ff'],
      ['firebrick', '#b22222'],
      ['floralwhite', '#fffaf0'],
      ['forestgreen', '#228b22'],
      ['fuchsia', '#ff00ff'],
      ['gainsboro', '#dcdcdc'],
      ['ghostwhite', '#f8f8ff'],
      ['gold', '#ffd700'],
      ['goldenrod', '#daa520'],
      ['gray', '#808080'],
      ['green', '#008000'],
      ['greenyellow', '#adff2f'],
      ['grey', '#808080'],
      ['honeydew', '#f0fff0'],
      ['hotpink', '#ff69b4'],
      ['indianred', '#cd5c5c'],
      ['indigo', '#4b0082'],
      ['ivory', '#fffff0'],
      ['khaki', '#f0e68c'],
      ['lavender', '#e6e6fa'],
      ['lavenderblush', '#fff0f5'],
      ['lawngreen', '#7cfc00'],
      ['lemonchiffon', '#fffacd'],
      ['lightblue', '#add8e6'],
      ['lightcoral', '#f08080'],
      ['lightcyan', '#e0ffff'],
      ['lightgoldenrodyellow', '#fafad2'],
      ['lightgray', '#d3d3d3'],
      ['lightgreen', '#90ee90'],
      ['lightgrey', '#d3d3d3'],
      ['lightpink', '#ffb6c1'],
      ['lightsalmon', '#ffa07a'],
      ['lightseagreen', '#20b2aa'],
      ['lightskyblue', '#87cefa'],
      ['lightslategray', '#778899'],
      ['lightslategrey', '#778899'],
      ['lightsteelblue', '#b0c4de'],
      ['lightyellow', '#ffffe0'],
      ['lime', '#00ff00'],
      ['limegreen', '#32cd32'],
      ['linen', '#faf0e6'],
      ['magenta', '#ff00ff'],
      ['maroon', '#800000'],
      ['mediumaquamarine', '#66cdaa'],
      ['mediumblue', '#0000cd'],
      ['mediumorchid', '#ba55d3'],
      ['mediumpurple', '#9370db'],
      ['mediumseagreen', '#3cb371'],
      ['mediumslateblue', '#7b68ee'],
      ['mediumspringgreen', '#00fa9a'],
      ['mediumturquoise', '#48d1cc'],
      ['mediumvioletred', '#c71585'],
      ['midnightblue', '#191970'],
      ['mintcream', '#f5fffa'],
      ['mistyrose', '#ffe4e1'],
      ['moccasin', '#ffe4b5'],
      ['navajowhite', '#ffdead'],
      ['navy', '#000080'],
      ['oldlace', '#fdf5e6'],
      ['olive', '#808000'],
      ['olivedrab', '#6b8e23'],
      ['orange', '#ffa500'],
      ['orangered', '#ff4500'],
      ['orchid', '#da70d6'],
      ['palegoldenrod', '#eee8aa'],
      ['palegreen', '#98fb98'],
      ['paleturquoise', '#afeeee'],
      ['palevioletred', '#db7093'],
      ['papayawhip', '#ffefd5'],
      ['peachpuff', '#ffdab9'],
      ['peru', '#cd853f'],
      ['pink', '#ffc0cb'],
      ['plum', '#dda0dd'],
      ['powderblue', '#b0e0e6'],
      ['purple', '#800080'],
      ['rebeccapurple', '#663399'],
      ['red', '#ff0000'],
      ['rosybrown', '#bc8f8f'],
      ['royalblue', '#4169e1'],
      ['saddlebrown', '#8b4513'],
      ['salmon', '#fa8072'],
      ['sandybrown', '#f4a460'],
      ['seagreen', '#2e8b57'],
      ['seashell', '#fff5ee'],
      ['sienna', '#a0522d'],
      ['silver', '#c0c0c0'],
      ['skyblue', '#87ceeb'],
      ['slateblue', '#6a5acd'],
      ['slategray', '#708090'],
      ['slategrey', '#708090'],
      ['snow', '#fffafa'],
      ['springgreen', '#00ff7f'],
      ['steelblue', '#4682b4'],
      ['tan', '#d2b48c'],
      ['teal', '#008080'],
      ['thistle', '#d8bfd8'],
      ['tomato', '#ff6347'],
      ['turquoise', '#40e0d0'],
      ['violet', '#ee82ee'],
      ['wheat', '#f5deb3'],
      ['white', '#ffffff'],
      ['whitesmoke', '#f5f5f5'],
      ['yellow', '#ffff00'],
      ['yellowgreen', '#9acd32'],
    ]);
  }

  function modeHookStart() {
    const state = this._startState.apply(this, arguments);
    state.colorpicker = {};
    return state;
  }

  function modeHookToken(stream, {colorpicker}) {
    const token = this._token.apply(this, arguments);
    const cm = stream.lineOracle.doc.cm;
    const display = cm.display;
    const oldView = !display.viewFrom && !display.viewTo;
    const top = oldView ? display.reportedViewFrom : display.viewFrom;
    const bottom = oldView ? display.reportedViewTo : display.viewTo;
    const line = stream.lineOracle.line;
    if ((top || bottom) && (line < top || line > bottom) && line !== cm.getCursor().line) {
      return token;
    }
    const text = stream.string;
    const {cache} = cm.state.colorpicker;
    let lineCache = text === colorpicker.lastText ? colorpicker.lineCache : cache.get(text);
    const data = lineCache && lineCache.get(stream.pos);
    if (data) {
      return TOKEN_HOOKED_NAME[token];
    }
    let color, colorValue;
    switch (token) {
      case 'atom': {
        const s = stream.current().toLowerCase();
        const maybeHex = s.startsWith('#');
        if (maybeHex ||
            (s === 'rgb' || s === 'rgba' || s === 'hsl' || s === 'hsla') &&
              text.charAt(stream.pos) === '(') {
          const rx = maybeHex ? RX_COLOR.hex : RX_COLOR[s];
          rx.lastIndex = stream.start;
          const match = rx.exec(text);
          color = match && {color: match[0]};
        }
        break;
      }
      case 'keyword': {
        color = stream.current();
        colorValue = NAMED_COLORS.get(color.toLowerCase());
        color = colorValue && {color, colorValue};
        break;
      }
    }
    if (!color) {
      return token;
    }
    if (!lineCache) {
      lineCache = new Map();
      cache.set(text, lineCache);
    }
    lineCache.set(stream.pos, color);
    colorpicker.lastText = text;
    colorpicker.lineCache = lineCache;
    return TOKEN_HOOKED_NAME[token];
  }

  function renderMarkers(cm) {
    const {cache} = cm.state.colorpicker;
    let line = cm.display.viewFrom - 1;
    for (const {line: lineHandle, text} of cm.display.renderedView) {
      if (!lineHandle.parent) {
        console.log('no lineHandle.parent');
        continue;
      }
      line++;
      const styles = lineHandle.styles;
      if (!styles) {
        continue;
      }
      const lineCache = cache.get(lineHandle.text);
      if (!lineCache) {
        continue;
      }
      let elementIndex = 0;
      let elements;
      for (let i = 1; i < styles.length; i += 2) {
        const token = styles[i + 1];
        if (!token || !token.includes(TOKEN_NAME)) {
          continue;
        }
        const data = lineCache.get(styles[i]);
        if (!data) {
          continue;
        }
        elements = elements || text.getElementsByClassName(TOKEN_DOM_CLASS);
        const el = elements[elementIndex++];
        if (el.colorpickerData && el.colorpickerData.color === data.color) {
          continue;
        }
        el.colorpickerData = data;
        el.colorpickerData.ch = styles[i] - data.color.length;
        el.colorpickerData.line = line;
        let bg = el.firstElementChild;
        if (!bg) {
          bg = document.createElement('div');
          bg.className = BACKGROUND_CLASS;
          el.appendChild(bg);
        }
        bg.style.setProperty('background-color', data.color, 'important');
      }
    }
  }

  CodeMirror.defineOption('colorpicker', false, (cm, value, oldValue) => {
    // an existing instance is removed first
    // even if both value and oldValue are truthy
    if (oldValue && oldValue !== CodeMirror.Init) {
      const self = cm.state.colorpicker;
      if (self) {
        self.unregisterEvents();
        self.removeMarkers(cm);
        cm.state.colorpicker = null;
      }
    }
    if (value) {
      cm.state.colorpicker = new ColorMarker(cm, value);
      if (value.forceUpdate) {
        cm.refresh();
      }
    }
  });

  CodeMirror.extendMode('css', {
    startState: modeHookStart,
    token: modeHookToken,
  });
});
