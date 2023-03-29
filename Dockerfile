FROM node:18.15.0-slim

WORKDIR /usr/src/app
COPY package*.json *.js ./
RUN npm ci --omit=dev

COPY *.js *.json *.sh ./
CMD [ "npm", "start", "--silent"]

HEALTHCHECK --interval=60s --timeout=1s --start-period=5s --retries=3 CMD [ "curl" "https://127.0.0.1:9999" "--fail" ]
