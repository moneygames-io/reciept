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
        this.winnersPercentage = 0.99;
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
            const winnings = parseInt(pot * this.winnersPercentage);
            var confirmed = 0;
            var incr = 0;
            console.log(playersInGame);
            while (confirmed < winnings) {
                confirmed = 0;
                for (var p in playersInGame) {
                    console.log("player->" + playersInGame[p]);
                    incr = await this.pollBalanceConfirmed(playersInGame[p]);
                    confirmed += incr;
                }
                console.log("total->" + confirmed)
                await this.sleep(15 * 1000); //sleep for 15 seconds
            }
            const destinationAddress = data['destinationAddress'].trim();
            const transactionId = await this.sendWinnings(destinationAddress, winnings);
            var response = {
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
        const wallet = this.walletClient.wallet('primary');
        const options = {
            rate: this.rate,
            outputs: [{ value: value, address: address }]
        };
        const result = await wallet.send(options);
        return result['hash']; // return transaction id
    }

    async pollBalanceConfirmed(token) {
        const wallet = this.walletClient.wallet('primary');
        const result = await wallet.getAccount(token);
        if (result) {
            if (result.balance.confirmed >= 15000) {
                this.redisClientPlayers.hset(token, 'confirmed', 'true');
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