const {NuxeoCommon} = require("./nuxeo-common");

class NuxeoImport extends NuxeoCommon {

    static FOLDER_PATH = '/import-test';

    constructor() {
        super();
    }

    static async taskChallenge() {

        const nuxeoImport = new NuxeoImport();
        await nuxeoImport.createFolder(this.FOLDER_PATH);

    }

}

module.exports = {NuxeoImport};
