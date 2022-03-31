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

                if ( promises.length < NuxeoCollection.PROMISE_PARALLEL_LIMIT) {
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

        const created1 = await nuxeoCollection.createFilesAndCollections(NuxeoCollection.FOLDER_PATH, 10);
        await nuxeoCollection.addConnections(created1.files, created1.collections);

        const created2 = await nuxeoCollection.createFilesAndCollections(NuxeoCollection.FOLDER_PATH, 100);
        await nuxeoCollection.addConnections(created2.files, created2.collections);

        const created3 = await nuxeoCollection.createFilesAndCollections(NuxeoCollection.FOLDER_PATH, 1000);
        await nuxeoCollection.addConnections(created3.files, created3.collections);

        //const created4 = await nuxeoCollection.createFilesAndCollections(NuxeoCollection.FOLDER_PATH, 10000);
        //await nuxeoCollection.addConnections(created4.files, created4.collections);
    }


    static async challengeCleanUp() {
        const nuxeoCollection = new NuxeoCollection();
        await nuxeoCollection.init();
        await nuxeoCollection.cleanup(NuxeoCollection.FOLDER_PATH);
    }

}

module.exports = {NuxeoCollection};



