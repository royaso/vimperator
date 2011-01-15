// vim: set sw=4 ts=4 fdm=marker et :
var INFO = //{{{
<plugin name="piyo-ui" version="0.0.1"
        href="http://github.com/caisui/vimperator/blob/master/plugin/piyo-ui.js"
        summary="piyo ui"
        xmlns="http://vimperator.org/namespaces/liberator">
    <author href="http://d.hatena.ne.jp/caisui">caisui</author>
    <license href="http://www.opensource.org/licenses/bsd-license.php">New BSD License</license>
    <project name="Vimperator" minVersion="3.0"/>
    <item>
        <description>
            ...
        </description>
    </item>
</plugin>;
//}}}

function log() Application.console.log(Array.concat("piyo:", Array.splice(arguments, 0)))

let fx3 = /^3/.test(Application.version);
let disabledFixed = liberator.globalVariables.piyo_disabled_fixed;
let piyo = this;

let PiyoCommands = Class("PiyoCommands", Commands, {
    init: function (array) {
        if (array instanceof Array) {
            let ignore = [];
            this._exCommands = Array.concat(array).filter(function (c) {
                if (c instanceof PiyoGuardCommand) {
                    ignore.push(c);
                    return false;
                } else return !ignore.some(function (cmd) c.hasName(cmd.name));
            });
        } else this._exCommands = [];
    },
    completer: function (context) {
        this.ex.call({
            __proto__: completion,
            command: this.command
        }, context);
    },
    addGuadCommand: function (spec) this._addCommand(PiyoGuardCommand(spec))
}, {
    commonCommands: function (commands) {
        if (commands.length === 0) return PiyoCommands();
        else if(commands.length === 1) return commands[0]; // XXX: PiyoCommand(commands[0]._exCommands)?

        let exCommands = commands.map(function (c) c._exCommands);
        let top = exCommands.pop();
        let exCommand = top.filter(function (me) exCommands.some(function (other) other.hasName(me.name)));
        return PiyoCommands(exCommand);
    }
});
let PiyoGuardCommand = Class("PiyoGuardCommand", {
    init: Command.prototype.init,
    hasName: Command.prototype.hasName
});

PiyoCommands.prototype.__defineGetter__("ex", function () {
    let func = liberator.eval(<![CDATA[(function() base)()]]>.toString()
        .replace("base", completion.ex.toString()), {commands: this});
    this.__defineGetter__("ex", function() func);
    return func;
});
PiyoCommands.prototype.__defineGetter__("command", function () {
    let func = liberator.eval(<![CDATA[(function() base)()]]>.toString()
        .replace("base", completion.command.toString()), {commands: this});
    this.__defineGetter__("command", function() func);
    return func;
});
PiyoCommands.prototype.__defineGetter__("execute", function () {
    let func = liberator.eval(<![CDATA[(function() base)()]]>.toString()
        .replace("base", liberator.execute.toString()), {commands: this});
    let exe = function (args, modifiers) {
        func(args, modifiers, true);
    }
    this.__defineGetter__("execute", function() exe);
    return exe;
});

let PiyoUI = Class("PiyoUI", //{{{
{
    init: function (iframe, editor) {
        this.iframe = iframe;
        this._aliases = [];
        this._sources = [];
        this._stack = [];
        this._contexts = [];
        this.keep = false;
        this.original = "";
        this.index = 0;
        this.editor = editor;
        this.items = [];
        this._filter = "";

        function NOP() void 0
        this.__defineGetter__("NOP", function() NOP);

        let self = this;
        this._updateTimer = new Timer(300, 500, function () {
            if (self.filter !== self._filter) {
                log(self.filter);
                self.open(self.original, self.editor.value, this.modifiers);
            }
        });
        this._resizer = new Timer(100, 200, function () {
            let box = self.box;
            log("resize", box.style.height);
            if (box.style.height !== "0pt") {
                box.style.height = self.doc.height + "px";
                box.style.maxHeight = 0.5 * window.innerHeight + "px";
            }
        });
        this.iframe.addEventListener("resize", function () self._resizer.tell(), false);
    },
    get doc() this.iframe.contentDocument,
    get box() this.iframe.parentNode,
    get filter() this.editor.value,
    get selectedItem() this.items[this.index],
    get style() //{{{
        <![CDATA[
            body {
                overflow-x: hidden;
                font: Consolas;
            }
            #main {
                width: 100%;
            }
            tr:nth-child(odd) {
                background: #eee;
            }
            tr[selected] {
                background: #ffec8b;
                -moz-border-radius: 4px;
            }
            tr td:nth-last-child(1){
                width: 100%;
            }
            .mark {
                padding-left: 1ex;
                min-width: 1ex;
                max-width: 1ex;
                font-weight: bold;
                color: blue;
            }
            caption {
                text-align: left;
                font-weight: bold;
                background: -moz-linear-gradient(19% 75% 90deg, #DBDBDB, #D9D9D9, #E7E7E7 100%);
                padding: 0.5ex;
            }
        ]]>, //}}}
    open: function (source, input, modifiers) {
        if (!modifiers) modifiers = {};
        if ([modes.PIYO, modes.PIYO_I].indexOf(liberator.mode) < 0)
            modes.set(modes.PIYO);

        this.modifiers = modifiers;
        this.editor.value = input || "";

        this.original = source;

        let self = this;
        this._contexts = [];
        let items = [];

        // create context and context's items
        source.split(/\s+/).forEach(function _createSource(name) {
            if (self._aliases[name])
                self._aliases[name].forEach(_createSource);
            else {
                let source = self.createContext(self._sources[name], 0);
            }
        });

        // create ui
        let doc = this.doc;
        let style = doc.createElement("style");
        style.innerHTML = this.style;
        doc.body.innerHTML = "";
        doc.body.appendChild(style);
        let mark = doc.createElement("td");
        mark.classList.add("mark");

        if (this._contexts.length === 0) {
            liberator.echoerr("no create sources");
            return;
        }

        this._contexts.forEach(function (context) {
            if (context.items.length === 0) return;

            let node = doc.createElement("table");
            let title = doc.createElement("caption")
            title.textContent = context.title || "no name";
            node.appendChild(title);

            let highlighter = context.getHighlighter(self.editor.value);
            context.offset = items.length;
            context.items.forEach(function (item) {
                let hi = highlighter(item);
                if (hi) {
                    let view = util.xmlToDom(context.createView(item, highlighter(item)), doc);
                    view.classList.add("item");
                    node.appendChild(view);
                    let td = mark.cloneNode(false);
                    view.insertBefore(td, view.firstChild);
                    items.push(PiyoItem(item, view, context));
                }
            });
            context.itemLength = items.length - context.offset;
            doc.body.appendChild(node);
        });
        this.items = items;

        let iframe = this.iframe;
        let box = this.box;
        this.box.collapsed = false;

        box.style.height = doc.height + "px";
        box.style.maxHeight = 0.5 * window.innerHeight + "px";

        if (!disabledFixed)
            let (r = commandline._commandlineWidget.parentNode.getBoundingClientRect()) {
                box.style.bottom = r.height + "px";
                log(r.height);
            }

        this.index = 0;
        this._filter = this.filter;
        if (this.items.length > 0)
            this.selectedItem.select();
        else {
            box.style.height = "1em";
            doc.body.innerHTML = "(empty)";
        }

        util.nodeScrollIntoView(doc.body);
        if (liberator.mode == modes.PIYO)
            modes.show();
    },
    hide: function () {
        this.box.style.height = 0;
        window.setTimeout(function () ui.box.collapsed = true, 0);
    },
    refresh: function () this.open(this.original, this.filter, this.modifiers),
    quit: function () {
        this.modifiers = {};
        this.hide();
        modes.reset();
    },
    createContext: function (source, offset, proto) {
        if (typeof(source) === "string")
            source = this._sources[source];
        let context = source();
        if (proto) {
            update(context, proto);
        }
        context.filter = this.filter.substr(offset);
        context.ui = this;
        context.createItem(this);
        this._contexts.push(context);
        return context;
    },
    createSource: function (name, base, prop) {
        if (!prop) [base, prop] = [PiyoSource, base];
        else if (typeof(base) === "string") {
            let baseProto = this._sources[base]; 
            if (!baseProto) {
                liberator.echoerr(<>{base} is not found!</>);
                return;
            }
            base = baseProto;
        }
        let prop1 = {abstract: prop.abstract || false};
        delete prop.abstract;
        
        if (prop.commands) {
            let commands = PiyoCommands();
            prop.commands(commands);
            prop.commands = commands;
        }

        return Class(name, base, prop, prop1);
    },
    registerSource: function (name, base, prop) {
        this._sources[name] = this.createSource(name, base, prop);
    },
    unregisterSource: function (name) {
        delete this._sources[name];
    },
    scroll: function (index, relative) {
        if (relative) index += this.index;
        else if (index < 0) index = this.items.length - 1;
        index = Math.max(0, Math.min(this.items.length - 1, index));

        let item = this.selectedItem;
        item.unselect();

        item = this.items[this.index = index];
        item.select();
        util.nodeScrollIntoView(item.view, -1, -1);

        if (liberator.mode === modes.PIYO)
            modes.show();
    },
    scrollByPages: function (count) {
        let win = this.iframe.contentWindow;
        win.scrollByPages(count);

        let e = this.doc.elementFromPoint(4, count < 0 ? 4 : win.innerHeight - 4);
        while (e && e.classList && !e.classList.contains("item"))
            e = e.parentNode;

        // todo: caption
        let self = this;
        e && this.items.some(function (item, n) {
            if (item.view === e) {
                self.selectedItem.unselect();
                self.index = n;
                item.select();
                util.nodeScrollIntoView(e, -1, -1);

                if (liberator.mode === modes.PIYO)
                    modes.show();
                return true;
            }
            return false;
        });
    },
    addAlias: function (name, aliases) {
        this._aliases[name] = aliases;
    },
    execute: function (command, modifiers) {
        if (!modifiers) modifiers = this.modifiers;
        let self = this;
        let executed = this._contexts.reduce(function (a, source) {
            modifiers.items= self.items.filter(function (i) i.source === source && i.mark);
            if (modifiers.items.length)
                source.execute(command, modifiers);
            return a || modifiers.items.length > 0;
        }, false);
        if (!executed) {
            let item = this.selectedItem;
            modifiers.items = [item];
            item.source.execute(command, modifiers);
        }

        if (!modifiers.noquit)
            this.quit();
    },
    showHelp: function () {
        modes.push(modes.PIYO);
        let source = this.selectedItem.source;
        for (let attr in source.marks) {
            liberator.echo(attr);
        }
    },
    selectAll: function (isAll) {
        let mark = !this.items.some(function (i) i.mark);
        this.items.forEach(function (i) i.mark = mark);
    },
    selectReverse: function (isAll) {
        let source = this.selectedItem.source;
        (isAll ? this.items : this.items.filter(function (i) i.source === source))
            .forEach(function (i) i.toggleMark());
    },
    loadPiyo: function (file) {
        if (typeof(file) === "string") file = io.File(file);
        if (!/\.piyo$/.test(file.leafName) || !file.isFile()) return;
        let uri = services.get("io").newFileURI(file);
        let script = Script(file);
        log(<>load plugin: {file.leafName}</>);
        script.__defineGetter__("piyo", function() piyo);
        liberator.loadScript(uri.spec, script);
    },
    loadPiyos: function () {
        let dir = io.File(piyo.PATH).parent;
        dir.append("piyo");
        dir = io.File(dir);
        if (dir.exists() && dir.isDirectory()) {
            dir.readDirectory().forEach(this.loadPiyo);
        }
    },
    getCommands: function () {
        let items = ui.items;
        let commands = this._contexts.filter(function (c) {
                for(let i = c.offset, last = c.itemLength - c.offset; i < last; ++i) {
                    if (items[i].mark) return true;
                }
                return false;
            }).map(function (c) c._commands);
        return PiyoCommands.commonCommands(commands.length ? commands : [ui.selectedItem.source._commands]);
    },
    echo:    function () let(args = Array.splice(arguments, 0)) this.setTimeout(function () liberator.echo.apply(liberator, args), 0),
    echoerr: function () let(args = Array.splice(arguments, 0)) this.setTimeout(function () liberator.echoerr.apply(liberator, args), 0),
}, {
});
//}}}

let PiyoSource = Class("PiyoSource", //{{{
{
    init: function () {
        this.items  = [];
        
        if (this.onLoad) this.onLoad();

        let stack = [];
        let self = this;
        while (self) {
            if (self.hasOwnProperty("commands")) {
                stack.push(self.commands._exCommands);
                if (self.commands.stop)
                    break;
            }
            self = self.__proto__;
        }
        this._commands = PiyoCommands(Array.concat.apply(0, stack));
    },
    getHighlighter: function () {
        let filter = this.filter.trim();
        let keys = this.keys;
        if (keys.length === 0 || filter.length === 0)
            return function (item) {
                let val = {};
                keys.forEach(function (key) {
                    val[key] = let (x = item[key]) x instanceof Array ? x[0] : x;
                });
                return val;
            };
        let filter = filter;
        // required [{pos,len},...]
        let matchers = filter.split(" ")
            .map(this.matcher || util.regexpMatcher);
        let self = this;
        return function (item) {
            let hi_pos = {};
            let count = 0;

            function iterWords(item, keys) {
                let ret = {};
                let max = keys.length - 1;
                let stack = [];
                let top;

                function keyValueEach(index) {
                    let key = keys[index];
                    for (let [, val] in Iterator(Array.concat(item[key]))) {
                        ret[key] = val;
                        yield 1;
                    }
                    yield 0;
                }

                top = keyValueEach(stack.length);
                while (1) {
                    if (stack.length === max) {
                        for(let r in top) if (r) yield ret;
                        if (stack.length === 0) break;
                        top = stack.pop();
                    } else {
                        if (top.next()) {
                            stack.push(top);
                            top = keyValueEach(stack.length);
                        }
                        else if (stack.length === 0) break;
                        else top = stack.pop();
                    }
                }
            }
            for (let val in iterWords(item, keys)) {
                let ret = keys.reduce(function (r, v) {r[v] = []; return r;}, {});
                for (let attr in val) ret[attr] = [];
                let isMatch = !matchers.some(function (matcher) {
                    let isMatch = false;
                    for (let [attr, text] in Iterator(val)) {
                        let pos = matcher(text);
                        if (pos.length > 0) {
                            Array.prototype.push.apply(ret[attr], pos);
                            isMatch = true;
                        }
                    }
                    return !isMatch;
                });
                if (isMatch) {
                    let hi = {};
                    for (let [attr, text] in Iterator(val)) {
                        let a = ret[attr];
                        a.sort(function (a, b) a.pos - b.pos);
                        if (fx3) {
                            a = (function (a) {
                                for (let [, {pos: pos, len: len}] in Iterator(a)) yield [pos, len];
                            })(a);
                        }
                        hi[attr] = template.highlightSubstrings(text, a, template.filter);
                    }
                    return hi;
                } 
            }
            return null;
        };
    },
    execute: function (command, modifiers) {
        if (command === "default")
            command = this.default;
        this._commands.execute(command, modifiers);
    }
}, {
    getAttrValue: function (obj, attr, name) {
        while (obj) {
            if (obj.hasOwnProperty(attr)) {
                let prop = obj[attr];
                if (name in prop)
                    return prop[name] || null;
            }
            obj = obj.__proto__;
        }
        return null;
    },
    getAttrFlat: function (obj, attr) {
        let ret = {}, stack = [];
        while (obj) {
            if (obj.hasOwnProperty(attr))
                stack.push(obj[attr]);
            obj = obj.__proto__;
        }

        return stack.reduceRight(function (a, b) {
            for (let [attr, val] in Iterator(b))
                if (val === void 0)
                    delete a[attr];
                else
                    a[attr] = val;
            return a;
        }, {});
    }
}); //}}}

// XXX: add normal javascript command
PiyoSource.prototype.commands = PiyoCommands();
PiyoSource.prototype.commands._addCommand(commands.get("js"));

let PiyoItem = Class("PiyoItem", //{{{
{
    init: function (item, view, context) {
        this.item = item;
        this.view = view;
        this.source = context;
    },
    select: function () {
        this.view.setAttribute("selected", true);
    },
    unselect: function () {
        this.view.removeAttribute("selected");
    },
    get mark() !!this.view.firstChild.textContent,
    set mark(value) this.view.firstChild.textContent = value ? "*" : "",
    toggleMark: function () this.mark = !this.mark,
});//}}}

let onUnload = (function () // {{{
{
    // defined function {{{
    function proxyClass(obj, proxy) {
        let original = proxy.__proto__ = obj.__proto__;
        obj.__proto__ = proxy;
        return function () {
            obj.__proto__ = original;
        };
    }
    function domAddEventListener(dom, eventName, func, useCaputre) {
        dom.addEventListener(eventName, func, useCaputre);
        return function () dom.removeEventListener(eventName, func, useCaputre);
    }
    // }}}
    
    //{{{ hacked liberator module
        let uninstall = [];
        uninstall.__defineSetter__("$push", function (v) this.push(v));

        let _box = document.createElementNS(XUL, "vbox");
        _box.id = "liberator-piyo";
        _box.classList.add("liberator-container");
        _box.collapsed = true;
        _box.style.maxHeight = "256px";
        _box.style.height = "0";
        _box.style.MozTransition = "all 0.25s";
        //_box.style.maxHeight = "1%";

        if (!disabledFixed) {
            _box.style.position = "fixed";
            _box.style.left = "0";
            _box.style.width = "100%";
            _box.style.opacity = ".9";
        }

        uninstall.$push = function () let (p = _box.parentNode) p && p.removeChild(_box);

        //let bottom = document.getElementById("liberator-bottombar");
        //let bottom = document.querySelector("#liberator-bottombar, window>stack.liberator-container");
        //let bottom = document.querySelector("window>vbox.liberator-container");
        let bottom = document.getElementById("liberator-multiline-output").parentNode;
        let p = bottom.parentNode;
        p.insertBefore(_box, bottom);

        let iframe = document.createElementNS(XUL, "iframe");
        iframe.id = _box.id + "-iframe";
        iframe.flex = 1;
        iframe.style.backgroundColor = "white";
        iframe.style.color = "black";

        iframe.style.height = "100%";
        iframe.style.width  = "100%";
        self.iframe = iframe;

        _box.appendChild(iframe);
        let onceIframe = domAddEventListener(iframe, "load", function () {
            iframe.contentDocument.body.id = "liberator-completions-content";
            onceIframe();
        }, true);
        iframe.setAttribute("src", "chrome://liberator/content/buffer.xhtml");

        uninstall.$push = proxyClass(modules.events, {
            onFocusChange: function (event) {
                log("mode", liberator.mode);
                if ([modes.PIYO, modes.PIYO_I].indexOf(liberator.mode) >= 0) {
                    if(liberator.focus) Application.console.log(liberator.focus.id);

                    return;
                }
                this.__proto__.__proto__.onFocusChange.apply(this, arguments);
            },
            //onKeyPress: function (event) {
            //    if (liberator.mode === modes.PIYO) {
            //        if (ui.onEvent(event)) {
            //            event.preventDefault();
            //            event.stopPropagation();
            //            return;
            //        }
            //    }
            //    this.__proto__.__proto__.onKeyPress.apply(this, arguments);
            //}
        });

        if (fx3) {
            template.filter = function (str) <span highlight="Filter">{str}</span>;
            modules.commandline.show = function () {
                this._commandlineWidget.collapsed = false;
                this._commandWidget.focus();
            };
        }
        uninstall.$push = proxyClass(modules.commandline, {
            onEvent: function (event) {
                if ([modes.PIYO, modes.PIYO_I].indexOf(liberator.mode) >= 0) {
                    log(event.type);
                    if (liberator.mode === modes.PIYO) {
                        if (event.type === "focus" && liberator.mode === modes.PIYO
                            && ui.editor.compareDocumentPosition(liberator.focus) & Node.DOCUMENT_POSITION_CONTAINED_BY)
                            modes.set(modes.PIYO_I, modes.NONE, true);
                        event.preventDefault();
                        event.stopPropagation();
                    } else {
                        ui._updateTimer.tell();
                    }
                } else {
                    this.__proto__.__proto__.onEvent.apply(this, arguments);
                }
            },
        });
    //}}}

    // {{{ mapping
    if (!modes.hasOwnProperty("PIYO")) {
        modes.addMode("PIYO", {char: "p"});
        modes.addMode("PIYO_I", {char: "pi", input: true, display: -1});
    }
    modes._modeMap[modes.PIYO].display =
        function() <>PIYO #{ui.editor.value}# [{ui.index + 1}/{ui.items.length}]</>;

    [ //mapping PIYO
        [["j"], "down", function (count) ui.scroll(Math.max(count,  1), true), {count: true}],
        [["k"], "up",   function (count) ui.scroll(-Math.max(count, 1), true), {count: true}],
        [["<C-f>"], "page scroll down", function (count) ui.scrollByPages( Math.max(count, 1)), {count: true}],
        [["<C-b>"], "page scroll up",   function (count) ui.scrollByPages(-Math.max(count, 1)), {count: true}],
        [["<Esc>"], "", function () {
            ui.quit();
        }],
        [["i"], "piyo insert mode", function () { commandline.show(); }],
        [["<Space>"], "mark mark", function () {
            ui.selectedItem.toggleMark();
            ui.scroll(1, true);
        }],
        [["<C-a>"], "select all", function () ui.selectAll()],
        [["<S-Space>"], "toggle mark previous", function () {
            ui.selectedItem.toggleMark();
            ui.scroll(-1, true);
        }],
        [["gg"], "", function() ui.scroll(0)],
        [["G"],  "", function() ui.scroll(-1)],
        [["?"], "", function() ui.showHelp()],
        [[":"], "kill key_open_vimbar", function () {
            let filter = ui.filter;
            let commands = ui.getCommands();

            commandline._commandlineWidget.style.opacity = "1";
            commandline.input(":", function (args) {
                ui.execute(args);
            }, {
                completer: function (context) {
                    commands.completer(context);
                },
                onCancel: function () {
                    commandline._setCommand(filter);
                    modes.set(modes.PIYO);
                }
            });
        }],
        [["zt"], "top",    function () util.nodeScrollIntoView(ui.selectedItem.view, 0,   -1)],
        [["zz"], "center", function () util.nodeScrollIntoView(ui.selectedItem.view, 50,  -1)],
        [["zb"], "bottom", function () util.nodeScrollIntoView(ui.selectedItem.view, 100, -1)],
        [["<Return>"], "execute default action", function () {
            ui.execute("default");
        }]
    ].forEach(function (m) {
        mappings.remove(modes.PIYO, m[0][0]);
        mappings.addUserMap.apply(mappings, [[modes.PIYO]].concat(m));
    });
    [ // mapping PIYO_I
        [["<C-n>"], "down", function () ui.scroll( 1, true)],
        [["<C-p>"], "up", function () ui.scroll(-1, true)],
        [["<Esc>", "<Return>"], "escape PIYO_I", function () modes.set(modes.PIYO)],
        [["<C-Return>"], "execute", function () { ui.execute(); }],
    ].forEach(function (m) {
        mappings.remove(modes.PIYO_I, m[0][0]);
        mappings.addUserMap.apply(mappings, [[modes.PIYO_I]].concat(m));
    });
    // }}}

    delete uninstall.$push;
    return function () {
        delete this.onUnload;
        uninstall.forEach(function (f) f());
    };
})(this); //}}}

let ui = PiyoUI(iframe, commandline._commandWidget);
let util = {
    __proto__: modules.util,
    nodeScrollIntoView: function nodeScrollIntoView(aNode, aVPercent, aHPercent) {
        if (!(aVPercent >= 0)) aVPercent = -1;
        if (!(aHPercent >= 0)) aHPercent = -1;
        var doc = aNode.ownerDocument;
        var win = doc.defaultView;
        var selection = win.getSelection();
        var ranges = function (selection) {
            var selection = win.getSelection();
            for(let i = 0, j = selection.rangeCount; i < j; ++i) {
                yield selection.getRangeAt(i);
            }
        };

        var back = [r for(r in ranges(selection))];
        selection.removeAllRanges();
        var r = doc.createRange();

        r.selectNode(aNode);
        selection.addRange(r);
        selection.QueryInterface(Ci.nsISelection2)
            .scrollIntoView(Ci.nsISelectionController.SELECTION_ANCHOR_REGION,
                    true, aVPercent, aHPercent);

        selection.removeAllRanges();

        for(let [,r] in Iterator(back)){
            selection.addRange(r);
        }
    },
    icon16: function (image) <img style="margin: 1px;max-height: 16px;" src={image}/>,
    regexpMatcher: function (word) {
        var re = new RegExp(word, "gi");
        return function (text) {
            re.lastIndex = 0;
            let list = [];
            while (m = re.exec(text))
                list.push({pos: m.index, len: m[0].length});
            return list;
        };
    },
    migemoMatcher: function (word) {
        var re = migemo.getRegExp(word, "gi");
        return function (text) {
            re.lastIndex = 0;
            let list = [];
            while (m = re.exec(text))
                list.push({pos: m.index, len: m[0].length});
            return list;
        };
    },
};

commands.addUserCommand(["piyo"], "piyo command", function (args) {
    ui.open(Array.join(args, " "), args["-i"] || "");
}, {
    options: [
        [["-i", "-input"], commands.OPTION_STRING],
        //[["-k", "-keep"],  commands.OPTION_NOARG],
    ],
    completer: function (context, args) {
        context.completions = [ [name, s.prototype.description || ""]
            for ([name, s] in Iterator(ui._sources)) if (!s.abstract)]
    },
}, true);

commands.addUserCommand(["loadpiyo"], "piyo load plugin", function (args) {
    if (args.length) ui.loadPiyos();
    else ui.loadPiyo(args[0]);
}, {
    literal: 0,
    completer: function (context) completion.file(context, true)
}, true);

ui.loadPiyos();
