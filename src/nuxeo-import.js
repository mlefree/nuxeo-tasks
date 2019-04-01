'use strict';

const fs = require('fs');
const through = require('through2');
const Nuxeo = require('nuxeo');
const randomSentence = require('random-sentence');
const {database} = require('./database');
const emailAddresses = require("email-addresses");

const readFile = (path, opts = 'utf8') => {
    return new Promise((resolve, reject) => {
        fs.readFile(path, opts, (err, data) => {
            if (err) reject(err)
            else resolve(data)
        })
    });
};

const nuxeoImport = (inTestMode) => {
    let myModule = {};
    myModule.internal = {};
    myModule.public = {};

    myModule.internal.importCount = 0;
    myModule.internal.importCountLimit = parseInt(process.env.NUXEO_IMPORT_COUNT_LIMIT || "1000");
    myModule.internal.importErrorCount = 0;
    myModule.internal.nuxeoClient = null;
    myModule.internal.database = null;
    myModule.internal.defaultRepo = '/default-domain/workspaces/test-perf-node/';
    myModule.internal.structureGetter = (id, folderId, folderCount) => {
        const filename = 'file-' + folderId + '-' + folderCount;
        return {
            'entity-type': 'document',
            name: filename,
            type: 'File',
            properties: {
                'dc:title': filename,
                'dc:description': randomSentence()
            }
        };
    };
    // Perf tuning
    myModule.internal.nuxeoClientOption = {transactionTimeout: 1000, timeout: 1000, forever: true};
    myModule.internal.nuxeoImportThreads = 4;
    myModule.internal.nuxeoImportFolderCapacity = 20;

    myModule.internal.$init = async () => {

        if (!myModule.internal.nuxeoClient) {
            myModule.internal.nuxeoClient = new Nuxeo({
                baseURL: process.env.NUXEO_URL || 'http://localhost:8610/nuxeo',
                auth: {
                    method: 'basic',
                    username: process.env.NUXEO_LOGIN || 'Administrator',
                    password: process.env.NUXEO_PASSWORD || 'Administrator',
                }
            });
        }

        //todo mle conditional db
        return Promise.resolve();

        return new Promise((resolve, reject) => {

            if (!myModule.internal.database) {
                database.$connect()
                    .then((db) => {
                        myModule.internal.database = db;
                        resolve();
                    })
                    .catch((err) => {
                        console.error(err);
                        reject(err);
                    });
            } else {
                resolve();
            }
        });
    };

    myModule.internal.$createOneDocWithBlob = async () => {

        await myModule.internal.$init();

        const beforeRequest = new Date();
        let afterRequest = beforeRequest;
        const now = new Date();
        const filePath = path.join(__dirname, 'small.txt');
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


    myModule.internal.$createOneDoc = async (sourceId, folderName, fileIndex) => {

        await myModule.internal.$init();

        const fileDocument = myModule.internal.structureGetter(sourceId, folderName, fileIndex);

        return myModule.internal.nuxeoClient
            .repository()
            .create(folderName, fileDocument, myModule.internal.nuxeoClientOption)
            .then((doc) => {
                //console.log('done ');
                myModule.internal.importCount++;
                return Promise.resolve(doc);
            })
            .catch((err) => {
                myModule.internal.importErrorCount++;
                console.error(`Err ${sourceId} - ${folderName} - ${fileIndex}:`, err.toString().substr(0, 200) + '...');
            });

    };

    myModule.internal.$createDocs = async (folderName, docCount, sourceId) => {

        await myModule.internal.$init();
        const now = new Date();
        let todos = [];

        for (let i = 0; i < docCount; i++) {
            const fileName = `test-${now.toISOString()}-${i}`;
            todos.push(myModule.internal.$createOneDoc(sourceId, folderName, i));
        }

        return await Promise.all(todos);
    };

    myModule.internal.$lockFolder = async (folderName) => {

        await myModule.internal.$init();
        if (!myModule.internal.database) return Promise.reject('no db');

        const collection = myModule.internal.database.collection('folders');

        console.log(`Is Folder ${folderName} is still in progress ?`);
        const doc = await collection.findOne({'uid': folderName});
        if (doc && doc.finished) {
            throw new Error(`Folder ${folderName} is in progress elsewhere`);
        } else if (doc && !doc.finished) {
            throw new Error(`Folder ${folderName} has been computed`);
        } else {
            console.log(`Folder ${folderName} will be computed`, doc);
            await collection.insertOne({'uid': folderName, 'created': new Date(), 'finished': null});
            console.log(`Folder ${folderName} 's computing`);
        }
    };


    myModule.internal.$unlockFolder = async (folderName) => {

        await myModule.internal.$init();
        if (!myModule.internal.database) return Promise.reject('no db');

        const collection = myModule.internal.database.collection('folders');
        //console.log(`{'uid': ${folderName}, 'finished': {$ne: null}}`);
        const {err, doc} = await collection.findOneAndUpdate(
            {'uid': folderName, 'finished': {$eq: null}},
            {$set: {'finished': new Date()}},
            {});

        if (err) {
            throw new Error('Unlock err:' + err);
        } else if (doc && doc.value && !doc.value.finished) {
            throw new Error(`Folder ${folderName} has not been updated`);
        }
        return 1;//doc.value;
    };


    myModule.internal.$createFolderWithDocs = async (folderName, docCount, sourceId) => {

        await myModule.internal.$init();

        if (myModule.internal.importCountLimit < myModule.internal.importCount) {
            return Promise.resolve();
        }

        try {
            const newFolder = {
                'entity-type': 'document',
                name: folderName,
                type: 'Folder',
                properties: {
                    'dc:title': folderName,
                    'dc:source': sourceId
                }
            };

            let test = false;
            if (test) {
                await new Promise((resolve, reject) => {
                    setTimeout(() => {
                        resolve('test')
                    }, 1000);
                });
            } else {
                return await myModule.internal.nuxeoClient
                    .repository()
                    .create(myModule.internal.defaultRepo, newFolder, myModule.internal.nuxeoClientOption)
                    .then(function (doc) {
                        return myModule.internal.$createDocs(myModule.internal.defaultRepo + folderName, docCount, sourceId);
                    })
                    .catch((err) => {
                        console.error(`Folder Err ${sourceId} - ${folderName} - ${docCount}:`, err.toString().substr(0, 200) + '...');
                    });
            }
        } catch (e) {
            console.log('$createFoldersWithDocs break, continue....', '' + e.toString().substr(0, 100) + '...', e);
        }
    };

    myModule.internal.$createAndLockFolder = async (folderName, docCount, sourceId) => {

        await myModule.internal.$init();

        if (myModule.internal.importCountLimit < myModule.internal.importCount) {
            return Promise.resolve();
        }

        try {
            await myModule.internal.$lockFolder(sourceId);
            await myModule.internal.$createFolderWithDocs(folderName, docCount, sourceId);
            await myModule.internal.$unlockFolder(sourceId);
        } catch (e) {
            console.log('$createFoldersWithDocs break, continue....', '' + e.toString().substr(0, 100) + '...', e);
        }
    };

    // test only
    myModule.internal.$createFoldersWithDocs = async (folderCount, docCount) => {

        await myModule.internal.$init();
        let results = [];

        //const now = new Date();
        const min = parseInt(process.env.NUXEO_IMPORT_COUNT_MIN || "20000000000");
        const max = min + folderCount;
        for (let i = min; i < max; i++) {
            //const folderName = `test-${now.toISOString()}-${i}`;
            const folderName = `folderz-${i}`;
            const result = await myModule.internal.$createFolderWithDocs(folderName, docCount, '' + i);
            results.push(result);
        }
        return results;
    };

    myModule.internal.$createUsersFromEmailFile = async (sourceFilename) => {

        await myModule.internal.$init();
        let creationCount = 0;

        const data = await readFile(sourceFilename, 'utf8');
        const lines = data.split('\n');
        for (let i = 0; i < lines.length; i++) {

            const addr = emailAddresses.parseOneAddress(lines[i]);
            if (addr) {

                try {
                    //await myModule.internal.nuxeoClient.users().delete(addr.local + '.' + addr.domain);
                } catch (e) {
                }

                try {
                    const newUser = {
                        properties: {
                            username: addr.local + '.' + addr.domain,
                            company: addr.domain,
                            email: addr.address,
                            password: addr.local,
                            groups: ["members"]
                        }
                    };
                    await myModule.internal.nuxeoClient
                        .users()
                        .create(newUser);

                    creationCount++;
                } catch (error) {
                    console.error('$createUsersFromEmailFile error', addr.address, '' + error.toString().substr(0, 200) + '...');
                }
            }
        }

        return creationCount;
    };

    myModule.internal.$createFoldersWithDocsBasedOnSourceFile = async (sourceFilename) => {

        await myModule.internal.$init();
        let creationCount = 0;
        try {
            //const now = new Date();
            const data = await readFile(sourceFilename, 'utf8');
            const lines = data.split('\n');
            let linesCount = lines.length;
            let i = 0;
            while (linesCount > 0) {
                i = Math.floor(Math.random() * linesCount);
                const folderName = `folder-${i}`;
                await myModule.internal.$createAndLockFolder(folderName, myModule.internal.nuxeoImportFolderCapacity, lines[i]);

                lines.splice(i, 1);
                linesCount--;
                creationCount++;
                //i++;
            }

        } catch (e) {
            console.error('$createFoldersWithDocs error', e);
        }

        return creationCount;
    };

    myModule.internal.$createFoldersWithDocsInSeries = async () => {

        let parallel = [];
        //for (let i = 0; i < count; i++) {
            parallel.push(myModule.internal.$createFoldersWithDocs(myModule.internal.importCountLimit, myModule.internal.nuxeoImportFolderCapacity));
        //}
        return Promise.all(parallel);
    };

    myModule.internal.$createFoldersWithDocsBasedOnSourceFileInParallel = async (sourceFilename, count) => {

        let parallel = [];
        for (let i = 0; i < count; i++) {
            parallel.push(myModule.internal.$createFoldersWithDocsBasedOnSourceFile(sourceFilename));
        }
        return Promise.all(parallel);
    };

    myModule.public.createFoldersDemo = (options) => {

        console.log = () => {
        };
        if (options && options.defaultRepo) {
            myModule.internal.defaultRepo = options.defaultRepo;
        }
        if (options && options.structureGetter) {
            myModule.internal.structureGetter = options.structureGetter;
        }

        return through.obj((file, encoding, cb) => {
                myModule.internal.$createFoldersWithDocsInSeries()
                    .then((creationCounts) => {
                        console.warn('Folder Demo creationCount:', myModule.internal.importCount, myModule.internal.importErrorCount, creationCounts);
                        cb(null, file);
                    })
                    .catch((err) => {
                        cb(err);
                    });
            },
            (cb) => {
                cb(null);

            });
    };

    myModule.public.createFoldersFromFile = (options) => {

        console.log = () => {
        };

        if (options && options.defaultRepo) {
            myModule.internal.defaultRepo = options.defaultRepo;
        }
        if (options && options.structureGetter) {
            myModule.internal.structureGetter = options.structureGetter;
        }

        return through.obj((file, encoding, cb) => {
                myModule.internal.$createFoldersWithDocsBasedOnSourceFileInParallel(file.path, myModule.internal.nuxeoImportThreads)
                    .then((creationCounts) => {
                        console.warn('Folder creationCount:', myModule.internal.importCount, myModule.internal.importErrorCount, creationCounts);
                        cb(null, file);
                    })
                    .catch((err) => {
                        cb(err);
                    });
            },
            (cb) => {
                cb(null);
            });
    };


    myModule.public.createUsersFromEmailFile = (options) => {
        //if (!sourceFile || typeof sourceFile !== 'string') {
        //    throw new Error('SourceFile is required!')
        //}

        return through.obj((file, encoding, cb) => {
                myModule.internal.$createUsersFromEmailFile(file.path)
                    .then((creationCount) => {

                        //console.log('docs:', docs.entries.length);
                        console.warn('User creationCount:', creationCount);

                        cb(null, file);
                    })
                    .catch((err) => {
                        cb(err);
                    });
            },
            (cb) => {
                cb(null);
            });
    };


    return myModule;
};

exports.nuxeoImport = nuxeoImport(false).public;
