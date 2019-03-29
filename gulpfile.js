const {src, dest, task, parallel, series} = require('gulp');
require('dotenv').config();
const {nuxeoImport} = require('./src/nuxeo-import');
const {nuxeoRead} = require('./src/nuxeo-read');
const randomSentence = require('random-sentence');
const uuidv4 = require('uuid/v4');


function userImport() {
    return src('./csv/email.toimport.*')
        .pipe(nuxeoImport.createUsersFromEmailFile()) ;
}

function taskImport() {

    const myOptions = {
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

    return src('./csv/ids.toimport.*')
        .pipe(nuxeoImport.createFoldersDemo(myOptions));
}

function readRampUp() {
    return src('./csv/email-ids.toimport.*')
        .pipe(nuxeoRead.searchAsManyUsersForDocumentsAndReadThem()) ;
}

exports.default = series(readRampUp);
exports.userImport = userImport;
exports.taskImport = taskImport;
exports.readRampUp = readRampUp;
exports.allImport = series(userImport, taskImport);
exports.all = series(userImport, taskImport, readRampUp);
