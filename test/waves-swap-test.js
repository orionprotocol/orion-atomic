const assert = require('assert')
const axios = require('axios');
const { from } = require('rxjs/observable/from');
require('axios-debug-log')
const { transfer, order, broadcast, setScript, addressBalance, waitForTx } = require('@waves/waves-transactions')
const wc = require('@waves/waves-crypto')
const { Subject, ReplaySubject, interval, of } = require('rxjs');
const { map, filter, takeWhile, switchMap, catchError, repeat, flatMap, delay, tap } = require('rxjs/operators');
const rng = require('randombytes')
const compiler = require('@waves/ride-js');
const crypto = require('crypto')
const orion = require('../')
const chai = require('chai')
const expect = chai.expect
chai.use(require('chai-as-promised'))
chai.should();

describe('Orion Waves Atomic Swap', function () {
    const http = axios.create({
        baseURL: orion.wavesSwap.settings.nodeUrl
    });

    orion.wavesSwap.settings.network = 'T'
    orion.wavesSwap.settings.nodeUrl = 'https://pool.testnet.wavesnodes.com'

    const faucetSeed = "faucet"
    const orionAddress = wc.address('orion', orion.wavesSwap.settings.network)
    const clientAddress = wc.address('client', orion.wavesSwap.settings.network)

    it('can initiate smart account', async function () {
        this.timeout(60000);
        const contract = await orion.wavesSwap.initiate(clientAddress, orionAddress, faucetSeed)
        console.log(`Smart contract: ${JSON.stringify(contract)}`)
        assert.strictEqual(contract.secret.length, orion.wavesSwap.settings.secretSize)
    })


    it('can redeem funds', async function () {
        this.timeout(60000);

        const contract = await orion.wavesSwap.initiate(clientAddress, orionAddress, faucetSeed)
        console.log(`Smart contract: ${JSON.stringify(contract)}`)

        await orion.wavesSwap.payToAddress(contract.address, 1e7, faucetSeed)

        const redeemTx = await orion.wavesSwap.redeem(contract.publicKey, orionAddress, contract.secret)

        return waitForTx(redeemTx.id, 60000, orion.wavesSwap.settings.nodeUrl)
    })

    it('can audit script', async function() {
        this.timeout(60000);
        const contract = await orion.wavesSwap.initiate(clientAddress, orionAddress, faucetSeed)
        console.log(`Smart contract: ${JSON.stringify(contract)}`)
        const secretHash = await orion.wavesSwap.auditAccount(contract.address, orionAddress)
        assert.strictEqual(secretHash, contract.secretHash)
    })

    it('can audit smart acccount with balance', async function() {
        this.timeout(60000);
        const contract = await orion.wavesSwap.initiate(clientAddress, orionAddress, faucetSeed)
        console.log(`Smart contract: ${JSON.stringify(contract)}`)

        orion.wavesSwap.settings.assetId = 'EBJDs3MRUiK35xbj59ejsf5Z4wH9oz6FuHvSCHVQqZHS'

        await orion.wavesSwap.payToAddress(contract.address, 1e4, faucetSeed)
        orion.wavesSwap.auditAccount(contract.address, orionAddress, 2e4).should.be.rejected

        const secretHash = await orion.wavesSwap.auditAccount(contract.address, orionAddress, 1e4)
        assert.strictEqual(secretHash, contract.secretHash)

        orion.wavesSwap.settings.assetId = undefined
    })

    it('test watchTx', async function() {
        this.timeout(60000);
        const someAmount = 4e5
        await orion.wavesSwap.payToAddress(clientAddress, someAmount, faucetSeed)
        await orion.wavesSwap.payToAddress( wc.address(faucetSeed, orion.wavesSwap.settings.network), someAmount, 'client', true)
        const tx = await orion.wavesSwap.watchRedeemTx(clientAddress)
        assert.strictEqual(tx.amount,  someAmount)
    })

})
