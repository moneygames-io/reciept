import { WebSocket } from 'ws'
import { WalletClient } from 'bclient'
import { Network } from 'bcoin'
import { promisify } from 'util'


export default class Client {
    constructor(conn, token, rate, redisClientPlayers, redisClientGames) {
        this.connection = conn;
        this.token = token;
        this.connection.on('message', this.newWinner.bind(this));
        this.rate = rate;
        this.redisClientPlayers = redisClientPlayers;
        this.redisClientGames = redisClientGames;
        this.btcToSatoshi = 100000000
        this.winnersPercentage = 0.99
        const network = Network.get('testnet');
        const walletOptions = {
            port: 18334,
            host: "bcoin.moneygames.io",
            network: network.type,
            apiKey: 'hunterkey'
        };
        this.walletClient = new WalletClient(walletOptions);
        this.assignAccount();
        this.pollBalance();
    }

    async newWinner(response) {
        try {
            var data = JSON.parse(response)
            const getPlayerAsync = promisify(this.redisClientPlayers.hget).bind(this.redisClientPlayers);
            const getGamesAsync = promisify(this.redisClientGames.hget).bind(this.redisClientGames);
            const gameserverid = await getPlayerAsync(this.token, 'game');
            const pot = await getGamesAsync(gameserverid, 'pot');
            const destinationAddress = data['destinationAddress'].trim();
            const transactionId = await this.sendWinnings(destinationAddress, pot);
            var response = {
                'token': this.token,
                'gameserverid': gameserverid,
                'pot': pot,
                'destinationAddress': destinationAddress,
                'transactionId': transactionId
            }
            this.connection.send(JSON.stringify(response));
        } catch (err) {
            console.log("error paying winner: " + err)
            this.connection.send(JSON.stringify({'error':err}));
        }
    }

    async getHouseAddress() {
        const wallet = this.walletClient.wallet('house');
        const result = await wallet.getAccount('default');
        return result.receiveAddress;
    }

    async sendWinnings(address, pot) {
        let value = parseInt(pot * this.winnersPercentage);
        const wallet = this.walletClient.wallet('primary');
        const options = {
            rate: this.rate,
            outputs: [{ value: value, address: address }]
        };
        const result = await wallet.send(options);
        console.log(result);
        return result['hash']; // return transaction id
    }

    assignAccount() {
        const wallet = this.walletClient.wallet('primary');
        const options = { name: this.token };
        (async () => {
            try {
                const result = await wallet.createAccount(this.token, options);
                this.address = result.receiveAddress;
                this.connection.send(JSON.stringify({ 'bitcoinAddress': this.address }));
                this.connection.send(JSON.stringify({ 'token': this.token }));
                this.redisClientPlayers.hset(this.token, "status", "unpaid");
                this.redisClientPlayers.hset(this.token, "paymentAddress", this.address);
            } catch (err) {
                console.log(err)
            }
        })()
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async pollBalance2() {
        await this.sleep(2000);
        this.redisClientPlayers.hset(this.token, 'status', 'paid');
        this.connection.send(JSON.stringify({ 'status': 'paid' }));
    }

    pollBalance() {
        const wallet = this.walletClient.wallet('primary');
        (async () => {
            for (var i = 0; i < 60 * 60; i++) { //poll Balance 60 seconds * 60 minutes
                const result = await wallet.getAccount(this.token);
                if (result) {
                    if (result.balance.unconfirmed >= 15000) {
                        this.redisClientPlayers.hset(this.token, 'status', 'paid');
                        this.redisClientPlayers.hset(this.token, 'unconfirmed', result.balance.unconfirmed.toString());
                        this.connection.send(JSON.stringify({ 'status': 'paid' }));
                        return;
                    }
                }
                await this.sleep(1000); //sleep for 1 second
            }
        })()
    }
}
