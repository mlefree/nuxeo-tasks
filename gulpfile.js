const dotenv = require('dotenv').config();
const {src, dest, task, parallel, series} = require('gulp');
const {nuxeoImport} = require('./src/nuxeo-import');
const {nuxeoRead} = require('./src/nuxeo-read');
// todo workflow tasks using : const workflowTest = require('nuxeo-workflow-test/index');

// Extra configs :
let myImportOptions = {};
try {
    myImportOptions = require('./extra').myImportOptions;
} catch (e) {
}
let myReadOptions = {};
try {
    myReadOptions = require('./extra').myReadOptions;
} catch (e) {
}

// Tasks functions :
function userImport() {
    return src('./inputs/email.toimport.*')
        .pipe(nuxeoImport.createUsersFromEmailFile());
}

function foldersDemoImport() {
    return src('./inputs/email.toimport.*')
        .pipe(nuxeoImport.createFoldersDemo(myImportOptions));
}

// todo : foldersFromFileImport not working
function foldersFromFileImport() {
    return src('./inputs/ids.toimport.*')
        .pipe(nuxeoImport.createFoldersFromFile(myImportOptions));
}

function createDemoComplexStructure() {
    return src('./inputs/email.toimport.*')
        .pipe(nuxeoImport.createDemoComplexStructure(myImportOptions));
}

function readFromFileRampUp() {
    return src('./inputs/email-ids.toread.*')
        .pipe(nuxeoRead.searchAsManyUsersForDocumentListAndReadThem(myReadOptions));
}

function readDocumentsFromFile() {
    return src('./inputs/docs.toread.*')
        .pipe(nuxeoRead.searchForDocumentsAndReadThem(myReadOptions));
}

// Tasks :
exports.userImport = userImport;

exports.foldersDemoImport = foldersDemoImport;
exports.foldersFromFileImport = foldersFromFileImport;
exports.createDemoComplexStructure = createDemoComplexStructure;

exports.readFromFileRampUp = readFromFileRampUp;
exports.readDocumentsFromFile = readDocumentsFromFile;

exports.allImport = series(userImport, foldersDemoImport);
exports.all = series(userImport, foldersDemoImport, readFromFileRampUp);
exports.default = series(readFromFileRampUp);
