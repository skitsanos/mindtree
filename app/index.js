/**
 * @version 1.0
 * @author skitsanos
 * https://github.com/nwjs/nw.js/wiki/how-to-package-and-distribute-your-apps
 */
const YAML = require('yaml');

const gui = require('nw.gui');

class MindmapParser
{
    constructor()
    {
        this.version = '1.0.1';
    }

    parseElement(datadoc, items)
    {
        for (const el of items['[]'])
        {
            let item = {};

            if (typeof el === 'object')
            {
                item = {name: el.name};

                if (Array.isArray(el['[]']))
                {
                    item.children = [];
                    this.parseElement(item, el);
                }
            }
            else
            {
                item = {name: el};
            }

            datadoc.children.push(item);
        }
    }

    parse(content)
    {
        try
        {
            const doc = YAML.parse(content, {prettyErrors: true});
            //console.log(JSON.stringify(doc, null, 3));

            let datadoc = {name: Object.keys(doc)[0], children: []};

            this.parseElement(datadoc, Object.values(doc)[0][0]);
            return [datadoc];
        } catch (e)
        {
            //
        }
    }
}

process.title = 'Mindtree';

const app = {
    context: {
        isDirty: false,
        path: undefined
    },
    ui: {
        currentWindow: gui.Window.get()
    },

    handlers: {
        chooseFile: (el_id, isSave) =>
        {
            return new Promise((resolve, reject) =>
            {
                let input = document.createElement('input');
                input.style.display = 'none';
                input.setAttribute('type', 'file');
                input.setAttribute('accept', '.yaml,text/yaml');

                if (isSave)
                {
                    input.setAttribute('nwsaveas', app.context.path);
                }

                document.body.appendChild(input);

                input.addEventListener('change', (evt) =>
                {
                    const value = evt.target.value;
                    document.body.removeChild(input);
                    return resolve(value);
                }, false);

                input.addEventListener('cancel', (evt) =>
                {
                    document.body.removeChild(input);
                    return resolve(undefined);
                }, false);

                input.click();
            });
        },

        resetToNew: () =>
        {
            $$('editor').setValue('');
            app.handlers.gotClean();
            app.context.path = undefined;
        },

        new: () =>
        {
            if (app.context.isDirty)
            {
                //sdk to save?
                webix.confirm({
                    title: 'Unsaved changes',
                    text: 'Would you like to keep your changes?',
                    ok: 'Yes, Save',
                    cancel: 'Nope'
                }).then(dialog_result =>
                {
                    app.handlers.save();
                }).fail(() =>
                {
                    app.handlers.resetToNew();
                });
            }
            else
            {
                app.handlers.resetToNew();
            }
        },

        save: () =>
        {
            const content_yaml = $$('editor').getValue();
            if (content_yaml.length === 0)
            {
                webix.message('Nothing to save...');
            }
            else
            {
                if (app.context.path === undefined)
                {
                    //Save as
                    app.handlers.chooseFile('fileOpen', true).then(result =>
                    {
                        app.context.path = result;
                        app.utils.saveContent(app.context.path, $$('editor').getValue()).then(() =>
                        {
                            app.handlers.gotClean();
                        }).catch(err =>
                        {
                            webix.message(err.message);
                        });
                    });
                }
                else
                {
                    //just save
                    app.utils.saveContent(app.context.path, $$('editor').getValue()).then(() =>
                    {
                        app.handlers.gotClean();
                    }).catch(err =>
                    {
                        webix.message(err.message);
                    });
                }
            }

            app.handlers.gotClean();
        },

        load: () =>
        {
            app.handlers.chooseFile('fileOpen').then(result =>
            {
                if (result !== undefined)
                {
                    const fs = nw.require('fs');
                    fs.readFile(result, 'utf8', function (err, txt)
                    {
                        if (err)
                        {
                            console.error(err);
                            return;
                        }

                        $$('editor').setValue(txt);
                        app.handlers.gotClean();

                        app.context.path = result;

                        $$('editor').focus();
                    });
                }
            });
        },

        gotClean: () =>
        {
            app.context.isDirty = false;

            const button = $$('buttonSave');
            button.config.badge = '';
            button.refresh();
        },

        gotDirty: (editor, e) =>
        {
            app.context.isDirty = true;

            const button = $$('buttonSave');
            button.config.badge = '*';
            button.refresh();

            const content = editor.getValue();

            const mind = new MindmapParser();
            const data = mind.parse(content);
            if (data === undefined)
            {
                return;
            }

            app.utils.renderChart(data);
        },

        print: () =>
        {
            const cvs = document.getElementsByTagName('canvas')[0];
            if (cvs !== undefined)
            {
                const dataUrl = cvs.toDataURL();
                const screen_center = app.utils.getScreenCenter();
                const win_print = window.open('', 'Print', `height=800,width=800,left=${screen_center.x - 400},top=${screen_center.y - 300}`);

                win_print.document.write(`<html><head></head><style type="text/css">html,body{margin: 0}</style><link href="https://fonts.googleapis.com/css?family=Quicksand:300,400|Roboto" rel="stylesheet"><title>${app.utils.getFileName(app.context.path)}</title>`);
                win_print.document.write('</head><body>');
                win_print.document.write(cvs.outerHTML);
                //win_print.document.write(`<img id="imageData" src="${dataUrl}"/>`);
                win_print.document.write('</body></html>');
                win_print.document.close();

                const c = win_print.document.getElementsByTagName('canvas')[0];
                c.getContext('2d').drawImage(cvs, 0, 0);

                win_print.focus();
                win_print.print();
                win_print.close();
            }
        }
    },

    utils: {
        getScreenSize: () =>
        {
            return {width: window.screen.availWidth, height: window.screen.availHeight};
        },

        getScreenCenter: () =>
        {
            return {x: (window.screen.availWidth / 2).toFixed(0), y: (window.screen.availHeight / 2).toFixed(0)};
        },

        renderChart: (data) =>
        {
            app.ui.chart.showLoading();

            app.ui.chart.setOption({
                textStyle: {
                    fontFamily: 'Roboto, serif'
                },

                series: [
                    {
                        type: 'tree',

                        label: {
                            position: 'right',
                            verticalAlign: 'middle',
                            align: 'left',
                            color: '#fff',
                            lineHeight: 20,
                            padding: [3, 7, 3, 7],
                            backgroundColor: '#6035',
                            borderRadius: 3,
                            shadowColor: '#666',
                            shadowBlur: 7,
                            shadowOffsetX: 3,
                            shadowOffsetY: 3
                        },

                        lineStyle: {
                            curveness: 0.5
                        },

                        symbolSize: 10,

                        initialTreeDepth: -1,

                        animationDurationUpdate: 750,

                        expandAndCollapse: true,

                        data: data
                    }
                ]
            });

            app.ui.chart.hideLoading();
        },

        saveContent: (file_path, content) =>
        {
            return new Promise((resolve, reject) =>
            {
                const fs = nw.require('fs');
                fs.writeFile(file_path, content, (err) =>
                {
                    if (err)
                    {
                        return reject(err);
                    }
                    else
                    {
                        return resolve();
                    }
                });
            });
        },

        getFileName: (p) =>
        {
            const path = nw.require('path');
            return path.basename(p, '.yaml');
        }
    }
};

webix.ready(() =>
{
    if (webix.CustomScroll && !webix.env.touch)
    {
        webix.CustomScroll.init();
    }

    webix.protoUI({
        name: "codemirror-editor",
        defaults: {
            mode: "javascript",
            lineNumbers: true,
            matchBrackets: true,
            theme: "default",
            onChange: function (editor, e)
            {
            }
        },
        $init: function (config)
        {
            this.$view.innerHTML = "<textarea style='width:100%;height:100%;'></textarea>";
            this._waitEditor = webix.promise.defer();
            this.$ready.push(this._render_cm_editor);
        },
        _render_cm_editor: function ()
        {
            webix.require("https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/codemirror.css");
            const deps = [
                "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/codemirror.min.js"
            ];

            if (this.config.mode === "htmlmixed")
            {
                deps.push("https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/xml.js");
                deps.push("https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/css.js");
                deps.push("https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/javascript.js");
            }
            if (this.config.matchBrackets)
            {
                deps.push("https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0//addon/edit/matchbrackets.js");
            }

            deps.push("https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/mode/" + this.config.mode + "/" + this.config.mode + ".js");
            webix.require(deps, this._render_when_ready, this);
        },
        _render_when_ready: function ()
        {
            this._editor = CodeMirror.fromTextArea(this.$view.firstChild, {
                mode: this.config.mode,
                lineNumbers: this.config.lineNumbers,
                matchBrackets: this.config.matchBrackets,
                theme: this.config.theme
            });

            this._waitEditor.resolve(this._editor);

            this._editor.on("change", this.config.onChange);

            this.setValue(this.config.value);
            if (this._focus_await)
            {
                this.focus();
            }
        },
        _set_inner_size: function ()
        {
            if (!this._editor || !this.$width)
            {
                return;
            }

            this._updateScrollSize();
            this._editor.scrollTo(0, 0); //force repaint, mandatory for IE
        },
        _updateScrollSize: function ()
        {
            let box = this._editor.getWrapperElement();
            let height = (this.$height || 0) + "px";

            box.style.height = height;
            box.style.width = (this.$width || 0) + "px";

            let scroll = this._editor.getScrollerElement();
            if (scroll.style.height !== height)
            {
                scroll.style.height = height;
                this._editor.refresh();
            }
        },
        $setSize: function (x, y)
        {
            if (webix.ui.view.prototype.$setSize.call(this, x, y))
            {
                this._set_inner_size();
            }
        },
        setValue: function (value)
        {
            if (!value && value !== 0)
            {
                value = "";
            }

            this.config.value = value;
            if (this._editor)
            {
                this._editor.setValue(value);
                //by default - clear editor's undo history when setting new value
                if (!this.config.preserveUndoHistory)
                {
                    this._editor.clearHistory();
                }
                this._updateScrollSize();
            }
        },
        getValue: function ()
        {
            return this._editor ? this._editor.getValue() : this.config.value;
        },
        focus: function ()
        {
            this._focus_await = true;
            if (this._editor)
            {
                this._editor.focus();
            }
        },
        getEditor: function (waitEditor)
        {
            return waitEditor ? this._waitEditor : this._editor;
        },
        //undo, redo, etc
        undo: function ()
        {
            this._editor.undo();
        },
        redo: function ()
        {
            this._editor.redo();
        },
        undoLength: function ()
        {
            return this._editor.historySize().undo;
        }
    }, webix.ui.view);

    webix.protoUI({
        name: "chartview",
        $setSize: function (x, y)
        {
            webix.ui.template.prototype.$setSize.call(this, x, y);

            const charts_id = this.getNode().getAttribute('_echarts_instance_');
            if (charts_id !== null && charts_id !== undefined)
            {
                window.echarts.getInstanceById(charts_id).resize();
            }
        }
    }, webix.ui.template);

    const ui = webix.ui({
        rows: [
            {
                view: 'toolbar',
                css: "webix_dark",
                height: 66,
                margin: 20,
                paddingX: 10,
                elements: [
                    {
                        type: 'clean',
                        template: '<span class="mdi mdi-tree"></span>Mindtree',
                        width: 200,
                        css: 'middle app_header'
                    },
                    {gravity: 4},
                    {
                        view: "button",
                        width: 66,
                        type: "iconButtonTop",
                        icon: "mdi mdi-file-document",
                        label: "New",
                        on: {
                            onItemClick: app.handlers.new
                        }
                    },
                    {
                        view: "button",
                        id: 'buttonSave',
                        width: 66,
                        type: "iconButtonTop",
                        icon: "mdi mdi-content-save",
                        label: "Save",
                        on: {
                            onItemClick: app.handlers.save
                        }
                    },
                    {
                        view: "button",
                        width: 66,
                        type: "iconButtonTop",
                        icon: "mdi mdi-folder-open",
                        label: "Open",
                        on: {
                            onItemClick: app.handlers.load
                        }
                    },
                    {
                        view: "button",
                        width: 66,
                        type: "iconButtonTop",
                        icon: "mdi mdi-printer",
                        label: "Print",
                        on: {
                            onItemClick: app.handlers.print
                        }
                    }
                ]
            },

            {
                cols: [
                    {
                        rows: [
                            {template: '<span class="mdi mdi-square-edit-outline"></span>Editor', autoheight: true},
                            {
                                view: 'codemirror-editor',
                                mode: 'yaml',
                                id: 'editor',
                                onChange: app.handlers.gotDirty
                            }/*,
                                {
                                    height: 100,
                                    rows: [
                                        {
                                            template: '<span class="mdi mdi-card-text-outline"></span>Log',
                                            autoheight: true
                                        },
                                        {
                                            view: 'textarea',
                                            id: 'log'
                                        }
                                    ]
                                }*/
                        ]
                    },
                    {view: 'resizer'},
                    {
                        rows: [
                            {template: '<span class="mdi mdi-file-tree"></span>View', autoheight: true},
                            {
                                view: 'chartview',
                                id: 'chart'
                            }
                        ]
                    }
                ]
            }
        ]
    });

    app.ui.chart = echarts.init($$('chart').getNode());
});