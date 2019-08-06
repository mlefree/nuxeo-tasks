'use strict';

const fs = require('fs');
const through = require('through2');
const Nuxeo = require('nuxeo');
const emailAddresses = require("email-addresses");

function isEmpty(map) {
    for (var key in map) {
        if (map.hasOwnProperty(key)) {
            return false;
        }
    }
    return true;
}

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
    myModule.internal.brutInfoStream = null;

    myModule.internal.defaultConfiguration = {
        nuxeoClientOption: {transactionTimeout: 1000, timeout: 1000} //, forever: true};
    };
    myModule.internal.defaultSchemasGetter = (userid, query) => {
        return ['dublincore', 'file'];
    };
    myModule.internal.defaultNXQLQueryGetter = (userid, arg1, arg2) => {
        return "SELECT * FROM Document"
            + " WHERE ecm:primaryType = 'file'"
            + " AND ecm:path STARTSWITH '/default-domain/workspaces/'"
            //+ " AND content/data IS NOT NULL"
            //+ " AND dc:title <> content/name"
            //+ " AND ecm:isProxy = 0 AND ecm:isCheckedInVersion = 0"
            //+ " AND ecm:currentLifeCycleState != 'deleted'"
            ;
        // myModule.internal.testSampleQuery = "SELECT ecm:uuid, ecm:fulltextScore FROM Document WHERE ecm:fulltext = '*'";
    };

    myModule.internal.isAhead = () => {
        const t1 = myModule.internal.readTimeLimit.getTime();
        const t2 = new Date().getTime();
        const b = t1 > t2;
        if (!b) {
            console.log('is Not Ahead', b, myModule.internal.readTimeLimit.toISOString());
        }
        return b;
    };

    myModule.internal.willBeTooLate = (delayInMs) => {
        const t1 = myModule.internal.readTimeLimit.getTime();
        const t2 = new Date().getTime() + delayInMs;
        const b = t1 < t2;
        if (b) {
            console.log('willBeTooLate', b, t1, t2);
        }
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

        let query = myModule.internal.defaultNXQLQueryGetter();
        console.log(query);

        return myModule.internal.nuxeoClient
            .repository()
            .schemas(myModule.internal.defaultSchemasGetter())
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
            .schemas(myModule.internal.defaultSchemasGetter())
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
            .schemas(myModule.internal.defaultSchemasGetter())
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
                const afterRequest = new Date();
                doc.requestTimeSpentInMs = afterRequest - beforeRequest;
                if (myModule.internal.brutInfoStream && myModule.internal.brutInfoStream.write) {
                    myModule.internal.brutInfoStream.write('Admin' + ',' + query.query + ',' + beforeRequest.toISOString() + ',' + afterRequest.toISOString() + ',' + doc.requestTimeSpentInMs + '\r\n');
                }
                return Promise.resolve(doc);
            })
            .catch(err => {
                const doc = {};
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                // console.error(err);
                return Promise.reject(err);
            });
    };

    myModule.internal.updatedReport = (clientId, report, doc) => {
        let newReport = report; //JSON.parse(JSON.stringify(report)); // copy values
        if (isEmpty(newReport)) {
            newReport.requestCount = 0;
            newReport.averageTime = 0;
            newReport.maxTime = 0;
            newReport.errorCount = 0;
        }

        newReport.clientId = clientId;
        if (!clientId) delete newReport.clientId;

        if (doc.requestTimeSpentInMs) {
            newReport.requestCount++;
            newReport.averageTime = ((newReport.averageTime * (newReport.requestCount - 1)) + doc.requestTimeSpentInMs) / newReport.requestCount;
            // newReport.averageTimePercentile95 = newReport.averageTime; // complex to do - what about min and because request time looks very stable
            newReport.maxTime = newReport.maxTime < doc.requestTimeSpentInMs ? doc.requestTimeSpentInMs : newReport.maxTime;
            newReport.minTime = newReport.minTime < doc.requestTimeSpentInMs ? newReport.minTime : doc.requestTimeSpentInMs;
        } else {
            const oldCount = newReport.requestCount;
            newReport.requestCount = oldCount + doc.requestCount;
            newReport.errorCount = newReport.errorCount + doc.errorCount;
            newReport.averageTime = ((newReport.averageTime * oldCount) + (doc.averageTime * doc.requestCount)) / newReport.requestCount;
            // newReport.averageTimePercentile95 = newReport.averageTime; // complex to do - what about min and because request time looks very stable
            newReport.maxTime = newReport.maxTime < doc.maxTime ? doc.maxTime : newReport.maxTime;
            newReport.minTime = newReport.minTime < doc.minTime ? newReport.minTime : doc.minTime;
        }

        return newReport;
    };

    myModule.internal.summarizedReports = (arr) => {
        const reduce = arr.reduce((a, b) => {
            if (isEmpty(b)) return a;

            return myModule.internal.updatedReport(null, a, b);
        }, {});

        return reduce;
    };

    myModule.internal.$multipleReadQuery = async (clientId, query) => {

        await myModule.internal.$initMultiple(clientId);

        const beforeRequest = new Date();

        return myModule.internal.nuxeoClients[clientId]
            .repository()
            .schemas(myModule.internal.defaultSchemasGetter(clientId, query))
            //.enricher('document', 'thumbnail')
            .query(query)
            .then(doc => {
                const afterRequest = new Date();
                doc.requestTimeSpentInMs = afterRequest - beforeRequest;
                //console.log('found : ', doc);
                if (myModule.internal.brutInfoStream && myModule.internal.brutInfoStream.write) {
                    myModule.internal.brutInfoStream.write('' + clientId + ',' + query.query + ',' + beforeRequest.toISOString() + ',' + afterRequest.toISOString() + ',' + doc.requestTimeSpentInMs + '\r\n');
                }
                return Promise.resolve(doc);
            })
            .catch(err => {
                const doc = {};
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                // console.error(err);
                return Promise.reject(err);
            });
    };

    myModule.internal.$multipleSearchDocumentList = async (clientId, arg1, arg2, report) => {

        let docs = {entries: []};
        try {
            const query = myModule.internal.defaultNXQLQueryGetter(clientId, arg1, arg2);
            console.log('launch query: ', query, myModule.internal.isAhead(), clientId);
            docs = await myModule.internal.$multipleReadQuery(clientId, {
                query: query,
                currentPageIndex: 0
            });
            report = myModule.internal.updatedReport(clientId, report, docs);
        } catch (error) {
            if (!report.errorCount) {
                report.errorCount = 0;
            }
            report.errorCount++;
            console.error('$multipleSearchDocument error1', new Date().toISOString(), error);
        }
        return docs;
    };

    myModule.internal.$multipleSearchDocument = async (clientId, folderId, category, docToFind, report) => {

        console.log('launch queries: ', myModule.internal.isAhead(), clientId);
        try {
            const docsFound = await myModule.internal.$multipleReadQuery(clientId, {
                query: `SELECT * FROM Document WHERE ecm:uuid = "${docToFind.uid}"`
            });

            if (docsFound.entries.length === 1) {
                //console.log('doc found ', clientId, docsFound.entries[0]);
                report = myModule.internal.updatedReport(clientId, report, docsFound);
            } else {
                console.error('error on doc ', new Date().toISOString(), clientId, docToFind.uid, docsFound.resultsCount);
                report.errorCount++;
            }
        } catch (error) {
            if (!report.errorCount) {
                report.errorCount = 0;
            }
            report.errorCount++;
            console.error('$multipleSearchDocument error1', new Date().toISOString(), error);
        }

        return report;
    };

    myModule.internal.multipleSearchDocuments = async (clientId, arg1, arg2) => {

        let report = {};
        await myModule.internal.$initMultiple(clientId);

        while (myModule.internal.isAhead()) {

            let docs = await myModule.internal.$multipleSearchDocumentList(clientId, arg1, arg2, report);
            console.log('docs.entries.length:', clientId, docs.entries.length, arg1, arg2);

            if (!docs || !docs.entries || docs.entries.length < 2) {
                console.warn('PB ? Should be a list of docs: ', clientId, docs.entries.length, arg1, arg2);
                report.errorCount++;
                await timeout(22000);
            } else {
                await timeout(2000);
                let docToFind = docs.entries[parseInt(Math.random() * (docs.entries.length - 1))];
                await myModule.internal.$multipleSearchDocument(clientId, arg1, arg2, docToFind, report);

                await timeout(10000);
                docToFind = docs.entries[parseInt(Math.random() * (docs.entries.length - 1))];
                await myModule.internal.$multipleSearchDocument(clientId, arg1, arg2, docToFind, report);

                await timeout(10000);
            }
        }

        return report;
    };

    myModule.internal.$searchDocumentWithTitle = async (title) => {

        let report = {};
        await myModule.internal.$init();

        try {
            const docsFound = await myModule.internal.$readQuery({
                query: `SELECT * FROM Document WHERE dc:title = "${title}"`
            });
            if (docsFound &&
                docsFound.entries &&
                docsFound.entries.length === 1 &&
                docsFound.entries[0].title === title) {
                report = myModule.internal.updatedReport('Admin', report, docsFound);

                // download blob
                const beforeDownload = new Date();
                const resBlob = await docsFound.entries[0].fetchBlob();
                const blob = await resBlob.blob();
                if (blob) {
                    report.fetchBlobTime = new Date() - beforeDownload;
                    console.log('report.fetchBlobTime:', report.fetchBlobTime, blob);
                } else {
                    report.errorCount = 1;
                }
            } else {
                report.errorCount = 1;
            }
        } catch (error) {
            report.errorCount = 1;
            console.error('$searchDocumentWithTitle error', new Date().toISOString(), error);
        }

        return report;
    };

    myModule.internal.$multipleSearchDocumentsWithDelay = async (clientId, arg1, arg2, delayInMs) => {

        if (myModule.internal.willBeTooLate(delayInMs)) {
            return {};
        }

        await timeout(delayInMs);

        if (!myModule.internal.isAhead()) {
            return {};
        }

        const report = await myModule.internal.multipleSearchDocuments(clientId, arg1, arg2);

        return report;
    };

    myModule.internal.$searchDocumentWithTitleAndDelay = async (title, delayInMs) => {

        await timeout(delayInMs);
        const report = await myModule.internal.$searchDocumentWithTitle(title);
        return report;
    };

    myModule.internal.$searchAsManyUsersForDocumentListAndReadThem = async (sourceFilename) => {

        const data = await readFile(sourceFilename, 'utf8');
        const lines = data.split('\n');
        let parallels = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].split(',');
            const addr = emailAddresses.parseOneAddress(line[0]);
            const arg1 = parseInt(line[1]);
            const arg2 = line[2];//parseInt(line[2]);
            if (addr && arg1 && arg2) {
                parallels.push(myModule.internal.$multipleSearchDocumentsWithDelay(addr.address, arg1, arg2, i * 3500));
            }
        }
        const reports = await Promise.all(parallels);
        const report = {docCount: 0, entries: reports};

        try {
            const count = await myModule.internal.$readQuery({
                //query: `SELECT * FROM Document WHERE ecm:mixinType != HiddenInNavigation AND ecm:isProxy = 0 AND ecm:isVersion = 0 AND ecm:isTrashed = 0`
                query: `SELECT * FROM Document`
            });
            report.docCount = count.resultsCount;
        } catch (error) {
            console.error('$searchAsManyUsersForDocumentListAndReadThem error', new Date().toISOString(), error);
        }

        return report;
    };

    myModule.internal.$searchForDocumentsAndReadThem = async (sourceFilename) => {

        const data = await readFile(sourceFilename, 'utf8');
        const lines = data.split('\n');
        let parallels = [];
        for (let i = 0; i < lines.length; i++) {
            const title = lines[i];
            if (title) {
                parallels.push(myModule.internal.$searchDocumentWithTitleAndDelay(title, i * 3500));
            }
        }
        const reports = await Promise.all(parallels);
        return reports;
    };

    myModule.internal.setDefaultConfiguration = (options) => {
        if (process.env.TRACE_LEVEL !== 'debug') {
            console.log = () => {
            };
        }
        if (options && options.readTimeLimitInSec) {
            myModule.internal.readTimeLimit.setSeconds(myModule.internal.readTimeLimit.getSeconds() + options.readTimeLimitInSec);
        } else {
            myModule.internal.readTimeLimit.setSeconds(myModule.internal.readTimeLimit.getSeconds() + 10);
        }
        if (options && options.NXQLQueryGetter) {
            myModule.internal.defaultNXQLQueryGetter = options.NXQLQueryGetter;
        }
        if (options && options.schemasGetter) {
            myModule.internal.defaultSchemasGetter = options.schemasGetter;
        }
        if (options && options.defaultConfiguration) {
            myModule.internal.defaultConfiguration = options.defaultConfiguration;
        }
    };


    myModule.public.searchAsManyUsersForDocumentListAndReadThem = (options) => {

        myModule.internal.setDefaultConfiguration(options);

        const jobDate = new Date();

        return through.obj((file, encoding, cb) => {
                let brutInfoStream = fs.createWriteStream(`./outputs/report-searchAsManyUsersForDocumentsAndReadThem-${jobDate.toISOString()}.gitignored.csv`);
                brutInfoStream.once('open', () => {

                    myModule.internal.brutInfoStream = brutInfoStream;
                    myModule.internal.$searchAsManyUsersForDocumentListAndReadThem(file.path)
                        .then((readReport) => {
                            console.warn('Final report, total of docs:', readReport.docCount, '\nrequests average:', myModule.internal.summarizedReports(readReport.entries));

                            brutInfoStream.end();
                            let reportFile = fs.createWriteStream(`./outputs/report-searchAsManyUsersForDocumentsAndReadThem-${jobDate.toISOString()}.gitignored.json`);
                            reportFile.once('open', () => {
                                reportFile.write(JSON.stringify(readReport));
                                reportFile.end();
                            });
                            cb(null, file);
                        })
                        .catch((err) => {
                            brutInfoStream.end();
                            cb(err);
                        });
                });
            },
            (cb) => {
                cb(null);
            });
    };

    myModule.public.searchForDocumentsAndReadThem = (options) => {

        myModule.internal.setDefaultConfiguration(options);

        const jobDate = new Date();

        return through.obj((file, encoding, cb) => {
                let brutInfoStream = fs.createWriteStream(`./outputs/report-searchForDocumentsAndReadThem-${jobDate.toISOString()}.gitignored.csv`);
                brutInfoStream.once('open', () => {

                    myModule.internal.brutInfoStream = brutInfoStream;
                    myModule.internal.$searchForDocumentsAndReadThem(file.path)
                        .then((readReport) => {
                            console.warn('Final report, total of docs:', readReport.length);

                            brutInfoStream.end();
                            let reportFile = fs.createWriteStream(`./outputs/report-searchForDocumentsAndReadThem-${jobDate.toISOString()}.gitignored.json`);
                            reportFile.once('open', () => {
                                reportFile.write(JSON.stringify(readReport));
                                reportFile.end();
                            });
                            cb(null, file);
                        })
                        .catch((err) => {
                            brutInfoStream.end();
                            cb(err);
                        });
                });
            },
            (cb) => {
                cb(null);
            });
    };

    return myModule;
};

exports.nuxeoRead = nuxeoRead(false).public;
