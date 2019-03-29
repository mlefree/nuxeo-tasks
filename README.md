# nuxeo-tasks
nuxeo node task examples


npm i
npm i -g gulp-cli

launch mongo and nuxeo test env:
```bash

docker-compose up

# or if you already have a nuxeo env, mongo only
docker-compose up mongo


nohup docker-compose up mongo > docker-compose.out 2>&1 &

nohup gulp taskImport > gulp.out 2>&1 &

```


- **TODO** dot env
- **TODO** database
