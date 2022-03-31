const {NuxeoCommon} = require("./nuxeo-common");

class NuxeoCollection extends NuxeoCommon {

    static PROMISE_PARALLEL_LIMIT = 5;

    static FOLDER_PATH = '/collection-test';

    constructor() {
        super();
    }

    async createFilesAndCollections(folderName, count) {

        const now = new Date();
        const response = {
            files: [],
            collections: []
        };

        for (let i = 0; i < count; i++) {
            const fileDocument = {
                // 'entity-type': 'document',
                name: `file-${now.toISOString()}-${i}`,
                type: 'File',
                properties: {
                    'dc:title': `file-${now.toISOString()}-${i}`
                }
            };
            const collectionDocument = {
                // 'entity-type': 'document',
                name: `collection-${now.toISOString()}-${i}`,
                type: 'Collection',
                properties: {
                    'dc:title': `collection-${now.toISOString()}-${i}`
                }
            };
            const file = await this.nuxeoClient
                .repository()
                .create(folderName, fileDocument, this.getNuxeoRequestOption());
            const collection = await this.nuxeoClient
                .repository()
                .create(folderName, collectionDocument, this.getNuxeoRequestOption());

            response.files.push(file);
            response.collections.push(collection);
        }

        console.log(new Date(), `Files and Collections have been created: ${count} in ${new Date() - now}ms`);
        return response;
    }

    async addConnections(documents, collections) {

        let count = 0;
        const begin = new Date();
        let promises = [];

        for (let document of documents) {
            for (let collection of collections) {
                const operationPromise = this.nuxeoClient
                    .operation('Document.AddToCollection')
                    .params({
                        collection: collection.uid
                    })
                    .input(document.uid)
                    .execute();

                if (promises.length < NuxeoCollection.PROMISE_PARALLEL_LIMIT) {
                    promises.push(operationPromise);
                } else {
                    await Promise.all(promises);
                    promises = [operationPromise];
                }
                count++;
            }
            await Promise.all(promises);
        }

        const timeSpent = new Date() - begin;
        const perfRatio = timeSpent / count;
        console.log(new Date(), `Connections have been created : ${count} in ${timeSpent}ms => perfRatio : ${perfRatio}`);
        return count;
    }

    static async challengeLinkCreation() {

        const nuxeoCollection = new NuxeoCollection();
        await nuxeoCollection.init();
        await nuxeoCollection.createFolder(NuxeoCollection.FOLDER_PATH);

        for (const count of [10, 100, 200, 300, 600]) {
            const created = await nuxeoCollection.createFilesAndCollections(NuxeoCollection.FOLDER_PATH, count);
            await nuxeoCollection.addConnections(created.files, created.collections);
        }
    }

    static async challengeCleanUp() {
        const nuxeoCollection = new NuxeoCollection();
        await nuxeoCollection.init();
        await nuxeoCollection.cleanup(NuxeoCollection.FOLDER_PATH);
    }

}

module.exports = {NuxeoCollection};



