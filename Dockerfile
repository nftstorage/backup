FROM cimg/node:18.13.0
USER circleci
RUN mkdir -p /home/circleci/app
WORKDIR /home/circleci/app
COPY --chown=circleci:circleci package*.json *.js ./
RUN npm install
CMD [ "npm", "start" ]
