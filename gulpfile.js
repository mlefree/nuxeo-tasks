const {src, dest, parallel} = require('gulp');
const {nuxeoImport} = require('./src/nuxeo-import');

var CDNs = [];

function taskImport() {
    return src('src/*.js', {sourcemaps: true})
        .pipe(nuxeoImport.createFolders('/static', CDNs))
}

exports.taskImport = taskImport;
exports.default = parallel(taskImport);
