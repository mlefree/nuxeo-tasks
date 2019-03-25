'use strict';

const fs = require('fs');
const through = require('through2');
const Nuxeo = require('nuxeo');
const {database} = require('./database');

const nuxeoImport = (inTestMode) => {
    let myModule = {};
    myModule.internal = {};
    myModule.public = {};

    myModule.internal.nuxeoClient = null;
    myModule.internal.database = null;
    myModule.internal.defaultRepo = '/default-domain/workspaces/test/';
    myModule.internal.testReadQuery = "SELECT * FROM Document"
        + " WHERE ecm:primaryType = 'File'"
        + " AND ecm:path STARTSWITH '/default-domain/workspaces/'"
    //+ " AND content/data IS NOT NULL"
    //+ " AND dc:title <> content/name"
    //+ " AND ecm:isProxy = 0 AND ecm:isCheckedInVersion = 0"
    //+ " AND ecm:currentLifeCycleState != 'deleted'"
    ;
    myModule.internal.testSampleQuery = "SELECT ecm:uuid, ecm:fulltextScore FROM Document WHERE ecm:fulltext = '*'"
    ;

    myModule.internal.init = () => {

        if (!myModule.internal.database) {
            database(inTestMode).$connect()
                .then((db) => {
                    myModule.internal.database = db;
                });
        }

        if (!myModule.internal.nuxeoClient) {
            myModule.internal.nuxeoClient = new Nuxeo({
                baseURL: process.env.NUXEO_URL || 'http://localhost:8610/nuxeo',
                auth: {
                    method: 'basic',
                    username: process.env.NUXEO_LOGIN || 'Administrator',
                    password: process.env.NUXEO_PASSWORD || 'Administrator'
                }
            });
        }
    };

    myModule.internal.$readAllDocs = () => {

        myModule.internal.init();

        let query = myModule.internal.testReadQuery;
        console.log(query);

        return myModule.internal.nuxeoClient
            .repository()
            .schemas(['dublincore', 'file'])
            .query({query: query})
            ;
    };

    myModule.internal.$readOneDoc = (doc) => {

        myModule.internal.init();

        const beforeRequest = new Date();

        let query = `SELECT * FROM Document WHERE uid = "${doc.uid}"`;
        // console.log(query);

        return myModule.internal.nuxeoClient
            .repository()
            .schemas(['dublincore', 'file'])
            .query({query: query})
            .then(doc => {
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                return Promise.resolve(doc);
            })
            .catch(err => {
                const doc = {};
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                console.error(err);
                return Promise.resolve(doc);
            });
    };

    myModule.internal.$readQuery = (query) => {

        myModule.internal.init();

        const beforeRequest = new Date();

        return myModule.internal.nuxeoClient
            .repository()
            //.schemas(['dublincore', 'file'])
            .enricher('document', 'thumbnail')
            .query(query)
            // TODO MLE .queryAndFetch()
            .then(doc => {
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                return Promise.resolve(doc);
            })
            .catch(err => {
                const doc = {};
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                // console.error(err);
                return Promise.reject(err);
            });
    };

    myModule.internal.$readNXQL = (nxql) => {

        myModule.internal.init();

        return myModule.internal.$readQuery({query: nxql, currentPageIndex: 0});
    };

    myModule.internal.$readOperation = (op, input) => {

        myModule.internal.init();

        const beforeRequest = new Date();

        return myModule.internal.nuxeoClient
            .operation(op)
            .input(input)
            .schemas(['dublincore', 'file'])
            //   .params({
            //     name: 'workspaces',
            //   })
            .execute()
            //return myModule.internal.nuxeoClient
            //   .repository()
            //   .schemas(['dublincore', 'file'])
            //   .automation({automation: automation, currentPageIndex: 0})
            .then(doc => {
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                return Promise.resolve(doc);
            })
            .catch(err => {
                const doc = {};
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                // console.error(err);
                return Promise.reject(err);
            });
    };

    myModule.internal.$updateOneDoc = (doc) => {

        myModule.internal.init();

        const beforeRequest = new Date();

        if (!doc.properties['file:content']) {
            console.log('bad file - skip it.', doc.properties['dc:title']);
            return Promise.resolve(doc);
        }

        //console.log(doc.properties['file:content'].name);
        doc.set({'dc:title': '' + doc.properties['file:content'].name + ' - ' + new Date().toLocaleString()});
        return doc.save()
            .then(doc => {
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                return Promise.resolve(doc);
            });
    };

    myModule.internal.$createOneDoc = () => {

        myModule.internal.init();

        const beforeRequest = new Date();
        let afterRequest = beforeRequest;
        const now = new Date();
        const filePath = path.join(__dirname, 'small.txt'); // todo big file ?
        // var file = fs.readFileSync(filePath, 'utf8');
        const file = fs.createReadStream(filePath);
        const blob = new Nuxeo.Blob({
            content: file + ' ' + beforeRequest.toISOString(),
            name: 'test-small-' + now.toISOString() + '.txt',
            mimeType: 'plain/text'
        });
        const fileDocument = {
            'entity-type': 'document',
            name: 'test-small-' + now.toISOString(),
            type: 'File',
            properties: {
                'dc:title': 'test-small-' + now.toISOString()
            }
        };

        return myModule.internal.nuxeoClient
            .repository()
            .create(myModule.internal.defaultRepo, fileDocument)
            .then(doc => {
                // console.log(doc);
                return myModule.internal.nuxeoClient
                    .batchUpload()
                    .upload(blob);
            })
            .then(res => {
                return myModule.internal.nuxeoClient
                    .operation('Blob.AttachOnDocument')
                    .param('document', '/test-small-' + now.toISOString())
                    .input(res.blob)
                    .execute();
            })
            .then(() => {
                afterRequest = new Date();
                return myModule.internal.nuxeoClient
                    .repository()
                    .fetch('/test-small-' + now.toISOString(), {schemas: ['dublincore', 'file']})
                    .then(doc => {
                        doc.requestTimeSpentInMs = afterRequest - beforeRequest;
                        return Promise.resolve(doc);
                    });
            });

    };

    myModule.internal.$createDocs = (folderName, docCount) => {

        myModule.internal.init();
        const now = new Date();
        let todos = [];

        for (let i = 0; i < docCount; i++) {

            const fileName = `test-${now.toISOString()}-${i}`;
            const fileDocument = {
                'entity-type': 'document',
                name: fileName,
                type: 'File',
                properties: {
                    'dc:title': fileName
                }
            };

            const p = myModule.internal.nuxeoClient
                .repository()
                .create(folderName, fileDocument)
                //.then((doc) => {
                //    console.log('done ');
                //})
                .catch((err) => {
                    console.log('r');
                })
            ;
            todos.push(p);
        }

        return Promise.all(todos);
    };

    myModule.internal.$lockFolder = (folderName) => {

        myModule.internal.init();
        if (!myModule.internal.database) return Promise.reject('no db');

        return new Promise((resolve, reject) => {
            const collection = myModule.internal.database.collection('folders');
            // Insert some documents
            collection.insertMany([
                {a: 1}, {a: 2}, {a: 3}
            ], function (err, result) {
                if (err) {
                    reject(err);
                } else {
                    //assert.equal(err, null);
                    //assert.equal(3, result.result.n);
                    //assert.equal(3, result.ops.length);
                    console.log("Inserted 3 documents into the collection");
                    resolve(result);
                }
            });
        });
    };


    myModule.internal.$unlockFolder = (folderName) => {

        myModule.internal.init();
        if (!myModule.internal.database) return Promise.reject('no db');

        return new Promise((resolve, reject) => {
            const collection = myModule.internal.database.collection('folders');
            // Insert some documents
            collection.insertMany([
                {a: 1}, {a: 2}, {a: 3}
            ], function (err, result) {
                if (err) {
                    reject(err);
                } else {
                    //assert.equal(err, null);
                    //assert.equal(3, result.result.n);
                    //assert.equal(3, result.ops.length);
                    console.log("Inserted 3 documents into the collection");
                    resolve(result);
                }
            });
        });
    };

    myModule.internal.$createFolderWithDocs = (folderName, docCount) => {

        myModule.internal.init();
        const newFolder = {
            'entity-type': 'document',
            name: folderName,
            type: 'Folder',
            properties: {
                'dc:title': folderName
            }
        };
        return myModule.internal.nuxeoClient
            .repository()
            .create(myModule.internal.defaultRepo, newFolder)
            .then(function (doc) {
                return myModule.internal.$createDocs(myModule.internal.defaultRepo + folderName, docCount);
            })
            .catch(function (error) {
                console.error('$createFoldersWithDocs error', error);
            });
    };

    myModule.internal.$createFoldersWithDocs = (folderCount, docCount) => {

        myModule.internal.init();
        const now = new Date();
        let todos = [];
        for (let i = 0; i < folderCount; i++) {
            const folderName = `test-${now.toISOString()}-${i}`;
            todos.push(myModule.internal.$createFolderWithDocs(folderName, docCount));
        }
        return Promise.all(todos);
    };

    myModule.public.createFolders = (remoteFolder, cdnList, options) => {
        if (!remoteFolder || typeof remoteFolder !== 'string') {
            throw new Error('First arg remoteFolder is required!')
        }

        return through.obj((file, encoding, cb) => {

                myModule.internal.$createFoldersWithDocs(1, 20)
                    .then((docs) => {

                        //console.log('docs:', docs.entries.length);
                        console.log('docs:', docs.length);

                        cb(null, file);
                    })
                    .catch((err) => {
                        cb(err);
                    });
            },
            (cb) => {

                //fs.writeFileSync(config.cache, JSON.stringify(config.cache_object, null, '  '));
                //cb(failedFlag ? new Error('Some files corrupted during upload...') : null)
                //cb(new Error(`Encoding ${encoding}`));
                cb(null);

            });
    };

    return myModule;
};

exports.nuxeoImport = nuxeoImport(false).public;
