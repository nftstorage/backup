FROM cimg/node:lts
USER circleci
RUN mkdir -p /home/circleci/app
WORKDIR /home/circleci/app
COPY --chown=circleci:circleci package*.json *.js ./
COPY --chown=circleci:circleci bin/*.js ./bin/
RUN npm install
CMD [ "npm", "start" ]
