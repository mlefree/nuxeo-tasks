const Nuxeo = require('nuxeo');

class NuxeoCommon {

    static NUXEO_REQUEST_OPTION = {transactionTimeout: 1000, timeout: 1000, forever: true};

    constructor(overrideNuxeoClientOption) {

        NuxeoCommon._config();
        this.nuxeoRequestOption = NuxeoCommon.NUXEO_REQUEST_OPTION;
        if (overrideNuxeoClientOption) {
            this.nuxeoRequestOption = overrideNuxeoClientOption;
        }
    }

    static _config() {
        if (process.env.TRACE_ENABLED !== 'true') {
            console.log = () => { //empty
            };
        }
    }

    getNuxeoRequestOption() {
        return this.nuxeoRequestOption;
    }

    async init() {
        const NuxeoClient = new Nuxeo({
            baseURL: process.env.NUXEO_URL || 'http://localhost:8610/nuxeo',
            auth: {
                method: 'basic',
                username: process.env.NUXEO_LOGIN || 'Administrator',
                password: process.env.NUXEO_PASSWORD || 'Administrator',
            }
        });
        this.nuxeoClient = await NuxeoClient.connect();
    }

    async createFolder(folderPath) {

        const parentFolderPath = folderPath.substring(0, folderPath.lastIndexOf('/')) + '/';
        const folderRelativeName = folderPath.substring(folderPath.lastIndexOf('/') + 1);
        const folderDocument = {
            // 'entity-type': 'document',
            name: folderRelativeName,
            type: 'Folder',
            properties: {
                'dc:title': folderRelativeName
            }
        };

        try {
            const existingFolder = await this.nuxeoClient
                .repository()
                .fetch(folderPath);
            if (existingFolder) {
                console.log(new Date(), `Folder ${folderPath} already exists.`);
                return;
            }
        } catch (ignored) {
            // console.log(new Date(), ignored);
        }

        const folder = await this.nuxeoClient
            .repository()
            .create(parentFolderPath, folderDocument, this.getNuxeoRequestOption());

        console.log(new Date(), `Folder ${folderPath} has been created : ${folder.path}.`);
        return folder.path;
    }

    async cleanup(folderPath) {

        const query = 'SELECT * FROM Document WHERE ecm:path STARTSWITH "' + folderPath + '"';
        try {
            const kids = await this.nuxeoClient
                .repository()
                .query({
                    query: query
                });

            for (const kid of kids.entries) {
                await this.nuxeoClient
                    .repository()
                    .delete(kid.uid);
            }

            await this.nuxeoClient
                .repository()
                .delete(folderPath);

            console.log(new Date(), `Folder ${folderPath} has been removed.`);
        } catch (e) {
            console.log(new Date(), 'cleanup issue:', query, e.response?.status);
        }
    }


}

module.exports = {NuxeoCommon};



