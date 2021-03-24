# nuxeo-tasks
Nuxeo node task examples like import folders, users, reading documents...

![Screen01](screenshots/nuxeo-tasks-01.gif)

## Install

You need tools like : Node, npm, docker, docker-compose, gulp-cli.

1. Install project `npm i`
1. Install _gulp_ locally `npm i -g gulp-cli`
1. Edit your *.env* file (you can copy *.env.example*).
1. Create your inputs files like _./inputs/email.toimport.gitignored.csv_  or _./inputs/email-ids.toread.gitignored.csv_

## Launch tasks

```bash
# discover tasks available
gulp --tasks

# if you need a simple demo folders
nohup gulp foldersDemoImport --max-old-space-size=4096 > gulp.out 2>&1 &

# or simulate readers
nohup gulp readFromFileRampUp --max-old-space-size=4096 > gulp-read.out 2>&1 &
# ...

# if you need folders based on file ids
# or if you already have a nuxeo env, mongo only
docker-compose up mongo
nohup docker-compose up mongo > docker-compose.out 2>&1 &
```

## Contributors

Please pull/request the project.

Contacts : @mat_cloud
