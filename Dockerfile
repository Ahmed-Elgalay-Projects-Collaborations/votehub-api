FROM node:22.22.1-alpine3.22 AS base

WORKDIR /usr/src/app
COPY package*.json ./

FROM base AS development
RUN npm install
COPY src ./src
ENV NODE_ENV=development
EXPOSE 3100
CMD ["npm", "run", "dev"]

FROM base AS production
RUN npm install --omit=dev
COPY src ./src
ENV NODE_ENV=production
EXPOSE 3100
CMD ["npm", "start"]
