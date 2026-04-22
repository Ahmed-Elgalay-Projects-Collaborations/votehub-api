FROM public.ecr.aws/docker/library/node:22-alpine AS base

WORKDIR /usr/src/app
COPY package*.json ./

FROM base AS development
RUN npm ci
COPY src ./src
RUN chown -R node:node /usr/src/app
ENV NODE_ENV=development
EXPOSE 3100
USER node
CMD ["npm", "run", "dev"]

FROM base AS production
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir -p logs && chown -R node:node /usr/src/app
ENV NODE_ENV=production
EXPOSE 3100
USER node
CMD ["npm", "start"]
