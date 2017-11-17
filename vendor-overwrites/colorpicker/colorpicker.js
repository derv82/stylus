(function(mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("codemirror"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["codemirror" ], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function(CodeMirror) {

    CodeMirror.defineExtension("colorpicker", function () {

        var cm  = this;

        var color = {

            trim : function (str) {
                return str.replace(/^\s+|\s+$/g, '');
            },

            /**
             * @method format
             *
             * convert color to format string
             *
             *     // hex
             *     color.format({ r : 255, g : 255, b : 255 }, 'hex')  // #FFFFFF
             *
             *     // rgb
             *     color.format({ r : 255, g : 255, b : 255 }, 'rgb') // rgba(255, 255, 255, 0.5);
             *
             *     // rgba
             *     color.format({ r : 255, g : 255, b : 255, a : 0.5 }, 'rgb') // rgba(255, 255, 255, 0.5);
             *
             * @param {Object} obj  obj has r, g, b and a attributes
             * @param {"hex"/"rgb"} type  format string type
             * @returns {*}
             */
            format : function (obj, type) {
                const {r, g, b, h, s, l} = obj;
                const a = getAlphaString(obj.a);
                const hasA = !!a;
                switch (type) {
                    case 'hex': {
                        const rgbStr = (0x1000000 + (r << 16) + (g << 8) + (b | 0)).toString(16).slice(1);
                        const aStr = hasA ? (0x100 + Math.round(a * 255)).toString(16).slice(1) : '';
                        return "#" + (rgbStr + aStr).replace(/^(.)\1(.)\2(.)\3(?:(.)\4)?$/, '$1$2$3$4');
                    }
                    case 'rgb':
                        return hasA ?
                            `rgba(${r}, ${g}, ${b}, ${a})` :
                            `rgb(${r}, ${g}, ${b})`;
                    case 'hsl':
                        return hasA ?
                            `hsla(${h}, ${s}%, ${l}%, ${a})` :
                            `hsl(${h}, ${s}%, ${l}%)`;
                    default:
                        return obj;
                }
            },

            /**
             * @method rgb
             *
             * parse string to rgb color
             *
             * 		color.rgb("#FF0000") === { r : 255, g : 0, b : 0 }
             *
             * 		color.rgb("rgb(255, 0, 0)") == { r : 255, g : 0, b : }
             *
             * @param {String} str color string
             * @returns {Object}  rgb object
             */
            parse : function (str) {
                if (typeof str !== 'string') {
                    return str;
                }
                if (str.includes('rgb')) {
                    const [r, g, b, a = 1] = str.replace(/rgba?\(|\)/g, '').split(',').map(parseFloat);
                    return {type: 'rgb', r, g, b, a};
                } else if (str.includes('hsl')) {
                    const [h, s, l, a = 1] = str.replace(/hsla?\(|\)/g, '').split(',').map(parseFloat);
                    return Object.assign(color.HSLtoRGB(h, s, l), {type: 'hsl', a});
                } else if (str.includes('#')) {
                    str = str.trim().slice(1);
                    const [r, g, b, a = 255] = str.length <= 4 ?
                        str.match(/(.)/g).map(c => parseInt(c + c, 16)) :
                        str.match(/(..)/g).map(c => parseInt(c, 16));
                    return {type: 'hex', r, g, b, a: a === 255 ? undefined : a / 255};
                } else {
                    return str;
                }
            },

            /**
             * @method HSVtoRGB
             *
             * convert hsv to rgb
             *
             * 		color.HSVtoRGB(0,0,1) === #FFFFF === { r : 255, g : 0, b : 0 }
             *
             * @param {Number} H  hue color number  (min : 0, max : 360)
             * @param {Number} S  Saturation number  (min : 0, max : 1)
             * @param {Number} V  Value number 		(min : 0, max : 1 )
             * @returns {Object}
             */
            HSVtoRGB : function (H, S, V) {

                if (H == 360) {
                    H = 0;
                }

                var C = S * V;
                var X = C * (1 -  Math.abs((H/60) % 2 -1)  );
                var m = V - C;

                var temp = [];

                if (0 <= H && H < 60) { temp = [C, X, 0]; }
                else if (60 <= H && H < 120) { temp = [X, C, 0]; }
                else if (120 <= H && H < 180) { temp = [0, C, X]; }
                else if (180 <= H && H < 240) { temp = [0, X, C]; }
                else if (240 <= H && H < 300) { temp = [X, 0, C]; }
                else if (300 <= H && H < 360) { temp = [C, 0, X]; }

                return {
                    r : Math.round((temp[0] + m) * 255),
                    g : Math.round((temp[1] + m) * 255),
                    b : Math.round((temp[2] + m) * 255)
                };
            },

            /**
             * @method RGBtoHSV
             *
             * convert rgb to hsv
             *
             * 		color.RGBtoHSV(0, 0, 255) === { h : 240, s : 1, v : 1 } === '#FFFF00'
             *
             * @param {Number} R  red color value
             * @param {Number} G  green color value
             * @param {Number} B  blue color value
             * @return {Object}  hsv color code
             */
            RGBtoHSV : function (R, G, B) {

                var R1 = R / 255;
                var G1 = G / 255;
                var B1 = B / 255;

                var MaxC = Math.max(R1, G1, B1);
                var MinC = Math.min(R1, G1, B1);

                var DeltaC = MaxC - MinC;

                var H = 0;

                if (DeltaC == 0) { H = 0; }
                else if (MaxC == R1) {
                    H = 60 * (( (G1 - B1) / DeltaC) % 6);
                } else if (MaxC == G1) {
                    H  = 60 * (( (B1 - R1) / DeltaC) + 2);
                } else if (MaxC == B1) {
                    H  = 60 * (( (R1 - G1) / DeltaC) + 4);
                }

                if (H < 0) {
                    H = 360 + H;
                }

                var S = 0;

                if (MaxC == 0) S = 0;
                else S = DeltaC / MaxC;

                var V = MaxC;

                return { h : H, s : S, v :  V };
            },

            RGBtoHSL : function (r, g, b) {
                r /= 255, g /= 255, b /= 255;
                var max = Math.max(r, g, b), min = Math.min(r, g, b);
                var h, s, l = (max + min) / 2;

                if(max == min){
                    h = s = 0; // achromatic
                }else{
                    var d = max - min;
                    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                    switch(max){
                        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                        case g: h = (b - r) / d + 2; break;
                        case b: h = (r - g) / d + 4; break;
                    }
                    h /= 6;
                }

                return { h : Math.round(h * 360) , s : Math.round(s * 100), l : Math.round(l * 100)};
            },

            HUEtoRGB : function (p, q, t) {
                if(t < 0) t += 1;
                if(t > 1) t -= 1;
                if(t < 1/6) return p + (q - p) * 6 * t;
                if(t < 1/2) return q;
                if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            },

            HSLtoRGB : function (h, s, l) {
                var r, g, b;

                h /= 360;
                s /= 100;
                l /= 100;

                if(s == 0){
                    r = g = b = l; // achromatic
                }else{
                    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                    var p = 2 * l - q;
                    r = this.HUEtoRGB(p, q, h + 1/3);
                    g = this.HUEtoRGB(p, q, h);
                    b = this.HUEtoRGB(p, q, h - 1/3);
                }

                return { r : r * 255, g : g * 255, b : b * 255 };
            }
        };

        var hue_color = [
            { rgb : '#ff0000', start : .0 },
            { rgb : '#ffff00', start : .17 },
            { rgb : '#00ff00', start : .33 },
            { rgb : '#00ffff', start : .50 },
            { rgb : '#0000ff', start : .67 },
            { rgb : '#ff00ff', start : .83 },
            { rgb : '#ff0000', start : 1 }
        ];

        var $body, $root, $hue, $color, $value, $saturation, $drag_pointer, $drag_bar,
            $control, $controlPattern, $controlColor, $hueContainer, $opacity, $opacityContainer, $opacityColorBar, $formatChangeButton,
            $opacity_drag_bar, $information, $informationChange;

        var currentA, currentH, currentS, currentV;
        var $hexCode;
        var $rgb_r, $rgb_g, $rgb_b, $rgb_a;
        var $hsl_h, $hsl_s, $hsl_l, $hsl_a;
        var cssPrefix = getCssValuePrefix();

        var colorpickerCallback = function () {};
        var counter = 0;
        var cached = {};
        var isColorPickerShow = false;
        var isShortCut = false;
        var hideDelay = 2000;

        var prevFocusedElement;
        var lastOutputColor;
        var userActivity;

        function dom(tag, className, attr) {

            if (typeof tag != 'string') {
                this.el = tag;
            } else {

                var el  = document.createElement(tag);

                this.uniqId = counter++;

                el.className = className;

                attr = attr || {};

                for(var k in attr) {
                    el.setAttribute(k, attr[k]);
                }

                this.el = el;
            }
        }

        dom.prototype.closest = function (cls) {

            var temp = this;
            var checkCls = false;

            while(!(checkCls = temp.hasClass(cls))) {
                if (temp.el.parentNode) {
                    temp = new dom(temp.el.parentNode);
                } else {
                    return null;
                }
            }

            if (checkCls) {
                return temp;
            }

            return null;
        }

        dom.prototype.removeClass = function (cls) {
            this.el.className = color.trim((" " + this.el.className + " ").replace(' ' + cls + ' ', ' '));
        }

        dom.prototype.hasClass = function (cls) {
            if (!this.el.className)
            {
                return false;
            } else {
                var newClass = ' ' + this.el.className + ' ';
                return newClass.indexOf(' ' + cls + ' ') > -1;
            }
        }

        dom.prototype.addClass = function (cls) {
            if (!this.hasClass(cls)) {
                this.el.className = this.el.className + " " + cls;
            }

        }

        dom.prototype.setText = function (text) {
            this.el.textContent = text;

            return this;
        }

        dom.prototype.empty = function () {
            return this.setText('');
        }

        dom.prototype.append = function (el) {

            if (typeof el == 'string') {
                this.el.appendChild(document.createTextNode(el));
            } else {
                this.el.appendChild(el.el || el);
            }

            return this;
        }

        dom.prototype.appendTo = function (target) {
            var t = target.el ? target.el : target;

            t.appendChild(this.el);

            return this;
        }

        dom.prototype.remove = function () {
            if (this.el.parentNode) {
                this.el.parentNode.removeChild(this.el);
            }

            return this;
        }

        dom.prototype.text = function () {
            return this.el.textContent;
        }

        dom.prototype.css = function (key, value) {
            if (arguments.length == 2) {
                this.el.style[key] = value;
            } else if (arguments.length == 1) {

                if (typeof key == 'string') {
                    return getComputedStyle(this.el)[key];
                } else {
                    var keys = key || {};
                    for(var k in keys) {
                        this.el.style[k] = keys[k];
                    }
                }

            }

            return this;
        }

        dom.prototype.offset = function () {
            var rect = this.el.getBoundingClientRect();

            return {
                top: rect.top + document.body.scrollTop,
                left: rect.left + document.body.scrollLeft
            };
        }

        dom.prototype.position = function () {
            return {
                top: parseFloat(this.el.style.top),
                left: parseFloat(this.el.style.left)
            };
        }

        dom.prototype.width = function () {
            return this.el.offsetWidth;
        }

        dom.prototype.height = function () {
            return this.el.offsetHeight;
        }

        dom.prototype.dataKey = function (key) {
            return this.uniqId + '.' + key;
        }

        dom.prototype.data = function (key, value) {
            if (arguments.length == 2) {
                cached[this.dataKey(key)] = value;
            } else if (arguments.length == 1) {
                return cached[this.dataKey(key)];
            } else {
                var keys = Object.keys(cached);

                var uniqId = this.uniqId + ".";
                return keys.filter(function (key) {
                    if (key.indexOf(uniqId) == 0) {
                        return true;
                    }

                    return false;
                }).map(function (value) {
                    return cached[value];
                })
            }

            return this;
        }

        dom.prototype.val = function (value) {
            if (arguments.length == 0) {
                return this.el.value;
            } else if (arguments.length == 1) {
                this.el.value = value;
            }

            return this;
        }

        dom.prototype.int = function () {
            return parseInt(this.val(), 10);
        }

        dom.prototype.show = function () {
            return this.css('display', 'block');
        }

        dom.prototype.hide = function () {
            return this.css('display', 'none');
        }

        function getAlphaString(a = currentA) {
            return isNaN(a) ? '' :
                a.toString().slice(0, 8)
                    .replace(/(\.[^0]*)0+$/, '$1')
                    .replace(/^1$/, '');
        }

        function setRGBInput(r, g, b) {
            $rgb_r.val(r);
            $rgb_g.val(g);
            $rgb_b.val(b);
            $rgb_a.val(getAlphaString() || 1);
        }

        function setHSLInput(h, s, l) {
            $hsl_h.val(h);
            $hsl_s.val(s);
            $hsl_l.val(l);
            $hsl_a.val(getAlphaString() || 1);
        }

        function getHexFormat() {
            return color.format({
                r : $rgb_r.int(),
                g : $rgb_g.int(),
                b : $rgb_b.int(),
                a : currentA,
            }, 'hex');
        }

        function convertRGB() {
            return color.HSVtoRGB(currentH, currentS, currentV);
        }

        function convertHEX() {
            return color.format(convertRGB(), 'hex');
        }

        function convertHSL() {
            var rgb = color.HSVtoRGB(currentH, currentS, currentV);
            return color.RGBtoHSL(rgb.r, rgb.g, rgb.b);
        }

        function getFormattedColor (format = $information.data('format'), alpha = currentA) {
            const converted = format === 'hsl' ? convertHSL() : convertRGB();
            converted.a = isNaN(alpha) || alpha === 1 ? undefined : alpha;
            return color.format(converted, format);
        }

        function setControlColor (color) {
            $controlColor.css('background-color', color);
        }

        function setInputColor() {

            var format = $information.data('format') || 'hex';

            var rgb = null;
            if (format == 'hex') {
                $hexCode.val(convertHEX());
            } else if (format == 'rgb') {
                var rgb = convertRGB();
                setRGBInput(rgb.r, rgb.g, rgb.b);
            } else if (format == 'hsl') {
                var hsl = convertHSL();
                setHSLInput(hsl.h, hsl.s, hsl.l);
            }

            // set background
            setControlColor(getFormattedColor('rgb'));

            var rgb = convertRGB();
            var colorString = color.format(rgb, 'rgb');
            setOpacityColorBar(colorString);

            if (typeof colorpickerCallback == 'function') {
                colorpickerCallback(getFormattedColor(format));
            }
        }

        function setMainColor(e) {
            e.preventDefault();
            var pos = $root.position();         // position for screen
            var w = $color.width();
            var h = $color.height();

            var x = e.clientX - pos.left;
            var y = e.clientY - pos.top;

            if (x < 0) x = 0;
            else if (x > w) x = w;

            if (y < 0) y = 0;
            else if (y > h) y = h;

            $drag_pointer.css({
                left: (x - 5) + 'px',
                top: (y - 5) + 'px'
            });

            $drag_pointer.data('pos', { x: x, y : y});

            caculateHSV()
            setInputColor();
        }

        function scale (startColor, endColor, t) {
            var obj = {
                r : parseInt(startColor.r + (endColor.r - startColor.r) * t, 10) ,
                g : parseInt(startColor.g + (endColor.g - startColor.g) * t, 10),
                b : parseInt(startColor.b + (endColor.b - startColor.b) * t, 10)
            };

            return color.format(obj, 'hex');

        }

        function checkHueColor(p) {
            var startColor, endColor;

            for(var i = 0; i < hue_color.length;i++) {
                if (hue_color[i].start >= p) {
                    startColor = hue_color[i-1];
                    endColor = hue_color[i];
                    break;
                }
            }

            if (startColor && endColor) {
                return scale(startColor, endColor, (p - startColor.start)/(endColor.start - startColor.start));
            }

            return hue_color[0].rgb;
        }

        function setBackgroundColor (color) {
            $color.css("background-color", color);
        }

        function setCurrentH (h) {
            currentH = h;
        }

        function setHueColor(e) {
            var min = $hueContainer.offset().left;
            var max = min + $hueContainer.width();
            var current = e ? pos(e).clientX : min + (max - min) * (currentH / 360);

            var dist;
            if (current < min) {
                dist = 0;
            } else if (current > max) {
                dist = 100;
            } else {
                dist = (current - min) / (max - min) * 100;
            }

            var x = ($hueContainer.width() * (dist/100));

            $drag_bar.css({
                left: (x -Math.round($drag_bar.width()/2)) + 'px'
            });

            $drag_bar.data('pos', { x : x});

            var hueColor = checkHueColor(dist/100);

            setBackgroundColor(hueColor);
            setCurrentH((dist/100) * 360);
            setInputColor();
        }

        function getCssValuePrefix()
        {
            var rtrnVal = '';//default to standard syntax
            var prefixes = ['', '-o-', '-ms-', '-moz-', '-webkit-'];

            // Create a temporary DOM object for testing
            var dom = document.createElement('div');

            for (var i = 0; i < prefixes.length; i++)
            {
                // Attempt to set the style
                dom.style.background = prefixes[i] + 'linear-gradient(#000000, #ffffff)';

                // Detect if the style was successfully set
                if (dom.style.background)
                {
                    rtrnVal = prefixes[i];
                }
            }

            dom = null;
            delete dom;

            return rtrnVal;
        }

        function setOpacityColorBar(hueColor) {
            var rgb = color.parse(hueColor);

            rgb.a = 0;
            var start = color.format(rgb, 'rgb');

            rgb.a = 1;
            var end = color.format(rgb, 'rgb');

            var prefix = cssPrefix;
            $opacityColorBar.css('background',  'linear-gradient(to right, ' + start + ', ' + end + ')');
        }

        function setOpacity(e) {
            var min = $opacityContainer.offset().left;
            var max = min + $opacityContainer.width();
            var current = pos(e).clientX;
            var dist;

            if (current < min) {
                dist = 0;
            } else if (current > max) {
                dist = 100;
            } else {
                dist = (current - min) / (max - min) * 100;
            }

            var x = ($opacityContainer.width() * (dist/100));

            $opacity_drag_bar.css({
                left: (x -Math.ceil($opacity_drag_bar.width()/2)) + 'px'
            });

            $opacity_drag_bar.data('pos', { x : x });

            caculateOpacity();
            setInputColor();
        }

        function caculateOpacity() {
            var opacityPos = $opacity_drag_bar.data('pos') || { x : 0 };
            var a = Math.round((opacityPos.x / $opacityContainer.width()) * 100) / 100;

            currentA = isNaN(a) ? 1 : a;
        }

        function caculateHSV() {
            var pos = $drag_pointer.data('pos') || { x : 0, y : 0 };
            var huePos = $drag_bar.data('pos') || { x : 0 };

            var width = $color.width();
            var height = $color.height();

            var h = (huePos.x / $hueContainer.width()) * 360;
            var s = (pos.x / width);
            var v = ((height - pos.y) / height);

            if (width == 0) {
                h = 0;
                s = 0;
                v = 0;
            }

            currentH = h;
            currentS = s;
            currentV = v;
        }

        function pos(e) {
            if (e.touches && e.touches[0]) {
                return e.touches[0];
            }

            return e;
        }

        function parseAsNumber(el, parser) {
            const num = parser(el.value);
            if (!isNaN(num)) {
                el.value = num;
                return true;
            }
        }

        function validateInput(el) {
            const isAlpha = el.matches('.rgb-a input, .hsl-a input');
            let isValid = (isAlpha || el.value.trim()) && el.checkValidity();
            if (!isAlpha && !isValid && el.matches('.rgb input')) {
                isValid = parseAsNumber(el, parseInt);
            } else if (isAlpha && !isValid) {
                isValid = parseAsNumber(el, parseFloat);
            }
            if (isAlpha && isValid) {
                isValid = lastOutputColor !== color.format({
                    r: $rgb_r.int(),
                    g: $rgb_g.int(),
                    b: $rgb_b.int(),
                    h: parseFloat($hsl_h),
                    s: parseFloat($hsl_s),
                    l: parseFloat($hsl_l),
                    a: parseFloat(el.value),
                }, $information.data('format'));
            }
            return isValid;
        }

        function getVisibleColorInputs(format = $information.data('format')) {
            return Array.prototype.slice.call(
                $information.el.querySelectorAll(`.information-item.${format} input`)
            );
        }

        function updateColorFromInput(e) {
            const format = $information.data('format');
            const inputs = getVisibleColorInputs(format);
            if (!inputs.every(validateInput)) {
                return;
            }
            userActivity = true;
            let colorObj, hex, r, g, b, h, s, l, a;
            switch (format) {
                case 'hex':
                    initColor(inputs[0].value.trim(), format);
                    return;
                case 'rgb':
                    ([r, g, b, a] = inputs.map(el => parseFloat(el.value)));
                    colorObj = {r, g, b, a};
                    break;
                case 'hsl':
                    ([h, s, l, a] = inputs.map(el => parseFloat(el.value)));
                    colorObj = {h, s, l, a};
                    break;
            }
            initColor(color.format(colorObj, format));
        }

        function setColorUI() {
            var  x = $color.width() * currentS, y = $color.height() * ( 1 - currentV );

            $drag_pointer.css({
                left : (x - 5) + "px",
                top : (y - 5) + "px"
            });

            $drag_pointer.data('pos', { x  : x, y : y });

            var hueX = $hueContainer.width() * (currentH / 360);

            $drag_bar.css({
                left : (hueX - 7.5) + 'px'
            });

            $drag_bar.data('pos', { x : hueX });

            var opacityX = $opacityContainer.width() * (isNaN(currentA) ? 1 : currentA);

            $opacity_drag_bar.css({
                left : (opacityX - 7.5) + 'px'
            });

            $opacity_drag_bar.data('pos', { x : opacityX });
        }

        function setCurrentHSV (h, s, v, a) {
            currentA = a;
            currentH = h;
            currentS = s;
            currentV = v;
        }

        function setCurrentFormat (format) {
            $information.data('format', format);
            initFormat();
        }



        function initColor(newColor) {
            var c = newColor || "#FF0000", colorObj = color.parse(c);

            setCurrentFormat(colorObj.type);
            setBackgroundColor(c);

            var hsv = color.RGBtoHSV(colorObj.r, colorObj.g, colorObj.b);

            setCurrentHSV(hsv.h, hsv.s, hsv.v, colorObj.a);
            setColorUI();
            setHueColor();
        }

        function addEvent (dom, eventName, callback) {
            dom.addEventListener(eventName, callback);
        }

        function removeEvent(dom, eventName, callback) {
            dom.removeEventListener(eventName, callback);
        }

        function EventDialogKeyDown(e) {
            if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                switch (e.which) {
                    case 13:
                        colorpickerCallback(getFormattedColor());
                        // fall through to 27
                    case 27:
                        e.preventDefault();
                        e.stopPropagation();
                        hide();
                        break;
                }
            }
        }

        function EventColorMouseDown(e) {
            $color.data('isDown', true);
            userActivity = true;
            setMainColor(e);
        }

        function EventColorMouseUp(e) {
            $color.data('isDown', false);
        }

        function EventDragBarMouseDown (e) {
            e.preventDefault();
            userActivity = true;
            $hue.data('isDown', true);
        }

        function EventOpacityDragBarMouseDown(e) {
            e.preventDefault();
            userActivity = true;
            $opacity.data('isDown', true);
        }

        function EventHueMouseDown (e) {
            $hue.data('isDown', true);
            userActivity = true;
            setHueColor(e);
        }

        function EventOpacityMouseDown (e) {
            $opacity.data('isDown', true);
            userActivity = true;
            setOpacity(e);
        }

        function EventFormatChangeClick(e) {
            userActivity = true;
            nextFormat();
        }

        function initEvent() {
            window.addEventListener('keydown', EventDialogKeyDown, true);
            addEvent($root.el, 'input', updateColorFromInput);
            addEvent($color.el, 'mousedown', EventColorMouseDown);
            addEvent($color.el, 'mouseup', EventColorMouseUp);
            addEvent($drag_bar.el, 'mousedown', EventDragBarMouseDown);
            addEvent($opacity_drag_bar.el, 'mousedown', EventOpacityDragBarMouseDown);
            addEvent($hueContainer.el, 'mousedown', EventHueMouseDown);
            addEvent($opacityContainer.el, 'mousedown', EventOpacityMouseDown);

            addEvent(document, 'mouseup', EventDocumentMouseUp);
            addEvent(document, 'mousemove', EventDocumentMouseMove);

            addEvent($formatChangeButton.el, 'click', EventFormatChangeClick)
        }

        function checkColorPickerClass(el) {
            var hasColorView = new dom(el).closest('codemirror-colorview');
            var hasColorPicker = new dom(el).closest('codemirror-colorpicker');
            var hasCodeMirror = new dom(el).closest('CodeMirror');
            var IsInHtml = el.nodeName == 'HTML';

            return !!(hasColorPicker || hasColorView || hasCodeMirror);
        }

        function checkInHtml (el) {
            var IsInHtml = el.nodeName == 'HTML';

            return IsInHtml;
        }

        function EventDocumentMouseUp (e) {
            $color.data('isDown', false);
            $hue.data('isDown', false);
            $opacity.data('isDown', false);

            // when color picker clicked in outside
            if (checkInHtml(e.target)) {
                //setHideDelay(hideDelay);
            } else if (checkColorPickerClass(e.target) == false ) {
                hide();
            }

        }

        function EventDocumentMouseMove(e) {
            if ($color.data('isDown')) {
                setMainColor(e);
            }

            if ($hue.data('isDown')) {
                setHueColor(e);
            }

            if ($opacity.data('isDown')) {
                setOpacity(e);
            }
        }

        function destroy() {
            window.removeEventListener('keydown', EventDialogKeyDown, true);
            removeEvent($root.el, 'input', updateColorFromInput());
            removeEvent($color.el, 'mousedown', EventColorMouseDown);
            removeEvent($color.el, 'mouseup', EventColorMouseUp);
            removeEvent($drag_bar.el, 'mousedown', EventDragBarMouseDown);
            removeEvent($opacity_drag_bar.el, 'mousedown', EventOpacityDragBarMouseDown);
            removeEvent($hueContainer.el, 'mousedown', EventHueMouseDown);
            removeEvent($opacityContainer.el, 'mousedown', EventOpacityMouseDown);
            removeEvent(document, 'mouseup', EventDocumentMouseUp);
            removeEvent(document, 'mousemove', EventDocumentMouseMove);
            removeEvent($formatChangeButton.el, 'click', EventFormatChangeClick);

            // remove color picker callback
            colorpickerCallback = undefined;
        }

        function initFormat () {
            var current_format = $information.data('format') || 'hex';

            $information.removeClass('hex');
            $information.removeClass('rgb');
            $information.removeClass('hsl');
            $information.addClass(current_format);
        }

        function nextFormat() {
            var current_format = $information.data('format') || 'hex';

            var next_format = 'hex';
            if (current_format == 'hex') {
                next_format = 'rgb';
            } else if (current_format == 'rgb') {
                next_format = 'hsl';
            } else if (current_format == 'hsl') {
                next_format = 'hex';
            }
            currentA = isNaN(currentA) ? 1 : currentA;

            $information.removeClass(current_format);
            $information.addClass(next_format);
            $information.data('format', next_format);

            setInputColor();
        }

        function makeInputField(type) {
            var item = new dom('div', 'information-item '+ type);
            const alphaPattern = /^\s*(0+\.?|0*\.\d+|0*1\.?|0*1\.0*)?\s*$/.source;

            if (type == 'hex') {
                var field = new dom('div', 'input-field hex');

                $hexCode = new dom('input', 'input', { type: 'text', spellcheck: false,
                    pattern: /^\s*#([a-fA-F\d]{3}([a-fA-F\d]([a-fA-F\d]{2}([a-fA-F\d]{2})?)?)?)\s*$/.source });

                field.append($hexCode);
                field.append(new dom('div', 'title').setText('HEX'));

                item.append(field);

            } else if (type == 'rgb') {
                var field = new dom('div', 'input-field rgb-r');
                $rgb_r = new dom('input', 'input', { type: 'number', min: 0, max: 255, step: 1 });

                field.append($rgb_r);
                field.append(new dom('div', 'title').setText('R'));

                item.append(field);

                field = new dom('div', 'input-field rgb-g');
                $rgb_g = new dom('input', 'input', { type: 'number', min: 0, max: 255, step: 1 });

                field.append($rgb_g);
                field.append(new dom('div', 'title').setText('G'));

                item.append(field);

                field = new dom('div', 'input-field rgb-b');
                $rgb_b = new dom('input', 'input', { type: 'number', min: 0, max: 255, step: 1 });

                field.append($rgb_b);
                field.append(new dom('div', 'title').setText('B'));

                item.append(field);

                // rgba
                field = new dom('div', 'input-field rgb-a');
                $rgb_a = new dom('input', 'input', { type: 'text', pattern: alphaPattern, spellcheck: false });

                field.append($rgb_a);
                field.append(new dom('div', 'title').setText('A'));

                item.append(field);

            } else if (type == 'hsl') {
                var field = new dom('div', 'input-field hsl-h');
                $hsl_h = new dom('input', 'input', { type: 'number', step: 1 });

                field.append($hsl_h);
                field.append(new dom('div', 'title').setText('H'));

                item.append(field);

                field = new dom('div', 'input-field hsl-s');
                $hsl_s = new dom('input', 'input', { type: 'number', min: 0, max: 100, step: 1 });

                field.append($hsl_s);
                field.append(new dom('div', 'title').setText('S'));

                item.append(field);

                field = new dom('div', 'input-field hsl-l');
                $hsl_l = new dom('input', 'input', { type: 'number', min: 0, max: 100, step: 1 });

                field.append($hsl_l);
                field.append(new dom('div', 'title').setText('L'));

                item.append(field);

                // rgba
                field = new dom('div', 'input-field hsl-a');
                $hsl_a = new dom('input', 'input', { type: 'text', pattern: alphaPattern, spellcheck: false });

                field.append($hsl_a);
                field.append(new dom('div', 'title').setText('A'));

                item.append(field);
            }

            return item;
        }

        function init() {
            $body = new dom(document.body);

            $root = new dom('div', 'codemirror-colorpicker');
            $color = new dom('div', 'color');
            $drag_pointer = new dom('div', 'drag-pointer' );
            $value = new dom( 'div', 'value' );
            $saturation = new dom('div', 'saturation' );

            $control = new dom('div', 'control' );
            $controlPattern = new dom('div', 'empty' );
            $controlColor = new dom('div', 'color' );
            $hue = new dom('div', 'hue' );
            $hueContainer = new dom('div', 'hue-container' );
            $drag_bar = new dom('div', 'drag-bar' );
            $opacity = new dom('div', 'opacity' );
            $opacityContainer = new dom('div', 'opacity-container' );
            $opacityColorBar = new dom('div', 'color-bar' );

            $opacity_drag_bar = new dom('div', 'drag-bar2' );

            $information = new dom('div', 'information hex' );

            $informationChange = new dom('div', 'information-change');

            $formatChangeButton = new dom('button', 'format-change-button', { type : 'button'}).setText('↔');
            $informationChange.append($formatChangeButton);


            $information.append(makeInputField('hex'));
            $information.append(makeInputField('rgb'));
            $information.append(makeInputField('hsl'));
            $information.append($informationChange);


            $value.append($drag_pointer);
            $saturation.append($value);
            $color.append($saturation);

            $hueContainer.append($drag_bar);
            $hue.append($hueContainer);

            $opacityContainer.append($opacityColorBar);
            $opacityContainer.append($opacity_drag_bar);
            $opacity.append($opacityContainer);

            $control.append($hue);
            $control.append($opacity);
            $control.append($controlPattern);
            $control.append($controlColor);

            $root.append($color);
            $root.append($control);
            $root.append($information);

            initHueColors();
            //initEvent();
            initColor();
        };

        function initHueColors () {
            for(var i = 0, len = hue_color.length; i < len; i++) {
                var hue = hue_color[i];

                var obj = color.parse(hue.rgb);

                hue.r = obj.r;
                hue.g = obj.g;
                hue.b = obj.b;
            }
        }

        /**
         * public methods
         */
        function setColor(value) {
            if(typeof(value) == "object") {
                if(!value.r || !value.g || !value.b)
                    return;

                initColor(color.format(value, "hex"));
            } else if(typeof(value) == "string") {
                if(value.charAt(0) != "#")
                    return;

                initColor(value);
            }
        }

        function getColor(type) {
            caculateHSV();
            var rgb = convertRGB();

            if (type) {
                return color.format(rgb, type);
            }

            return rgb;
        }

        function definePosition (opt) {

            var width = $root.width();
            var height = $root.height();

            // set left position for color picker
            var elementScreenLeft = opt.left - $body.el.scrollLeft ;
            const bodyWidth = document.body.scrollWidth;
            if (width + elementScreenLeft > bodyWidth) {
                elementScreenLeft -= (width + elementScreenLeft) - bodyWidth;
            }
            if (elementScreenLeft < 0) { elementScreenLeft = 0; }

            // set top position for color picker
            var elementScreenTop = opt.top - $body.el.scrollTop ;
            if (height + elementScreenTop > window.innerHeight) {
                elementScreenTop -= (height + elementScreenTop) - window.innerHeight;
            }
            if (elementScreenTop < 0) { elementScreenTop = 0; }

            // set position
            $root.css({
                left : elementScreenLeft + 'px',
                top : elementScreenTop + 'px'
            });
        }

        function show (opt, color,  callback) {
            initEvent();
            $root.appendTo(document.body);

            $root.css({
                position: 'fixed',  // color picker has fixed position
                left : '-10000px',
                top : '-10000px'
            });

            $root.show();

            definePosition(opt);

            isColorPickerShow = true;

            isShortCut = opt.isShortCut || false;

            lastOutputColor = color;
            prevFocusedElement = document.activeElement;
            $formatChangeButton.el.title = opt.tooltipForSwitcher || '';

            initColor(color);
            getVisibleColorInputs().pop().focus();

            // define colorpicker callback
            colorpickerCallback = function (colorString) {
                if (getVisibleColorInputs().every(el => el.checkValidity())) {
                    lastOutputColor = colorString.replace(/\b0\./g, '.');
                    callback(lastOutputColor);
                }
            }

            // define hide delay
            hideDelay = opt.hideDelay || 2000;
            if (hideDelay > 0) {
                setHideDelay(hideDelay);
            }
        }


        var timerCloseColorPicker;
        var timerFadeColorPicker;
        function setHideDelay (delayTime) {
            delayTime = delayTime || 0;
            removeEvent($root.el, 'mouseenter');
            removeEvent($root.el, 'mouseleave');

            addEvent($root.el, 'mouseenter', function () {
                clearTimeout(timerCloseColorPicker);
                clearTimeout(timerFadeColorPicker);
                if ($root.el.dataset.fading) {
                  delete $root.el.dataset.fading;
                }
            });

            addEvent($root.el, 'mouseleave', function () {
                clearTimeout(timerFadeColorPicker);
                timerFadeColorPicker = setTimeout(fade, delayTime / 2);
            });

            clearTimeout(timerFadeColorPicker);
            timerFadeColorPicker = setTimeout(fade, delayTime / 2);

            function fade() {
                clearTimeout(timerCloseColorPicker);
                if (userActivity && $root.el.contains(document.activeElement)) {
                    return;
                }
                $root.el.dataset.fading = true;
                timerCloseColorPicker = setTimeout(hide, delayTime);
            }
        }

        function hide () {
            if (isColorPickerShow) {
                destroy();
                $root.hide();
                $root.remove();
                isColorPickerShow = false;
                if (prevFocusedElement) {
                    prevFocusedElement.focus();
                    prevFocusedElement = null;
                }
            }

        }

        init();

        return {
            isShortCut : function () {
                return isShortCut;
            },
            $root: $root,
            show: show,
            hide: hide,
            setColor: setColor,
            getColor: getColor
        }
    })

});
