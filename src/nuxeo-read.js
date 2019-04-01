'use strict';

const fs = require('fs');
const through = require('through2');
const Nuxeo = require('nuxeo');
const emailAddresses = require("email-addresses");

const readFile = (path, opts = 'utf8') => {
    return new Promise((resolve, reject) => {
        fs.readFile(path, opts, (err, data) => {
            if (err) reject(err)
            else resolve(data)
        })
    });
};

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const nuxeoRead = (inTestMode) => {
    let myModule = {};
    myModule.internal = {};
    myModule.public = {};

    myModule.internal.readTimeLimit = new Date();
    myModule.internal.nuxeoClient = null;
    myModule.internal.nuxeoClients = {};
    myModule.internal.database = null;
    //myModule.internal.defaultRepo = '/default-domain/workspaces/test-perf-node/';
    myModule.internal.testReadQuery = "SELECT * FROM Document"
        + " WHERE ecm:primaryType = 'myNote'"
        + " AND ecm:path STARTSWITH '/default-domain/workspaces/'"
    //+ " AND content/data IS NOT NULL"
    //+ " AND dc:title <> content/name"
    //+ " AND ecm:isProxy = 0 AND ecm:isCheckedInVersion = 0"
    //+ " AND ecm:currentLifeCycleState != 'deleted'"
    ;
    myModule.internal.testSampleQuery = "SELECT ecm:uuid, ecm:fulltextScore FROM Document WHERE ecm:fulltext = '*'";
    myModule.internal.nuxeoClientOption = {transactionTimeout: 1000, timeout: 1000};//, forever: true};

    myModule.internal.isAhead = () => {
        const t1 = myModule.internal.readTimeLimit.getTime();
        const t2 = new Date().getTime();
        const b = t1 > t2;
        //console.log('isAhead', b, t1, t2);
        return b;
    };
    myModule.internal.willBeTooLate = (delayInMs) => {
        const t1 = myModule.internal.readTimeLimit.getTime();
        const t2 = new Date().getTime() + delayInMs;
        const b = t1 < t2;
        //console.log('willBeTooLate', b, t1, t2);
        return b;
    };

    myModule.internal.$init = async () => {

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
        return Promise.resolve();
    };

    myModule.internal.$initMultiple = async (id, login, pwd) => {

        if (!myModule.internal.nuxeoClients[id]) {
            myModule.internal.nuxeoClients[id] = new Nuxeo({
                baseURL: process.env.NUXEO_URL || 'http://localhost:8610/nuxeo',
                auth: {
                    method: 'basic',
                    username: login || process.env.NUXEO_LOGIN || 'Administrator',
                    password: pwd || process.env.NUXEO_PASSWORD || 'Administrator'
                }
            });
        }
        return Promise.resolve();
    };

    myModule.internal.$readAllDocs = async () => {

        await myModule.internal.$init();

        let query = myModule.internal.testReadQuery;
        console.log(query);

        return myModule.internal.nuxeoClient
            .repository()
            .schemas(['dublincore', 'file'])
            .query({query: query})
            ;
    };

    myModule.internal.$readOneDoc = async (doc) => {

        await myModule.internal.$init();

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

    myModule.internal.$readQuery = async (query) => {

        await myModule.internal.$init();

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

    myModule.internal.$multipleReadQuery = async (clientId, query) => {

        await myModule.internal.$initMultiple(clientId);

        const beforeRequest = new Date();

        return myModule.internal.nuxeoClients[clientId]
            .repository()
            .schemas(['dublincore', 'file', 'csc'])
            //.enricher('document', 'thumbnail')
            .query(query)
            .then(doc => {
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                //console.log('found : ', doc);
                return Promise.resolve(doc);
            })
            .catch(err => {
                const doc = {};
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                // console.error(err);
                return Promise.reject(err);
            });
    };

    myModule.internal.$readNXQL = async (nxql) => {

        await myModule.internal.$init();

        return myModule.internal.$readQuery({query: nxql, currentPageIndex: 0});
    };

    myModule.internal.$readOperation = async (op, input) => {

        await myModule.internal.$init();

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

    myModule.internal.computeReport = (report, doc) => {
        let newReport = JSON.parse(JSON.stringify(report)); // copy values

        newReport.requestCount++;
        newReport.averageTime = ((newReport.averageTime * (newReport.requestCount - 1)) + doc.requestTimeSpentInMs) / newReport.requestCount;
        newReport.averageTimePercentile95 = newReport.averageTime; // complex to do - what about min and because request time looks very stable
        newReport.maxTime = newReport.maxTime < doc.requestTimeSpentInMs ? doc.requestTimeSpentInMs : newReport.maxTime;
        newReport.minTime = newReport.minTime < doc.requestTimeSpentInMs ? newReport.minTime : doc.requestTimeSpentInMs;
        return newReport;
    };

    myModule.internal.$multipleSearchDocument = async (clientId, folderId, category) => {

        await myModule.internal.$initMultiple(clientId);
        let report = {
            docCount: 0,
            requestCount: 0,
            averageTime: 0,
            averageTimePercentile95: 0,
            maxTime: 0,
            errorCount: 0
        };

        try {
            const count = await myModule.internal.$readQuery({
                query: `SELECT * FROM Document WHERE ecm:primaryType = 'myNote' AND ecm:mixinType != HiddenInNavigation AND ecm:isProxy = 0 AND ecm:isVersion = 0 AND ecm:isTrashed = 0`
            });
            report.docCount = count.resultsCount;
        } catch (error) {
            console.error('$multipleSearchDocument error', error);
        }

        let docs = null;
        try {
            //console.log('read query ', clientId);
            docs = await myModule.internal.$multipleReadQuery(clientId, {
                query: `SELECT * FROM Document WHERE ecm:primaryType = 'myNote'  AND ecm:isTrashed = 0 AND csc:NumAVS = "${folderId}" AND csc:Categorie = "${category}"`, // "${folderId}" AND "${category}"
                currentPageIndex: 0
            });
            report = myModule.internal.computeReport(report, docs);
        } catch (error) {
            report.errorCount++;
            console.error('$multipleSearchDocument error', error);
        }

        console.log('docs.entries.length:', clientId, docs.entries.length, folderId, category);
        let firstTime = true;
        while (docs && docs.entries && docs.entries.length > 1 && myModule.internal.isAhead()) {

            if (firstTime) {
                await timeout(2000);
                firstTime = false;
            } else {
                await timeout(20000);
            }

            try {
                const docToFind = docs.entries[parseInt(Math.random() * (docs.entries.length - 1))];
                //console.log('docToFind:', clientId, docToFind.uid);
                const docsFound = await myModule.internal.$multipleReadQuery(clientId, {
                    query: `SELECT * FROM Document WHERE ecm:uuid = "${docToFind.uid}"`
                });

                if (docsFound.entries.length === 1 &&
                    docsFound.entries[0].properties['csc:NumAVS'] === folderId &&
                    docsFound.entries[0].properties['csc:Categorie'] === category) {
                    //console.log('doc found ', clientId, docsFound.entries[0]);
                    report = myModule.internal.computeReport(report, docsFound);
                } else {
                    console.error('error on doc ', clientId, docToFind.uid, docsFound.resultsCount);
                    report.errorCount++;
                }
            } catch (error) {
                report.errorCount++;
                console.error('$multipleSearchDocument error', error);
            }
        }

        return report;
    };


    myModule.internal.$multipleSearchDocumentWithDelay = async (clientId, folderId, category, delayInMs) => {

        if (myModule.internal.willBeTooLate(delayInMs)) {
            return {};
        }

        await timeout(delayInMs);

        if (!myModule.internal.isAhead()) {
            return {};
        }

        const report = await myModule.internal.$multipleSearchDocument(clientId, folderId, category);
        return report;
    };


    myModule.internal.$searchAsManyUsersForDocumentsAndReadThem = async (sourceFilename) => {

        const data = await readFile(sourceFilename, 'utf8');
        const lines = data.split('\n');
        let parallels = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].split(',');
            const addr = emailAddresses.parseOneAddress(line[0]);
            const folderId = line[1];
            const category = line[2];
            if (addr && folderId && category) {
                parallels.push(myModule.internal.$multipleSearchDocumentWithDelay(addr.address, folderId, category, i * 3500));
            }
        }

        const reports = await Promise.all(parallels);
        return reports;
    };

    myModule.public.searchAsManyUsersForDocumentsAndReadThem = (options) => {

        if (options && options.readTimeLimit) {
            myModule.internal.readTimeLimit = options.readTimeLimit;
        } else {
            myModule.internal.readTimeLimit.setSeconds(myModule.internal.readTimeLimit.getSeconds() + 72); //TODO 2h : 7200
        }

        return through.obj((file, encoding, cb) => {
                myModule.internal.$searchAsManyUsersForDocumentsAndReadThem(file.path)
                    .then((readReports) => {
                        console.warn('readReports:', readReports);
                        let stream = fs.createWriteStream(`report-searchAsManyUsersForDocumentsAndReadThem-${new Date().toISOString()}.gitignored.json`);
                        stream.once('open', () => {
                            stream.write(JSON.stringify(readReports));
                            stream.end();
                        });
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

exports.nuxeoRead = nuxeoRead(false).public;
