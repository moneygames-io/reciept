import { WalletClient } from 'bclient';
import { Network } from 'bcoin';
import WebSocket from 'ws';
import redis from 'redis';

import Client from './client';

class Reciept {
    constructor() {
        const network = Network.get(process.env.NET);
        const walletOptions = {
            port: network.walletPort,
            host: process.env.NET + ".moneygames.io",
            network: network.type,
            apiKey: process.env.APIKEY,
            ssl: (process.env.SSL === 'true')
        };
        this.walletClient = new WalletClient(walletOptions);
        this.redisClientPlayers = this.connectToRedis(6379, 'redis-players')
        this.redisClientGames = this.connectToRedis(6379, 'redis-gameservers')
        this.server = new WebSocket.Server({ port: 7002 });
        this.clients = [];
        this.server.on('connection', this.newWinner.bind(this));
    }

    connectToRedis(port, name) {
        let client = redis.createClient(port, name)
        client.on('connect', function() {
            console.log("connected " + name)
        });
        client.on('error', function(err) {
            console.log('Something went wrong ', err)
        });
        return client
    }

    newWinner(connection) {
        var client = new Client(connection, this)
        this.clients.push(client);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    try {
        new Reciept();
    } catch (err) {
        console.log(err)
    }
})()