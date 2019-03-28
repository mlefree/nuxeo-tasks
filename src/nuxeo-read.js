'use strict';

const fs = require('fs');
const through = require('through2');
const Nuxeo = require('nuxeo');
const randomSentence = require('random-sentence');
//const {database} = require('./database');

const nuxeoRead = (inTestMode) => {
    let myModule = {};
    myModule.internal = {};
    myModule.public = {};

    myModule.internal.readTimeLimit = new Date(new Date() + 1);
    myModule.internal.nuxeoClient = null;
    myModule.internal.nuxeoClients = {};
    myModule.internal.database = null;
    myModule.internal.defaultRepo = '/default-domain/workspaces/test-perf-node/';
    myModule.internal.testReadQuery = "SELECT * FROM Document"
        + " WHERE ecm:primaryType = 'File'"
        + " AND ecm:path STARTSWITH '/default-domain/workspaces/'"
    //+ " AND content/data IS NOT NULL"
    //+ " AND dc:title <> content/name"
    //+ " AND ecm:isProxy = 0 AND ecm:isCheckedInVersion = 0"
    //+ " AND ecm:currentLifeCycleState != 'deleted'"
    ;
    myModule.internal.testSampleQuery = "SELECT ecm:uuid, ecm:fulltextScore FROM Document WHERE ecm:fulltext = '*'";
    myModule.internal.nuxeoClientOption = {transactionTimeout: 1000, timeout: 1000};//, forever: true};

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
            //.schemas(['dublincore', 'file'])
            .enricher('document', 'thumbnail')
            .query(query)
            // TODO MLE .queryAndFetch() ?
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


    // Dans ce cadre, un scénario simple peut être réalisé :
    //  Recherche des documents disposant d’un numéro AVS précis ainsi que d’une catégorie
    //  Pause de 2 secondes
    //  Lecture d’un des documents issus de la recherche
    //  Pause de 20 secondes
    //  Lecture d’un des documents issus de la recherche
    //  Pause de 20 secondes

    // Les utilisateurs de tests doivent être au nombre de 500 avec une pente de montée en charge d’une demi-heure,
    // soit environ 17 utilisateurs supplémentaires toute les minutes.
    // Le test doit se dérouler sur 2h :
    // 30 minutes de montée en charge
    // 1h30 de traitement au plafond du nombre d’utilisateurs
    myModule.internal.computeReport = (report, doc) => {
        let newReport = JSON.parse(JSON.stringify(report)); // copy values

        newReport.requestCount++;
        newReport.averageTime = doc.requestTimeSpentInMs;
        newReport.averageTimeCentile = doc.requestTimeSpentInMs;
        newReport.maxTime = newReport.maxTime < doc.requestTimeSpentInMs ? doc.requestTimeSpentInMs : newReport.maxTime;
        return newReport;
    };

    myModule.internal.$multipleSearchDocument = async (clientId) => {

        await myModule.internal.$initMultiple(clientId);
        let report = {
            requestCount: 0,
            averageTime: 0,
            averageTimeCentile: 0,
            maxTime: 0,
            errorPercent: 0
        };
        try {
            const docs = await myModule.internal.$multipleReadQuery(clientId, {
                query: 'SELECT * FROM Picture WHERE ecm:mixinType != &apos;HiddenInNavigation&apos;  AND ecm:isTrashed = 0',
                currentPageIndex: 0
            });
            report = myModule.internal.computeReport(report, docs);

            while(myModule.internal.timeLimit < new Date()) {

                await setTimeout(() => {
                }, 2000);

                docs[Math.random()*5]
                const doc = await myModule.internal.$multipleFetchDocument(clientId, {
                    query: 'SELECT * FROM Picture WHERE ecm:mixinType != &apos;HiddenInNavigation&apos;  AND ecm:isTrashed = 0',
                    currentPageIndex: 0
                });
                report = myModule.internal.computeReport(report, docs);
            }

        } catch (error) {
            report.errorPercent++;
            console.error('$multipleSearchDocument error', error);
        }
        return report;
    };

    myModule.public.searchAsManyUsersForDocumentsAndReadThem = (options) => {

        if (options && options.readTimeLimit) {
            myModule.internal.readTimeLimit = options.readTimeLimit;
        }

        return through.obj((file, encoding, cb) => {
                myModule.internal.$searchAsManyUsersForDocumentsAndReadThem(file.path)
                    .then((readReports) => {
                        console.warn('readReports:', readReports);
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
