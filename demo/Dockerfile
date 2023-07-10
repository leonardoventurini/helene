FROM node:18-alpine as build
WORKDIR /app
COPY --chown=node:node package.json yarn.lock ./
RUN yarn install --pure-lockfile
COPY --chown=node:node . .
RUN yarn bundle:client
RUN yarn bundle:server

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ARG PORT=3000
ENV PORT=$PORT
EXPOSE $PORT
COPY --from=build /app/src src
COPY --from=build /app/package.json .
CMD ["yarn", "serve"]
