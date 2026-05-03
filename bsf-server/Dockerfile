## build environment
FROM node:24-alpine AS build_env
WORKDIR /src
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile && yarn cache clean
COPY . .
RUN yarn run build

## production environment
FROM node:24-alpine AS runtime_env
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build_env /src/build ./
COPY --from=build_env /src/data ./data
COPY --from=build_env /src/package.json ./
COPY --from=build_env /src/yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean
EXPOSE 8082
CMD ["node", "./index.js"]
