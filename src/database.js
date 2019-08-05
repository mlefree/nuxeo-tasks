const MongoClient = require('mongodb').MongoClient;
// const assert = require('assert');

const databaseModule = (inTestMode) => {
    let myModule = {};
    myModule.internal = {};
    myModule.public = {};
    myModule.internal.client = null;

    myModule.internal.url = 'mongodb://root:example@localhost:8611'; //'mongodb://localhost:27017';
    myModule.internal.dbName = 'myproject';

    myModule.public.$connect = () => {

        if (!myModule.internal.client) {
            myModule.internal.client = new MongoClient(myModule.internal.url);
        }

        if (myModule.public.db) {
            console.log("Still Connected");
            return Promise.resolve(myModule.public.db);
        }

        return new Promise((resolve, reject) => {
            myModule.internal.client.connect((err) => {
                if (err) {
                    reject(err);
                } else if (myModule.public.db) {
                    console.log("Still Connected...");
                    resolve(myModule.public.db);
                } else {
                    console.log("Connected successfully to server.");
                    myModule.public.db = myModule.internal.client.db(myModule.internal.dbName);
                    resolve(myModule.public.db);
                }
            });
        });
    };

    myModule.public.$close = () => {
        if (!myModule.internal.client) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            myModule.internal.client.close(false, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('db closed');
                    resolve();
                }
            });
        })
    };

    return myModule;
};

exports.database = databaseModule(false).public;
