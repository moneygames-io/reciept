import { WebSocket } from 'ws'
import { WalletClient } from 'bclient'
import { Network } from 'bcoin'
import { promisify } from 'util'


export default class Client {
    constructor(conn, receipt) {
        this.receipt = receipt;
        this.redisClientPlayers = receipt.redisClientPlayers;
        this.redisClientGames = receipt.redisClientGames;
        this.walletClient = receipt.walletClient;
        this.wallet = receipt.wallet;
        this.winnersPercentage = 0.99;
        this.rate = 1000
        this.connection = conn;
        this.connection.on('message', this.payout.bind(this));
    }

    async payout(response) {
        try {
            var data = JSON.parse(response)
            this.token = data['token'];
            this.receipt.clients[this.token] = this;
            const getPlayerAsync = promisify(this.redisClientPlayers.hget).bind(this.redisClientPlayers);
            const getGamesAsync = promisify(this.redisClientGames.hget).bind(this.redisClientGames);
            const getPlayersInGameAsync = promisify(this.redisClientPlayers.smembers).bind(this.redisClientPlayers);
            const getConfirmedAsync = promisify(this.redisClientPlayers.smembers).bind(this.redisClientPlayers);
            const gameserverid = await getPlayerAsync(this.token, 'game');
            const pot = await getGamesAsync(gameserverid, 'unconfirmed');
            const playersInGame = await getPlayersInGameAsync(gameserverid);
            const winnings = parseInt((pot * this.winnersPercentage) - this.rate);
            var confirmed = 0;
            var incr = 0;
            console.log(playersInGame);
            while (confirmed < winnings) {
                confirmed = 0;
                pendingTransactions = [];
                for (var p in playersInGame) {
                    console.log("player->" + playersInGame[p]);
                    incr = await this.pollBalanceConfirmed(playersInGame[p]);
                    if (incr == 0) {
                        const pendingTX = await getPlayerAsync(this.token, 'transactionId');
                        pendingTransactions += pendingTX
                    }
                    confirmed += incr;
                }
                var response = {
                    'status': 'pending pay',
                    'confirmed': confirmed,
                    'unconfirmed': unconfirmed,
                    'pendingTransactions': pendingTransactions
                }
                this.connection.send(JSON.stringify(response));
                console.log("total->" + confirmed)
                await this.sleep(15 * 1000); //sleep for 15 seconds
            }
            const destinationAddress = data['destinationAddress'].trim();
            const transactionId = await this.sendWinnings(destinationAddress, winnings);
            this.payserver.redisClientPlayers.hset(this.token, 'status', 'paid out');
            var response = {
                'status': 'paid out',
                'token': this.token,
                'gameserverid': gameserverid,
                'winnings': winnings,
                'destinationAddress': destinationAddress,
                'transactionId': transactionId
            }
            this.connection.send(JSON.stringify(response));
        } catch (err) {
            console.log("error paying winner: " + err)
            this.connection.send(JSON.stringify({ 'error': err }));
        }
    }

    async sendWinnings(address, value) {
        const options = {
            rate: this.rate,
            outputs: [{ value: value, address: address }]
        };
        const result = await this.wallet.send(options);
        return result['hash'];
    }

    async pollBalanceConfirmed(token) {
        const result = await this.wallet.getAccount(token);
        if (result) {
            if (result.balance.confirmed >= 100) {
                this.redisClientPlayers.hset(token, 'confirmed', result.balance.confirmed.toString());
                return result.balance.confirmed;
            }
        }
        return 0;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
