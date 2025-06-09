const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { exec } = require('child_process');

const csvFolder = path.join(__dirname, 'data');
let data = {};
let log;

async function loadDataByCSV(file) {
    const filePath = path.join(csvFolder, file);
    data = null;
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        // Process each line here
        const isHeader = data == null;
        if (isHeader) data = { header: { groups: [], line: [] }, body: [] };
        const values = line.split(',');
        const body = [];
        for (let i = 0; i < values.length; i++) {
            let value = values[i].trim();

            if (isHeader) {
                let groupName = '';
                if (value.includes('[') && value.includes(']')) {
                    groupName = value.substring(value.indexOf('[') + 1, value.indexOf(']'));
                    value = value.substring(value.indexOf(']') + 1);
                }
                data.header.line.push(value);

                let g = data.header.groups[data.header.groups.length - 1];
                if (!g || g.name != groupName) {
                    g = { name: groupName, count: 0 }
                    data.header.groups.push(g);
                }
                g.count++;
                continue;
            }

            body.push(value);
        }

        data.body.push(body);
    }
}

async function updateData(file, { lineIndex, lineData }) {
    const tempFolder = path.join(csvFolder, 'tmp');
    const bcFolder = path.join(csvFolder, 'bc', new Date().toISOString().replaceAll(':', '-').split('.')[0]);
    const filePath = path.join(csvFolder, file);
    const tempFile = path.join(tempFolder, file);
    const bcFile = path.join(bcFolder, file);

    if (!fs.existsSync(tempFolder)) {
        fs.mkdirSync(tempFolder);
    }

    if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
    }

    if (!fs.existsSync(bcFolder)) {
        fs.mkdirSync(bcFolder);
    }

    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let i = 0;
    for await (let line of rl) {
        // Process each line here
        fs.appendFile(bcFile, `${line}\r\n`, (err) => {
            if (err) {
                console.error('TY Erro ao escrever no arquivo:', err);
            }
        });

        if (i == lineIndex) {
            line = lineData;
        }
        i++;
        fs.appendFile(tempFile, `${line}\r\n`, (err) => {
            if (err) {
                console.error('TY Erro ao escrever no arquivo:', err);
            }
        });
    }

    log({ lineIndex, i, lineData });
    if (lineIndex >= i) {
        fs.appendFile(tempFile, `${lineData}\r\n`, (err) => {
            if (err) {
                console.error('TY Erro ao escrever no arquivo:', err);
            }
        });
    }

    //fs.unlinkSync(filePath);
    fs.renameSync(tempFile, filePath);
}

function getPlugin(plugin) {
    log = plugin.log;
    plugin.init = (trayMenu, mainMenu) => {
        plugin.log('YT init');
    };

    plugin.beforePageLoad = () => {
        plugin.log('YT beforePageLoad');
    };

    plugin.onPageLoad = (page) => {

        const files = fs.readdirSync(csvFolder, { withFileTypes: true }).filter(x => x.isFile()).map(x => x.name);
        let selected = files.length > 0 ? files[0] : '';

        const showData = () => {
            page.loadHtml('#table-header', {
                fileOrHtml: [
                    {
                        tag: 'tr', children: [
                            ...data.header.groups.map(x => { return { tag: 'th', colspan: x.count, text: x.name }; }),
                        ]
                    },
                    {
                        tag: 'tr', children: [
                            ...data.header.line.map(x => { return { tag: 'th', text: x }; }),
                        ]
                    },
                ]
            });
            page.loadHtml('#table-body', {
                fileOrHtml: [
                    ...data.body.map((line, lineIndex) => {
                        const ytid = line[data.header.line.indexOf('YT ID')];
                        if (line.length == 0) return;
                        return {
                            tag: 'tr', children: [
                                // fill up data
                                ...line.map((x, i) => {
                                    return {
                                        tag: 'td', class: 'table-content', text: x, /*contenteditable: true, 'data-index': i, 'data-line': lineIndex*/
                                    };
                                }),
                                ...(line.length < data.header.line.length ? (new Array(data.header.line.length - line.length)).fill({ tag: 'td', text: '' }) : []),
                                {
                                    // custom actions
                                    tag: 'td', children: [
                                        { tag: 'button', class: 'btn btn-secondary btn-sm btn-edit-line', 'data-line': lineIndex, text: 'Editar' },
                                        (ytid ? { tag: 'button', class: 'btn btn-info btn-sm youtube-link', 'data-url': `${ytid}`, text: 'Abrir YT' } : null)
                                    ]
                                },
                            ]
                        }
                    }),
                ]
            });
        }

        if (selected) loadDataByCSV(selected).then(showData);

        page.loadHtml('#ddlCsvFlle', {
            fileOrHtml: [
                ...files.map(fileName => {
                    return {
                        tag: 'option', value: fileName, text: fileName
                    }
                }),
            ]
        });

        page.addEventListener('click', '#ddlCsvFlle', (value) => {
            if (selected == value) return;
            selected = value;

            page.loadHtml('#table-header', { fileOrHtml: [] });
            page.loadHtml('#table-body', { fileOrHtml: [] });

            if (selected) loadDataByCSV(selected).then(showData);
        });

        page.addEventListener('click', '.youtube-link', (e, data) => {
            exec(`start chrome "https://youtube.com/watch?v=${data.url}"`);
        });

        page.addEventListener('click', '#open-folder', () => {
            exec(`cd /d ${csvFolder} & start .`, (error, stdout, stderr) => {
                if (error) {
                    log('Error', error.message);
                    return;
                }

                if (stderr) {
                    log('Stderr', stderr);
                }

                log('Output', stdout);
            });
        });

        page.addEventListener('click', '#new-line', () => {
            const lineIndex = data.body.length;
            page.modal({
                title: `Editar linha ${lineIndex}`,
                body: [
                    {
                        tag: 'div', class: 'row', children: [
                            ...data.header.line.map((r, rIndex) => {
                                return {
                                    tag: 'div', tag: 'form-group', children: [
                                        { tag: 'label', text: r },
                                        { tag: 'input', name: `modal-input-${rIndex}`, class: 'form-control', value: '' }
                                    ]
                                };
                            })
                        ]
                    },
                ],
                footer: [
                    { 'role': 'modal-dismiss' },
                    { 'tag': 'button', 'type': 'button', 'id': 'btn-save', 'class': 'btn btn-success', 'text': 'Save' },
                ],
                on: (event, origin, modalData) => {
                    plugin.log(`origin: ${origin}`)
                    plugin.log(`data: ${JSON.stringify(modalData)}`)
                    if (origin == 'event-close') return;
                    const line= [];
                    data.body.push(line);
                    for (let i = 0; i < data.header.line.length; i++) {
                        line[i] = modalData[`modal-input-${i}`];
                    }
                    plugin.log(`lineIndex: ${lineIndex}/line: ${line.join(',')}`);
                    updateData(selected, { lineIndex: lineIndex, lineData: line.join(',') });
                    showData();
                    event.response(true);
                },
            });
        });

        page.addEventListener('click', '.btn-edit-line', (e, buttonData) => {
            const line = data.body[buttonData.line];
            plugin.log(line);
            page.modal({
                title: `Editar linha ${buttonData.line}`,
                body: [
                    {
                        tag: 'div', class: 'row', children: [
                            ...line.map((r, rIndex) => {
                                return {
                                    tag: 'div', tag: 'form-group', children: [
                                        { tag: 'label', text: data.header.line[rIndex] },
                                        { tag: 'input', name: `modal-input-${rIndex}`, class: 'form-control', value: r }
                                    ]
                                };
                            })
                        ]
                    },
                ],
                footer: [
                    { 'role': 'modal-dismiss' },
                    { 'tag': 'button', 'type': 'button', 'id': 'btn-save', 'class': 'btn btn-success', 'text': 'Save' },
                ],
                on: (event, origin, modalData) => {
                    plugin.log(`origin: ${origin}`)
                    plugin.log(`data: ${JSON.stringify(modalData)}`);
                    if (origin == 'event-close') return;
                    for (let i = 0; i < line.length; i++) {
                        line[i] = modalData[`modal-input-${i}`];
                    }
                    plugin.log(`lineIndex: ${buttonData.line}/line: ${line.join(',')}`);
                    updateData(selected, { lineIndex: buttonData.line, lineData: line.join(',') });
                    showData();
                    event.response(true);
                },
            });
        });

    };

    plugin.beforePageClose = (page) => {
        plugin.log('YT beforePageClose');
    };

    plugin.onPageClose = () => {
        plugin.log('YT onPageClose');
    };

    plugin.beforeQuit = () => {
        plugin.log('YT beforeQuit');
    };

}

module.exports = {
    getPlugin,
};
