# nuxeo-tasks
Nuxeo node task examples like import folders, users, reading documents...

![Screen01](screenshots/nuxeo-tasks-01.gif)

## Install

You need tools like : Node, npm, docker, docker-compose, gulp-cli.

1. Install project `npm i`
1. Install _gulp_ locally `npm i -g gulp-cli`
1. Edit your *.env* file (you can copy *.env.example*).

## Launch tasks

```bash
# do you have nNuxeo already running ? if not, you can use docker:
docker-compose up -d

# discover available tasks:
gulp --tasks

# example: if you need a simple demo folders
nohup gulp NuxeoImport-taskChallenge --max-old-space-size=4096 > gulp-import.out 2>&1 &

# example: or simulate readers
nohup gulp NuxeoRead-taskChallenge --max-old-space-size=4096 > gulp-read.out 2>&1 &
# ...
```

## Contributors

Please pull/request the project.

Contacts : @mat_cloud
