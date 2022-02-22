FROM cimg/node:lts
USER circleci
RUN mkdir -p /home/circleci/app
WORKDIR /home/circleci/app
COPY --chown=circleci:circleci package*.json *.js ./
RUN npm install
CMD [ "npm", "start" ]
