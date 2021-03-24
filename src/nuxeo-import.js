const fs = require('fs');
const through = require('through2');
const Nuxeo = require('nuxeo');
const randomSentence = require('random-sentence');
const uuidv4 = require('uuid/v4');
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
    myModule.internal.importErrorCount = 0;
    myModule.internal.nuxeoClient = null;
    myModule.internal.database = null;

    myModule.internal.defaultRepo = '/default-domain/workspaces/test-import-node';
    myModule.internal.defaultConfiguration = {
        prepareWorkspace: true,
        importNeedToBeSafe: false,
        importCountMin: 20,
        importCountLimit: 450,
        recursiveLevel: 3,
        recursiveCount: 3,
        nuxeoClientOption: {transactionTimeout: 1000, timeout: 1000, forever: true},
        nuxeoImportThreads: 5,
        nuxeoImportFolderCapacityLimit: 20
    };
    myModule.internal.defaultStructureGetter = (level, folderId, folderCount) => {
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

    myModule.internal.generateUniqueName = (name, date, ext) => {
        let d = date;
        if (!d || !(d instanceof Date)) {
            d = new Date();
        }
        let month = '' + (d.getMonth() + 1),
            day = '' + d.getDate(),
            year = d.getFullYear(),
            hours = '' + (d.getHours()),
            minutes = '' + d.getMinutes(),
            secondes = d.getSeconds();
        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;
        if (hours.length < 2) hours = '0' + hours;
        if (minutes.length < 2) minutes = '0' + minutes;
        if (secondes.length < 2) secondes = '0' + secondes;

        let filename = [year, month, day].join('') + '-' + name + '-' + randomSentence({words: 2}); // [hours, minutes, secondes].join('') + '-'
        if (ext) {
            filename += ext;
        }
        return filename;
    };

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

        //todo mle conditional db usage
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
            name: myModule.internal.generateUniqueName('test-small', now, '.txt'),
            mimeType: 'plain/text'
        });
        const fileName = myModule.internal.generateUniqueName('test-small', now);
        const fileDocument = {
            'entity-type': 'document',
            name: fileName,
            type: 'File',
            properties: {
                'dc:title': fileName
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
                    .param('document', '/' + fileName)
                    .input(res.blob)
                    .execute();
            })
            .then(() => {
                afterRequest = new Date();
                return myModule.internal.nuxeoClient
                    .repository()
                    .fetch('/' + fileName, {schemas: ['dublincore', 'file']})
                    .then(doc => {
                        doc.requestTimeSpentInMs = afterRequest - beforeRequest;
                        return Promise.resolve(doc);
                    });
            });

    };


    // todo importNeedToBeSafe : verify already exist
    myModule.internal.$createOneDoc = async (sourceId, folderName, fileIndex, recursiveLevel, recursiveCount) => {

        await myModule.internal.$init();

        if (myModule.internal.defaultConfiguration.importCountLimit < myModule.internal.importCount) {
            return Promise.resolve();
        }

        const fileDocument = myModule.internal.defaultStructureGetter(recursiveLevel || sourceId, folderName, fileIndex);
        let docCreated;

        return myModule.internal.nuxeoClient
            .repository()
            .create(folderName, fileDocument, myModule.internal.defaultConfiguration.nuxeoClientOption)
            .then((doc) => {
                console.log(myModule.internal.importCount, '$createOneDoc done: ', folderName, fileDocument.name);
                docCreated = doc;

                if (recursiveLevel > 1) {
                    return myModule.internal.$createDocs(folderName + '/' + doc.title, recursiveCount, sourceId, recursiveLevel - 1, recursiveCount)
                        .then(() => {
                            //myModule.internal.importCount++;
                            return Promise.resolve(docCreated);
                        });
                } else {
                    myModule.internal.importCount++;
                    return Promise.resolve(docCreated);
                }
            })
            .catch((err) => {
                myModule.internal.importErrorCount++;
                console.error(`Err ${sourceId} - ${folderName} - ${fileIndex}:`, err.toString().substr(0, 2000) + '...');
            });

    };

    // todo importNeedToBeSafe
    myModule.internal.prepareWorkspace = async () => {

        if (!myModule.internal.defaultConfiguration.prepareWorkspace) return Promise.resolve();

        const queryToSearchWorkspace = `SELECT * FROM Document WHERE ecm:primaryType = 'WORKSPACE' AND ecm:path = '${myModule.internal.defaultRepo}'`;

        const ws = await myModule.internal.nuxeoClient
            .repository()
            .query({query: queryToSearchWorkspace});

        const workspaceName = myModule.internal.defaultRepo.substr('/default-domain/workspaces/'.length);

        const fileDocument = {
            'entity-type': 'workspace',
            name: workspaceName,
            type: 'Workspace',
            properties: {
                'dc:title': workspaceName,
                'dc:description': 'preparedWorkspace'
            }
        };

        return myModule.internal.nuxeoClient
            .repository()
            .create(folderName, fileDocument, myModule.internal.defaultConfiguration.nuxeoClientOption)

    };

    myModule.internal.$createDocs = async (folderName, docCount, sourceId, recursiveLevel, recursiveCount) => {

        await myModule.internal.$init();
        let todos = [];
        let docs = [];

        for (let i = 0; i < docCount; i++) {
            // const fileName = `test-${now.toISOString()}-${i}`;
            //TO BIG: todos.push(myModule.internal.$createOneDoc(sourceId, folderName, i, recursiveLevel, recursiveCount));
            const doc = await myModule.internal.$createOneDoc(sourceId, folderName, i, recursiveLevel, recursiveCount);
            docs.push(doc);
        }

        //return await Promise.all(todos);
        return docs;
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

    myModule.internal.$createFolderWithDocs = async (rootFolderName, folderName, docCount, sourceId, recursiveLevel, recursiveCount) => {

        await myModule.internal.$init();

        if (myModule.internal.defaultConfiguration.importCountLimit < myModule.internal.importCount) {
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
                const doc = await myModule.internal.nuxeoClient
                    .repository()
                    .create(rootFolderName, newFolder, myModule.internal.defaultConfiguration.nuxeoClientOption);

                const docs = await myModule.internal.$createDocs(rootFolderName + '/' + folderName, docCount, sourceId, recursiveLevel, recursiveCount);
                return docs;
            }
        } catch (e) {
            console.log('$createFoldersWithDocs break, continue....', '' + e.toString().substr(0, 100) + '...', e);
        }
    };

    myModule.internal.$createAndLockFolder = async (rootFolderName, folderName, docCount, sourceId) => {

        await myModule.internal.$init();

        if (myModule.internal.defaultConfiguration.importCountLimit < myModule.internal.importCount) {
            return Promise.resolve();
        }

        try {
            await myModule.internal.$lockFolder(sourceId);
            await myModule.internal.$createFolderWithDocs(rootFolderName, folderName, docCount, sourceId);
            await myModule.internal.$unlockFolder(sourceId);
        } catch (e) {
            console.log('$createFoldersWithDocs break, continue....', '' + e.toString().substr(0, 100) + '...', e);
        }
    };

    myModule.internal.$createFoldersWithDocs = async (sourceIdMin, folderCount, docCount) => {

        await myModule.internal.$init();
        let results = [];

        console.log('$createFoldersWithDocs: ', sourceIdMin, folderCount, docCount);
        const min = sourceIdMin; //parseInt(process.env.NUXEO_IMPORT_COUNT_MIN || "20000000000");
        const max = min + folderCount;
        const folderName = myModule.internal.generateUniqueName('demoFolder');
        const rootFolderName = myModule.internal.defaultRepo + '/' + folderName;
        const rootFolderDoc = {
            'entity-type': 'document',
            name: folderName,
            type: 'Folder',
            properties: {
                'dc:title': folderName,
                // 'dc:source': sourceId
            }
        };
        const rootFolder = await myModule.internal.nuxeoClient
            .repository()
            .create(myModule.internal.defaultRepo, rootFolderDoc, myModule.internal.defaultConfiguration.nuxeoClientOption);

        for (let i = min; i < max; i++) {
            const subFolderName = `subFolder-${i}`;
            console.log('$createFoldersWithDocs - $createFolderWithDocs: ', subFolderName, docCount, i);
            const result = await myModule.internal.$createFolderWithDocs(rootFolderName, subFolderName, docCount, '' + i);
            //results.push(result);
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
            const data = await readFile(sourceFilename, 'utf8');
            const lines = data.split('\n');
            let linesCount = lines.length;
            let i = 0;

            const folderName = myModule.internal.generateUniqueName('sourceFolder');
            const rootFolderName = myModule.internal.defaultRepo + '/' + folderName;
            const rootFolderDoc = {
                'entity-type': 'document',
                name: rootFolderName,
                type: 'Folder',
                properties: {
                    'dc:title': folderName,
                    'dc:source': sourceFilename
                }
            };
            const rootFolder = await myModule.internal.nuxeoClient
                .repository()
                .create(myModule.internal.defaultRepo, rootFolderDoc, myModule.internal.defaultConfiguration.nuxeoClientOption);

            while (linesCount > 0) {
                i = Math.floor(Math.random() * linesCount);
                const subFolderName = `subFolder-${lines[i]}`;
                await myModule.internal.$createAndLockFolder(rootFolderName, subFolderName, myModule.internal.defaultConfiguration.nuxeoImportFolderCapacityLimit, lines[i]);

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

    myModule.internal.$createDemoComplexStructure = async () => {

        await myModule.internal.$init();
        let results = [];
        const now = new Date();
        const min = 0,
            max = 1,
            folderCount = myModule.internal.defaultConfiguration.recursiveCount,
            recursiveLevel = myModule.internal.defaultConfiguration.recursiveLevel,
            recursiveCount = myModule.internal.defaultConfiguration.recursiveCount;

        console.log('$createDemoComplexStructure: ', myModule.internal.defaultConfiguration.nuxeoImportThreads, max, folderCount, recursiveLevel, recursiveCount);

        for (let i = min; i < max; i++) {
            const folderName = myModule.internal.generateUniqueName(`complexFolder-${i}`, now);
            let result;
            try {


                await myModule.internal.$createFolderWithDocs(myModule.internal.defaultRepo, folderName, folderCount, '$createDemoComplexStructure', recursiveLevel, recursiveCount);

                /*
                const newFolder = {
                    'entity-type': 'document',
                    name: folderName,
                    type: 'Folder',
                    properties: {
                        'dc:title': folderName,
                        // 'dc:source': sourceId
                    }
                };

                result = await myModule.internal.nuxeoClient
                    .repository()
                    .create(myModule.internal.defaultRepo, newFolder, myModule.internal.defaultConfiguration.nuxeoClientOption)
                    .then(function (doc) {
                        return myModule.internal.$createDocs(myModule.internal.defaultRepo + '/' + folderName, folderCount, '$createDemoComplexStructure', recursiveLevel, recursiveCount);
                    })
                    .catch((err) => {
                        console.error(`$createDemoComplexStructure Err - ${folderName}:`, err.toString().substr(0, 200) + '...');
                    });*/

            } catch (e) {
                console.log('$createDemoComplexStructure break, continue....', '' + e.toString().substr(0, 100) + '...', e);
            }

            results.push(result);
        }
        return results;
    };

    myModule.internal.$createFoldersWithDocsInParallel = async (count) => {

        let parallel = [];
        let min = myModule.internal.defaultConfiguration.importCountMin;// parseInt(process.env.NUXEO_IMPORT_COUNT_MIN || "200000");

        for (let i = 0; i < count; i++) {
            parallel.push(myModule.internal.$createFoldersWithDocs(
                min + (myModule.internal.defaultConfiguration.importCountLimit * i),
                myModule.internal.defaultConfiguration.nuxeoImportFolderCapacityLimit,
                myModule.internal.defaultConfiguration.nuxeoImportFolderCapacityLimit));
        }
        return Promise.all(parallel);
    };

    myModule.internal.$createFoldersWithDocsBasedOnSourceFileInParallel = async (sourceFilename, count) => {

        let parallel = [];
        for (let i = 0; i < count; i++) {
            parallel.push(myModule.internal.$createFoldersWithDocsBasedOnSourceFile(sourceFilename));
        }
        return Promise.all(parallel);
    };

    myModule.internal.$createDemoComplexStructureInParallel = async (count) => {

        let parallel = [];
        for (let i = 0; i < count; i++) {
            parallel.push(myModule.internal.$createDemoComplexStructure());
        }
        return Promise.all(parallel);
    };


    myModule.internal.setDefaultConfiguration = (options) => {
        if (process.env.TRACE_LEVEL !== 'debug') {
            console.log = () => {
            };
        }
        if (options && options.defaultRepo) {
            myModule.internal.defaultRepo = options.defaultRepo;
        }
        if (options && options.structureGetter) {
            myModule.internal.defaultStructureGetter = options.structureGetter;
        }
        if (options && options.defaultConfiguration) {
            myModule.internal.defaultConfiguration = options.defaultConfiguration;
        }
    };

    myModule.public.createFoldersDemo = (options) => {

        myModule.internal.setDefaultConfiguration(options);

        return through.obj((file, encoding, cb) => {
                myModule.internal.$createFoldersWithDocsInParallel(myModule.internal.defaultConfiguration.nuxeoImportThreads)
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

        myModule.internal.setDefaultConfiguration(options);

        return through.obj((file, encoding, cb) => {
                myModule.internal.$createFoldersWithDocsBasedOnSourceFileInParallel(file.path, myModule.internal.defaultConfiguration.nuxeoImportThreads)
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

        myModule.internal.setDefaultConfiguration(options);

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

    myModule.public.createDemoComplexStructure = (options) => {

        myModule.internal.setDefaultConfiguration(options);

        return through.obj((file, encoding, cb) => {
                myModule.internal.$createDemoComplexStructureInParallel(myModule.internal.defaultConfiguration.nuxeoImportThreads)
                    .then((creationCounts) => {
                        console.warn('DemoComplexStructure creationCount:', myModule.internal.importCount, myModule.internal.importErrorCount, creationCounts);
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
