## build environment
FROM node:20-alpine as node_server
WORKDIR /src
# Copy entire project
COPY . .
# Install build dependencies
RUN yarn install --frozen-lockfile && yarn cache clean
# Build project
RUN yarn run build

# production environment
FROM node:20-alpine
ENV NODE_ENV=production
# Copy build output to working dir
WORKDIR /app
COPY --from=node_server /src/build ./
# HACK: THIS IS A WORKAROUND FOR MOCKED DATA
COPY --from=node_server /src/data ./data
# Copy required packages and app config
COPY --from=node_server /src/yarn.lock ./
COPY --from=node_server /src/package.json ./
RUN yarn install --frozen-lockfile --production && yarn cache clean
RUN printenv
CMD node ./index.js