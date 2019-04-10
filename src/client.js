import { WebSocket } from 'ws'
import { WalletClient } from 'bclient'
import { Network } from 'bcoin'
import { promisify } from 'util'


export default class Client {
    constructor(conn, receipt) {
        this.receipt = receipt;
        this.connection = conn;
        this.connection.on('message', this.initiatePayout.bind(this));
    }

    async initiatePayout(response) {
        try {
            var data = JSON.parse(response)

            this.token = data['token'];
            this.destinationAddress = data['destinationAddress'].trim();
            this.receipt.clients[this.token] = this;

            this.status = await this.receipt.getPlayerAsync(this.token, 'status');
            this.gameserverid = await this.receipt.getPlayerAsync(this.token, 'game');
            this.unconfirmed = await this.receipt.getGamesAsync(this.gameserverid, 'unconfirmed');

            this.status = 'pending pay'
            this.winnings = parseInt((this.unconfirmed * this.receipt.winnersPercentage) - this.receipt.rate);
            this.receipt.redisClientPlayers.hset(this.token, 'winnings', this.winnings);
            this.receipt.redisClientPlayers.hset(this.token, 'status', this.status);

            while (this.confirmed < this.winnings) {
                this.confirmed = 0;
                this.playersInGame = await this.receipt.getPlayersInGameAsync(this.gameserverid);
                for (var p in playersInGame) {

                    var incr = 0
                    var result = await this.receipt.wallet.getAccount(token);

                    if (result && result.balance.confirmed >= 1) {
                        this.receipt.redisClientPlayers.hset(token, 'confirmed', result.balance.confirmed.toString());
                        incr = result.balance.confirmed;
                    }

                    if (incr > 0) {
                        this.receipt.removePlayerInGameAsync(this.gameserverid, playersInGame[p])
                    }

                    this.confirmed += incr;
                    this.receipt.redisClientPlayers.hset(this.token, 'status', this.confirmed);
                }
                await this.sleep(15 * 1000); //sleep for 15 seconds
            }

            const options = {
                rate: this.receipt.rate,
                outputs: [{ value: this.winnings, address: this.destinationAddress }]
            };

            var result = await this.receipt.wallet.send(options);
            this.transactionId = result['hash'];

            this.status = 'paid out'
            this.receipt.redisClientPlayers.hset(this.token, 'status', this.status);
            this.receipt.redisClientPlayers.hset(this.token, 'transactionId', this.transactionId);
        } catch (err) {
            console.log("error paying winner: " + err)
            this.connection.send(JSON.stringify({ 'error': err }));
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
