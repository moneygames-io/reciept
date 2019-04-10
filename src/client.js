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

            // get user data from message
            this.token = data['token'];
            this.destinationAddress = data['destinationAddress'].trim();
            this.receipt.clients[this.token] = this;

            // check redis for valid player
            this.status = await this.receipt.getPlayerAsync(this.token, 'status');
            this.gameserverid = await this.receipt.getPlayerAsync(this.token, 'game');
            this.unconfirmed = await this.receipt.getGamesAsync(this.gameserverid, 'unconfirmed');

            // update redis
            this.status = 'pending pay'
            this.winnings = parseInt((this.unconfirmed * this.receipt.winnersPercentage) - this.receipt.rate);
            this.receipt.redisClientPlayers.hset(this.token, 'winnings', this.winnings);
            this.receipt.redisClientPlayers.hset(this.token, 'status', this.status);

            while (this.confirmed < this.winnings) {
                this.confirmed = 0;
                this.playersInGame = await this.receipt.getPlayersInGameAsync(this.gameserverid);
                for (var p in playersInGame) {

                    // check player from game for confirmed amount
                    var result = await this.receipt.wallet.getAccount(token);
                    if (result && result.balance.confirmed >= 1) {
                        this.confirmed += result.balance.confirmed;
                        this.receipt.removePlayerInGameAsync(this.gameserverid, playersInGame[p])
                    }
                }
                // update redis
                this.receipt.redisClientPlayers.hset(this.token, 'confirmed', this.confirmed);
                await this.sleep(15 * 1000); // sleep for 15 seconds
            }

            // payout user
            const winningPaymentOptions = {
                rate: this.receipt.rate,
                outputs: [{ value: this.winnings, address: this.destinationAddress }]
            };
            var result = await this.receipt.wallet.send(winningPaymentOptions);
            this.transactionId = result['hash'];

            // update redis to signify successful payout
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