const fs = require('fs');
const Nuxeo = require('nuxeo');

class NuxeoOauth {

    constructor() {
    }

    init() {

        // For more information on OAuth2 server side, see [Using OAuth2](https://doc.nuxeo.com/nxdoc/using-oauth2/).
        // Or https://github.com/nuxeo/nuxeo-js-client#oauth2-authorization-and-bearer-token-authentication

        const nuxeoClient = new Nuxeo({
            baseURL: process.env.NUXEO_URL || 'http://localhost:8610/nuxeo',
            auth: {
                method: 'bearerToken',
                token: access_token,
                clientId: 'my-app' // optional OAuth2 client ID to refresh the access token
            }
        });
    }

}

exports.NuxeoOauth = NuxeoOauth;
