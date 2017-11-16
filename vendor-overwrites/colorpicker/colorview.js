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
  const COLORPICKER_CLASS = 'codemirror-colorview';
  const COLORPICKER_BACKGROUND_CLASS = 'codemirror-colorview-background';
  const NAMED_COLORS = getNamedColors();
  const COLOR_REGEXP = new RegExp([
    /#(?:[a-f\d]{3,4}|[a-f\d]{6}|[a-f\d]{8})\b/,
    /\brgb\((?:\s*\d{1,3},\s*){2}\d{1,3}\s*\)/,
    /\brgba\((?:\s*\d{1,3},\s*){3}\d*\.?\d+\s*\)/,
    /\bhsla?\(\s*(?:-?\d+|-?\d*\.\d+)(?:%|deg|g?rad|turn|)\s*/.source +
      /,\s*(?:-?\d+|-?\d*\.\d+)%\s*/.source +
      /,\s*(?:-?\d+|-?\d*\.\d+)%/.source +
      /(?:\s*,\s*(?:-?\d+|-?\d*\.\d+))?\s*\)/.source,
    '(?:^|[^-\\w])(' + Object.keys(NAMED_COLORS).join('|') + ')(?:[^-\\w]|$)',
  ].map(rx => rx.source || rx).join('|'), 'gi');

  const CM_EVENTS = {
    change(cm, event) {
      const self = cm.state.colorpicker;
      if (event.origin === 'setValue') {
        self.closePopup();
        self.updateAll();
      } else {
        self.updateLineRange(event.from.line, CodeMirror.changeEnd(event).line);
      }
    },
    update(cm) {
      cm.off('update', CM_EVENTS.update);
      CM_EVENTS.change(cm, {origin: 'setValue'});
    },
    keyup(cm) {
      const popup = cm.state.colorpicker.popup;
      if (popup && popup.isShortCut() === false) {
        popup.hide();
      }
    },
    mousedown(cm, event) {
      const self = cm.state.colorpicker;
      if (event.target.classList.contains(COLORPICKER_BACKGROUND_CLASS)) {
        self.openPopupForMarker(event.target.parentNode);
      } else {
        self.closePopup();
      }
    },
    scroll(cm) {
      const self = cm.state.colorpicker;
      clearTimeout(self.onScrollTimer);
      self.onScrollTimer = setTimeout(self.closePopup, 50);
    },
  };

  class ColorMarker {
    constructor(cm, {
      tooltip = 'open color picker',
      hideDelay = 2000,
      colorpicker,
    } = {}) {
      this.cm = cm;
      this.opt = {tooltip, hideDelay};
      this.popup = cm.colorpicker ? cm.colorpicker() : colorpicker;
      this.registerEvents();
    }

    registerEvents() {
      Object.keys(CM_EVENTS).forEach(name => this.cm.on(name, CM_EVENTS[name]));
    }

    unregisterEvents() {
      Object.keys(CM_EVENTS).forEach(name => this.cm.off(name, CM_EVENTS[name]));
    }

    updateAll() {
      const data = {self: this};
      // updateVisible modifies data
      this.cm.operation(() => updateVisible(data));
      setTimeout(updateInvisible, 100, data);
    }

    updateLineRange(line1, line2) {
      if (line1 > line2) {
        return;
      }
      this.cm.startOperation();
      const data = {};
      let line = line1;
      this.cm.doc.iter(line1, line2 + 1, lineHandle => {
        this.updateLine(line++, lineHandle, data);
      });
      this.cm.endOperation();
    }

    updateLine(
      line,
      lineHandle = this.cm.getLineHandle(line),
      data = {}
    ) {
      for (const {marker} of lineHandle.markedSpans || []) {
        if ((marker.replacedWith || {}).colorpickerData) {
          marker.clear();
        }
      }

      if (data.inComment === undefined) {
        data.inComment = this.cm.getTokenAt({line, ch: 0}).type === 'comment';
      }

      for (const [ch, str, actualColor = str] of findColors(lineHandle.text, data)) {
        if (str.startsWith('#') && isNaN(parseInt(str.charAt(1)))) {
          const pos = {line, ch: ch + 1};
          const type = lineHandle.styles && this.cm.getTokenTypeAt(pos).type ||
            this.cm.getTokenAt(pos).type;
          if (type && type !== 'atom') {
            continue;
          }
        }
        this.cm.setBookmark({line, ch}, {
          widget: createMarker(line, ch, str, actualColor, this.opt.tooltip),
          handleMouseEvents: true,
        });
      }
    }

    removeAllMarkers() {
      this.cm.operation(() => {
        for (const marker of this.cm.getAllMarks()) {
          if ((marker.replacedWith || {}).colorpickerData) {
            marker.clear();
          }
        }
      });
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
          const {color, actualColor} = marker.replacedWith.colorpickerData;
          if (data.ch <= from + color.length) {
            data.ch = from;
            data.color = color;
            data.actualColor = actualColor;
            break;
          }
        }
      }
      this.openPopupForMarker({colorPickerData: data});
    }

    openPopupForMarker(el) {
      if (!this.popup) {
        return;
      }
      const {line, ch, color, actualColor} = el.colorpickerData;
      const pos = {line, ch};
      const coords = this.cm.charCoords(pos);
      let prevColor = color;
      this.popup.show({
        left: coords.left,
        top: coords.bottom,
        isShortCut: el.isShortCut || false,
        hideDelay: this.opt.hideDelay,
      }, actualColor, newColor => {
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

  function updateVisible(data) {
    const cm = data.self.cm;
    const t0 = performance.now();
    data.top = cm.display.viewFrom;
    data.bottom = cm.doc.size - 1;
    let line = data.top;
    cm.doc.iter(data.top, data.bottom + 1, lineHandle => {
      data.self.updateLine(line++, lineHandle, data);
      if (performance.now() - t0 > 10) {
        data.bottom = line - 1;
        return true;
      }
    });
  }

  function updateInvisible({self, top, bottom}) {
    self.updateLineRange(0, top - 1);
    self.updateLineRange(bottom + 1, self.cm.doc.size);
  }

  function createMarker(line, ch, color, actualColor, title) {
    const marker = document.createElement('div');
    const colorpickerData = {
      line,
      ch,
      color,
      actualColor,
      backElement: marker.appendChild(
        Object.assign(document.createElement('div'), {
          className: COLORPICKER_BACKGROUND_CLASS,
          style: `background-color: ${actualColor} !important`,
        })
      ),
    };
    Object.assign(marker, {
      title,
      colorpickerData,
      className: COLORPICKER_CLASS,
    });
    return marker;
  }

  function findColors(text, data) {
    const colors = [];
    let start = data.inComment ? text.indexOf('*/') + 2 : 0;
    if (start === 1) {
      return [];
    }
    let end;
    do {
      end = text.indexOf('/*', start);
      end = end < 0 ? text.length : end;
      if (start < end) {
        const chunk = text.substring(start, end);
        for (let m; (m = COLOR_REGEXP.exec(chunk));) {
          const str = m[0];
          let ch = m.index + start;
          if (str.startsWith('#') || str.startsWith('rgb') || str.startsWith('hsl')) {
            colors.push([ch, str]);
          } else {
            const name = str.replace(/^[^-\w]|[^-\w]$/g, '');
            const actualColor = NAMED_COLORS[name.toLowerCase()];
            if (!actualColor) {
              continue;
            }
            ch += str.startsWith(name) ? 0 : 1;
            colors.push([ch, name, actualColor]);
          }
        }
      }
      if (end === text.length) {
        data.inComment = false;
        break;
      }
      start = text.indexOf('*/', end);
      data.inComment = start < 0;
      start += 2;
    } while (!data.inComment);
    return colors;
  }

  function getNamedColors() {
    return {
      aliceblue: 'rgb(240, 248, 255)',
      antiquewhite: 'rgb(250, 235, 215)',
      aqua: 'rgb(0, 255, 255)',
      aquamarine: 'rgb(127, 255, 212)',
      azure: 'rgb(240, 255, 255)',
      beige: 'rgb(245, 245, 220)',
      bisque: 'rgb(255, 228, 196)',
      black: 'rgb(0, 0, 0)',
      blanchedalmond: 'rgb(255, 235, 205)',
      blue: 'rgb(0, 0, 255)',
      blueviolet: 'rgb(138, 43, 226)',
      brown: 'rgb(165, 42, 42)',
      burlywood: 'rgb(222, 184, 135)',
      cadetblue: 'rgb(95, 158, 160)',
      chartreuse: 'rgb(127, 255, 0)',
      chocolate: 'rgb(210, 105, 30)',
      coral: 'rgb(255, 127, 80)',
      cornflowerblue: 'rgb(100, 149, 237)',
      cornsilk: 'rgb(255, 248, 220)',
      crimson: 'rgb(237, 20, 61)',
      cyan: 'rgb(0, 255, 255)',
      darkblue: 'rgb(0, 0, 139)',
      darkcyan: 'rgb(0, 139, 139)',
      darkgoldenrod: 'rgb(184, 134, 11)',
      darkgray: 'rgb(169, 169, 169)',
      darkgrey: 'rgb(169, 169, 169)',
      darkgreen: 'rgb(0, 100, 0)',
      darkkhaki: 'rgb(189, 183, 107)',
      darkmagenta: 'rgb(139, 0, 139)',
      darkolivegreen: 'rgb(85, 107, 47)',
      darkorange: 'rgb(255, 140, 0)',
      darkorchid: 'rgb(153, 50, 204)',
      darkred: 'rgb(139, 0, 0)',
      darksalmon: 'rgb(233, 150, 122)',
      darkseagreen: 'rgb(143, 188, 143)',
      darkslateblue: 'rgb(72, 61, 139)',
      darkslategray: 'rgb(47, 79, 79)',
      darkslategrey: 'rgb(47, 79, 79)',
      darkturquoise: 'rgb(0, 206, 209)',
      darkviolet: 'rgb(148, 0, 211)',
      deeppink: 'rgb(255, 20, 147)',
      deepskyblue: 'rgb(0, 191, 255)',
      dimgray: 'rgb(105, 105, 105)',
      dimgrey: 'rgb(105, 105, 105)',
      dodgerblue: 'rgb(30, 144, 255)',
      firebrick: 'rgb(178, 34, 34)',
      floralwhite: 'rgb(255, 250, 240)',
      forestgreen: 'rgb(34, 139, 34)',
      fuchsia: 'rgb(255, 0, 255)',
      gainsboro: 'rgb(220, 220, 220)',
      ghostwhite: 'rgb(248, 248, 255)',
      gold: 'rgb(255, 215, 0)',
      goldenrod: 'rgb(218, 165, 32)',
      gray: 'rgb(128, 128, 128)',
      grey: 'rgb(128, 128, 128)',
      green: 'rgb(0, 128, 0)',
      greenyellow: 'rgb(173, 255, 47)',
      honeydew: 'rgb(240, 255, 240)',
      hotpink: 'rgb(255, 105, 180)',
      indianred: 'rgb(205, 92, 92)',
      indigo: 'rgb(75, 0, 130)',
      ivory: 'rgb(255, 255, 240)',
      khaki: 'rgb(240, 230, 140)',
      lavender: 'rgb(230, 230, 250)',
      lavenderblush: 'rgb(255, 240, 245)',
      lawngreen: 'rgb(124, 252, 0)',
      lemonchiffon: 'rgb(255, 250, 205)',
      lightblue: 'rgb(173, 216, 230)',
      lightcoral: 'rgb(240, 128, 128)',
      lightcyan: 'rgb(224, 255, 255)',
      lightgoldenrodyellow: 'rgb(250, 250, 210)',
      lightgreen: 'rgb(144, 238, 144)',
      lightgray: 'rgb(211, 211, 211)',
      lightgrey: 'rgb(211, 211, 211)',
      lightpink: 'rgb(255, 182, 193)',
      lightsalmon: 'rgb(255, 160, 122)',
      lightseagreen: 'rgb(32, 178, 170)',
      lightskyblue: 'rgb(135, 206, 250)',
      lightslategray: 'rgb(119, 136, 153)',
      lightslategrey: 'rgb(119, 136, 153)',
      lightsteelblue: 'rgb(176, 196, 222)',
      lightyellow: 'rgb(255, 255, 224)',
      lime: 'rgb(0, 255, 0)',
      limegreen: 'rgb(50, 205, 50)',
      linen: 'rgb(250, 240, 230)',
      magenta: 'rgb(255, 0, 255)',
      maroon: 'rgb(128, 0, 0)',
      mediumaquamarine: 'rgb(102, 205, 170)',
      mediumblue: 'rgb(0, 0, 205)',
      mediumorchid: 'rgb(186, 85, 211)',
      mediumpurple: 'rgb(147, 112, 219)',
      mediumseagreen: 'rgb(60, 179, 113)',
      mediumslateblue: 'rgb(123, 104, 238)',
      mediumspringgreen: 'rgb(0, 250, 154)',
      mediumturquoise: 'rgb(72, 209, 204)',
      mediumvioletred: 'rgb(199, 21, 133)',
      midnightblue: 'rgb(25, 25, 112)',
      mintcream: 'rgb(245, 255, 250)',
      mistyrose: 'rgb(255, 228, 225)',
      moccasin: 'rgb(255, 228, 181)',
      navajowhite: 'rgb(255, 222, 173)',
      navy: 'rgb(0, 0, 128)',
      oldlace: 'rgb(253, 245, 230)',
      olive: 'rgb(128, 128, 0)',
      olivedrab: 'rgb(107, 142, 35)',
      orange: 'rgb(255, 165, 0)',
      orangered: 'rgb(255, 69, 0)',
      orchid: 'rgb(218, 112, 214)',
      palegoldenrod: 'rgb(238, 232, 170)',
      palegreen: 'rgb(152, 251, 152)',
      paleturquoise: 'rgb(175, 238, 238)',
      palevioletred: 'rgb(219, 112, 147)',
      papayawhip: 'rgb(255, 239, 213)',
      peachpuff: 'rgb(255, 218, 185)',
      peru: 'rgb(205, 133, 63)',
      pink: 'rgb(255, 192, 203)',
      plum: 'rgb(221, 160, 221)',
      powderblue: 'rgb(176, 224, 230)',
      purple: 'rgb(128, 0, 128)',
      rebeccapurple: 'rgb(102, 51, 153)',
      red: 'rgb(255, 0, 0)',
      rosybrown: 'rgb(188, 143, 143)',
      royalblue: 'rgb(65, 105, 225)',
      saddlebrown: 'rgb(139, 69, 19)',
      salmon: 'rgb(250, 128, 114)',
      sandybrown: 'rgb(244, 164, 96)',
      seagreen: 'rgb(46, 139, 87)',
      seashell: 'rgb(255, 245, 238)',
      sienna: 'rgb(160, 82, 45)',
      silver: 'rgb(192, 192, 192)',
      skyblue: 'rgb(135, 206, 235)',
      slateblue: 'rgb(106, 90, 205)',
      slategray: 'rgb(112, 128, 144)',
      slategrey: 'rgb(112, 128, 144)',
      snow: 'rgb(255, 250, 250)',
      springgreen: 'rgb(0, 255, 127)',
      steelblue: 'rgb(70, 130, 180)',
      tan: 'rgb(210, 180, 140)',
      teal: 'rgb(0, 128, 128)',
      thistle: 'rgb(216, 191, 216)',
      tomato: 'rgb(255, 99, 71)',
      turquoise: 'rgb(64, 224, 208)',
      violet: 'rgb(238, 130, 238)',
      wheat: 'rgb(245, 222, 179)',
      white: 'rgb(255, 255, 255)',
      whitesmoke: 'rgb(245, 245, 245)',
      yellow: 'rgb(255, 255, 0)',
      yellowgreen: 'rgb(154, 205, 50)',
      transparent: 'rgba(0, 0, 0, 0)'
    };
  }

  CodeMirror.defineOption('colorpicker', false, (cm, value, oldValue) => {
    // an existing instance is removed first
    // even if both value and oldValue are truthy
    if (oldValue && oldValue !== CodeMirror.Init) {
      if (cm.state.colorpicker) {
        cm.state.colorpicker.unregisterEvents();
        cm.state.colorpicker.removeAllMarkers();
        cm.state.colorpicker = null;
      }
    }
    if (value) {
      const self = cm.state.colorpicker = new ColorMarker(cm, value);
      if (value.forceUpdate) {
        self.updateAll();
      }
    }
  });
});
