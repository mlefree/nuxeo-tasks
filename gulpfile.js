const {src, dest, parallel, series} = require('gulp');
const {nuxeoImport} = require('./src/nuxeo-import');
const randomSentence = require('random-sentence');
require('dotenv').config();
const uuidv4 = require('uuid/v4');

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
    //TODO could be launch like it:
     //.pipe(nuxeoImport.createFoldersFromFile())
        .pipe(nuxeoImport.createFoldersFromFile(myOptions))
    ;
}


function userImport() {

    return src('./csv/email.toimport.*')
        .pipe(nuxeoImport.createUsersFromEmailFile())
        ;
}

exports.taskImport = taskImport;
exports.userImport = userImport;
exports.default = series(userImport, taskImport);
