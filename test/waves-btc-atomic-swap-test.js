const { describe, it } = require('mocha')
const assert = require('assert')
const crypto = require('crypto')
const orion = require('../')
const bitcoin = require('bitcoinjs-lib')
const regtestUtils = require('./_regtest')
const { transfer, order, broadcast, setScript, addressBalance, waitForTx } = require('@waves/waves-transactions')
const wc = require('@waves/waves-crypto')
const axios = require('axios');

describe('Orion Waves-BTC Atomic Swap', function () {
    orion.btcSwap.settings.network = regtestUtils.network
    orion.btcSwap.settings.client = {unspents: regtestUtils.unspents, calcFee: regtestUtils.calcFee, getBalance: regtestUtils.getBalance}

    orion.wavesSwap.settings.network = 'T'
    orion.wavesSwap.settings.nodeUrl = 'https://pool.testnet.wavesnodes.com'
    orion.wavesSwap.settings.assetId = 'EBJDs3MRUiK35xbj59ejsf5Z4wH9oz6FuHvSCHVQqZHS'

    const orionPair = bitcoin.ECPair.fromWIF('cScfkGjbzzoeewVWmU2hYPUHeVGJRDdFt7WhmrVVGkxpmPP8BHWe', orion.btcSwap.settings.network)
    const clientPair = bitcoin.ECPair.fromWIF('cMkopUXKWsEzAjfa1zApksGRwjVpJRB3831qM9W4gKZsLwjHXA9x', orion.btcSwap.settings.network)

    const btcOrionAddress = regtestUtils.getAddress(orionPair)
    const btcClientAddress = regtestUtils.getAddress(clientPair)

    const http = axios.create({
        baseURL: orion.wavesSwap.settings.nodeUrl
    });

    const faucetSeed = "faucet"
    const wavesOrionAddress = wc.address('orion', orion.wavesSwap.settings.network)
    const wavesClientAddress = wc.address('client', orion.wavesSwap.settings.network)

    it('Btc to Waves atomic swap', async function () {
        this.timeout(100000);

        // 1. Client initiate swap and create Contract address
        const contract = orion.btcSwap.initiate(clientPair.publicKey, orionPair.publicKey)

        // 2. Client pays 0.5 BTC to that Contract address
        const unspent = await regtestUtils.faucet(contract.address, 5e6)

        // 3. Client submit Contract and his Wave address to Orion for auditing, Orion retrieves balance and extracts Secret Hash
        const balance = await orion.btcSwap.settings.client.getBalance(contract.address, unspent.timestamp)
        const secretHash = (await orion.btcSwap.audit(contract.address, contract.script, orionPair.publicKey)).toString('hex')
        assert.strictEqual(secretHash, contract.secretHash)

        // 4. Orion initiate his swap side on Waves blockchain
        const wavesContract = await orion.wavesSwap.initiate(wavesOrionAddress, wavesClientAddress, faucetSeed, secretHash)
        console.log(`Waves Smart contract: ${JSON.stringify(wavesContract)}`)
        assert.strictEqual(wavesContract.secretHash, secretHash)

        // 5. Orion pays 0.5 Orion BTC (OBTC) to Waves Smart account
        await orion.wavesSwap.payToAddress(wavesContract.address, 5e6, faucetSeed)

        // 6. Orion sends Waves Smart account, which can be unlock with Secret, to Client for auditing
        const wavesSecretHash = await orion.wavesSwap.auditAccount(wavesContract.address, wavesClientAddress, 5000000)
        // Both Secret Hashes should be equal
        assert.strictEqual(secretHash, wavesSecretHash)

        // 7. Client redeem 0.5 OBTC  from Waves Smart account revealing the Secret
        const wavesRedeemTx = await orion.wavesSwap.redeem(wavesContract.publicKey, wavesClientAddress, contract.secret)

        // 8. Orion uses secret from WavesRedeemTx to redeem 0.5 btc on Bitcoin blockchain
        const watchedTx = await orion.wavesSwap.watchRedeemTx(wavesContract.address)
        const secretFromTx = Buffer.from(wc.base58decode(watchedTx.proofs[0]))
        const reedemBtcContract = new orion.types.Contract(null, contract.address, contract.script, secretFromTx)
        const btcRedeemTx = await orion.btcSwap.redeem(reedemBtcContract, btcOrionAddress, orionPair)
        assert.strictEqual(btcRedeemTx.outs[0].value > (0.05 - 0.001)*1e8, true)

        await regtestUtils.broadcast(btcRedeemTx.toHex())

        await regtestUtils.verify({
            txId: btcRedeemTx.getId(),
            address: btcOrionAddress,
            vout: 0,
            value: btcRedeemTx.outs[0].value
        })
    })
})