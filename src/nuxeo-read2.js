const {NuxeoCommon} = require("./nuxeo-common");

class NuxeoRead extends NuxeoCommon {

    static FOLDER_PATH = '/';

    constructor() {
        super();
    }

    static async taskChallenge() {

        const nuxeoRead = new NuxeoRead();
        await nuxeoRead.createFolder(this.FOLDER_PATH);

    }

}

module.exports = {NuxeoRead};
