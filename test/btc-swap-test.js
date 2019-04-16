/* eslint no-unused-vars: 0 */

const { describe, it } = require('mocha')
const bitcoin = require('bitcoinjs-lib')
const regtestUtils = require('./_regtest')
const rng = require('randombytes')
const assert = require('assert')
const orion = require('../')
const chai = require('chai')
const expect = chai.expect
chai.use(require('chai-as-promised'))
chai.should();


function getAddress (keyPair) {
    return bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network: orion.btcSwap.settings.network }).address
}

describe('Orion BTC Atomic Swap', function () {

    orion.btcSwap.settings.network = regtestUtils.network
    orion.btcSwap.settings.client = { unspents: regtestUtils.unspents, calcFee: regtestUtils.calcFee }

    const orionPair = bitcoin.ECPair.fromWIF('cScfkGjbzzoeewVWmU2hYPUHeVGJRDdFt7WhmrVVGkxpmPP8BHWe', orion.btcSwap.settings.network )
    const clientPair = bitcoin.ECPair.fromWIF('cMkopUXKWsEzAjfa1zApksGRwjVpJRB3831qM9W4gKZsLwjHXA9x', orion.btcSwap.settings.network )

    const orionAddress = regtestUtils.getAddress(orionPair)
    const clientAddress = regtestUtils.getAddress(clientPair)

    // expiry past, {Alice's signature} OP_TRUE
    it('Initiate transaction', function () {
        const contract = orion.btcSwap.initiate(clientPair.publicKey, orionPair.publicKey)
        assert.strictEqual(contract.secret.length, orion.btcSwap.settings.secretSize)
    })

    it('can redeem', async function () {
        const contract = orion.btcSwap.initiate(clientPair.publicKey, orionPair.publicKey)
        const unspent = await regtestUtils.faucet(contract.address, 1e7)

        const toAddress = regtestUtils.RANDOM_ADDRESS
        console.log(`Redeem address: ${toAddress}`)

        const redeemTx = await orion.btcSwap.redeem(contract, toAddress, orionPair)

        await regtestUtils.broadcast(redeemTx.toHex())

        return regtestUtils.verify({
            txId: redeemTx.getId(),
            address: toAddress,
            vout: 0,
            value: redeemTx.outs[0].value
        })
    })

    it('can redeem 2 utxo', async function () {
        const contract = orion.btcSwap.initiate(clientPair.publicKey, orionPair.publicKey)
        await regtestUtils.faucet(contract.address, 1e7)
        await regtestUtils.faucet(contract.address, 2e7)

        const toAddress = regtestUtils.RANDOM_ADDRESS
        console.log(`Redeem address: ${toAddress}`)

        const redeemTx = await orion.btcSwap.redeem(contract, toAddress, orionPair)

        try {
            await regtestUtils.broadcast(redeemTx.toHex())
        } catch (e) {
            throw new Error('Incorrect redeem transaction: ' + e)
        }

        return regtestUtils.verify({
            txId: redeemTx.getId(),
            address: toAddress,
            vout: 0,
            value: redeemTx.outs[0].value
        })
    })

    it('can audit script', async function () {
        const contract = orion.btcSwap.initiate(clientPair.publicKey, orionPair.publicKey)
        assert.strictEqual(await orion.btcSwap.audit(contract.address, contract.script, orionPair.publicKey), contract.secretHash)
    })

    it('can audit script with balance', async function () {
        const contract = orion.btcSwap.initiate(clientPair.publicKey, orionPair.publicKey)
        await regtestUtils.faucet(contract.address, 2e6)

        await orion.btcSwap.audit(contract.address, contract.script, orionPair.publicKey, 0.03).should.be
            .rejectedWith(Error, 'Incorrect address balance: 0.02, should be: 0.03')

        const hash = await orion.btcSwap.audit(contract.address, contract.script, orionPair.publicKey, 0.02)
        assert.strictEqual(hash, contract.secretHash)
    })

})
