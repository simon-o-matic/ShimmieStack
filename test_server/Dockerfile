FROM node:14

WORKDIR /app

COPY package*.json /app
RUN npm install

RUN npm install -g nodemon
RUN npm install -g jest

CMD npm run run