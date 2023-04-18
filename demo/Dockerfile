FROM node:18
WORKDIR /app
COPY --chown=node:node package.json yarn.lock ./
RUN yarn install # --frozen-lockfile
COPY --chown=node:node . .
ARG PORT=3000
ENV PORT=$PORT
EXPOSE $PORT
ENV NODE_ENV=production
RUN yarn build
CMD ["yarn", "serve"]
