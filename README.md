# nuxeo-tasks
Nuxeo node task examples like import folders, users, reading documents...

![Screen01](screenshots/nuxeo-tasks-01.gif)

## Prerequisites

Tools like : Node, npm, docker, docker-compose, gulp-cli.

Then install project :
```bash
npm i
npm i -g gulp-cli
```

Launch task:
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

## Todo

- **TODO** mongodb useability (switch) in order to store (or not) id created
- **TODO** add tasks ?


## Contributors

Please pull/request the project.

Contribs : @mat_cloud
