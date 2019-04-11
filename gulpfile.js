const dotenv = require('dotenv').config();
const {src, dest, task, parallel, series} = require('gulp');
const {nuxeoImport} = require('./src/nuxeo-import');
const {nuxeoRead} = require('./src/nuxeo-read');
const randomSentence = require('random-sentence');
const uuidv4 = require('uuid/v4');

// todo : set special config into /extra directory, and set them if present
const myImportOptions = {
    defaultRepo: process.env.NUXEO_IMPORT_PATH,
    structureGetter: (folderId, folderName, fileIndex) => {
        const filename = 'file-' + folderId + '-' + fileIndex;
        const text = randomSentence() + ' ' + folderId + ' ' + randomSentence();
        const objToken = uuidv4(); // random 'xxxxxxxx-yyyy-zzzz-zzzz-1234567890123';
        const categories = [1, 2, 3, 4, 5, 6];
        let category = '' + categories[5];
        if (fileIndex < 12) category = '' + categories[0];
        else if (fileIndex < 15) category = '' + categories[1];
        else if (fileIndex < 17) category = '' + categories[2];
        else if (fileIndex < 18) category = '' + categories[3];
        else if (fileIndex < 19) category = '' + categories[4];

        return {
            'entity-type': 'document',
            name: filename,
            type: 'myNote',
            properties: {
                'dc:title': filename,
                //'dc:description': randomSentence(),
                'csc:Categorie': category,
                'note:note': text,
                'note:mime_type': 'text/plain',
                'csc:ObjToken': objToken,
                'csc:NumAVS': folderId
            }
        };
    }
};

const myReadOptions = {
    readTimeLimitInSec: 7200 // 7200 = 2h
};

function userImport() {
    return src('./csv/email.toimport.*')
        .pipe(nuxeoImport.createUsersFromEmailFile());
}

function foldersDemoImport() {
    return parallel(nuxeoImport.createFoldersDemo(myImportOptions));
}

function foldersFromFileImport() {
    return src('./csv/ids.toimport.*')
        .pipe(nuxeoImport.createFoldersFromFile(myImportOptions));
}

function readFromFileRampUp() {
    return src('./csv/email-ids.toread.*')
        .pipe(nuxeoRead.searchAsManyUsersForDocumentsAndReadThem(myReadOptions));
}

function readDocumentsFromFile() {
    return src('./csv/docs.toread.*')
        .pipe(nuxeoRead.searchForDocumentsAndReadThem(myReadOptions));
}

// Tasks :
exports.userImport = userImport;
exports.foldersDemoImport = foldersDemoImport;
exports.foldersFromFileImport = foldersFromFileImport;
exports.readFromFileRampUp = readFromFileRampUp;
exports.readDocumentsFromFile = readDocumentsFromFile;
exports.allImport = series(userImport, foldersDemoImport);
exports.all = series(userImport, foldersDemoImport, readFromFileRampUp);
exports.default = series(readFromFileRampUp);
