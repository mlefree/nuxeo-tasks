const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');


const databaseModule = (inTestMode) => {
    let myModule = {};
    myModule.internal = {};
    myModule.public = {};
    myModule.internal.client = null;


    myModule.internal.url = 'mongodb://root:example@localhost:8611'; //'mongodb://localhost:27017';
    myModule.internal.dbName = 'myproject';


    myModule.public.$connect = () => {

        myModule.internal.client = new MongoClient(myModule.internal.url);

        return new Promise((resolve, reject) => {
            myModule.internal.client.connect((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log("Connected successfully to server : ", err);

                    myModule.public.db = client.db(myModule.internal.dbName);
                    resolve(myModule.public.db);
                }
            });
        });
    };

    myModule.public.$close = () => {
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
