require('dotenv').config();
const {NuxeoCollection} = require('./src/nuxeo-collection');
const {NuxeoImport} = require('./src/nuxeo-import2');
const {NuxeoRead} = require('./src/nuxeo-read2');

// Enjoy tasks :
let tasks = {};
[NuxeoCollection, NuxeoImport, NuxeoRead]
    .forEach((classObject) => {
        const allFunction = Object.getOwnPropertyNames(classObject)
            .filter(prop => (
                (typeof classObject[prop] === "function") &&
                ((prop.indexOf('task') >= 0) || (prop.indexOf('challenge') >= 0)))
            );
        allFunction.forEach((fnName) => {
            tasks['' + classObject.name + '-' + fnName] = classObject[fnName];
        });
    });

// Extra tasks :
try {
    const {extraTasks} = require('./extra');
    tasks = extraTasks(tasks);
} catch (e) {
    console.log('Some extra tasks can be created and used (ask raain sales)')
}

// Gulp tasks :
module.exports = tasks;

