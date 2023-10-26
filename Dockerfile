## build environment
FROM node:21.1.0-alpine as build_env
WORKDIR /src
# Copy entire project
COPY . .
# Install build dependencies
RUN yarn install --frozen-lockfile && yarn cache clean
# Build project
RUN yarn run build

# production environment
FROM node:21.1.0-alpine as runtime_env
ENV NODE_ENV=production
# Copy build output to working dir
WORKDIR /app
COPY --from=build_env /src/build ./
# HACK: THIS IS A WORKAROUND FOR MOCKED DATA
COPY --from=build_env /src/data ./data
# Copy required packages and app config
COPY --from=build_env /src/yarn.lock ./
COPY --from=build_env /src/package.json ./
RUN yarn install --frozen-lockfile --production && yarn cache clean
RUN printenv
CMD node ./index.js