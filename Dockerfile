FROM ubuntu:16.04

RUN apt-get update && apt-get -y install curl
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash -
RUN apt-get -y install nodejs

WORKDIR app

COPY package.json .
COPY .babelrc .

RUN npm i
RUN node -v

COPY src ./src
RUN npx babel src --out-dir lib --source-maps-inline

EXPOSE 7000

CMD ["node", "lib/payserver.js"]
