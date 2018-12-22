'use strict';

var _bclient = require('bclient');

var _bcoin = require('bcoin');

class Index {
  constructor() {
    let network = _bcoin.Network.get('regtest');

    let walletOptions = {
      port: 18332,
      host: "bcoin.moneygames.io",
      network: network.type,
      apiKey: 'hunterkey'
    };

    let walletClient = new _bclient.WalletClient(walletOptions);
    let wallet = walletClient.wallet("primary");

    (async () => {
      const result = await wallet.getInfo();
      console.log(result);
    })();
  }
}

new Index();