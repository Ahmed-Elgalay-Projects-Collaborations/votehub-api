FROM mongo:7

COPY docker/mongo-init.js /docker-entrypoint-initdb.d/mongo-init.js

