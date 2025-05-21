const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { exec } = require('child_process');
let data = {};

async function loadDataByCSV(filePath) {
    data = null;
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        // Process each line here
        const values = line.split(',');
        const isHeader = data == null;
        if (isHeader) data = { header: { groups: [], line: [] }, body: [] };
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

function getPlugin(plugin) {

    plugin.init = (trayMenu, mainMenu) => {
        plugin.log('YT init');
    };

    plugin.beforePageLoad = () => {
        plugin.log('YT beforePageLoad');
    };

    plugin.onPageLoad = (page) => {

        const csvFolder = path.join(__dirname, 'data');

        const files = fs.readdirSync(csvFolder);
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
                    ...data.body.map(line => {
                        const ytid = line[data.header.line.indexOf('YT ID')];
                        if(line.length == 0) return;
                        return {
                            tag: 'tr', children: [
                                // fill up data
                                ...line.map((x, i) => { return { tag: 'td', text: x }; }),
                                ...(line.length < data.header.line.length ? (new Array(data.header.line.length - line.length)).fill({ tag: 'td', text: '' }) : []),
                                {
                                    // custom actions
                                    tag: 'td', children: [
                                        ytid ? { tag: 'button', class: 'btn btn-info btn-sm youtube-link', 'data-url': `${ytid}`, text: 'Open YT' } : null
                                    ]
                                },
                            ]
                        }
                    }),
                ]
            });
        }

        if (selected) loadDataByCSV(path.join(csvFolder, selected)).then(showData);

        // page.addEventListener('change', '#file-csv', (value) => {
        //     plugin.log(value);
        // });

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

            if (selected) loadDataByCSV(path.join(csvFolder, selected)).then(showData);
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
