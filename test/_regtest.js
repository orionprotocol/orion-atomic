const assert = require('assert')
const bitcoin = require('bitcoinjs-lib')
const Client = require('bitcoin-core')
const getByteCount = require('./getByteCount')
const { retryWhen, delay, take, concatMap, throwError } = require('rxjs/operators')
const { from } = require('rxjs');

const client = new Client({
    network: 'regtest',
    username: 'user',
    password: 'pass',
    port: 18443
})

const NETWORK = bitcoin.networks.testnet

async function broadcast (txHex) {
    return client.sendRawTransaction(txHex)
}

async function mine (count) {
    return client.generate(count)
}

async function faucet (address, value) {
    try {
        await client.importMulti([{scriptPubKey: {address: address}, timestamp: Math.floor(Date.now() / 1000)}], {rescan: false})
    } catch (e) {
        throw new Error(`Couldn't import address: ${address}, reason: ${e}`)
    }

    const txId = await client.sendToAddress(address, value / 1e8, 'sendtoaddress example', 'Nemo From Example.com')
    await client.generate(1)

    const tx = await client.getTransaction(txId)
    let unspent = tx.details[0]
    unspent.txId = txId
    unspent.timestamp = tx.time
    return unspent
}

async function unspents (address, timestamp = 0) {
    try {
        const outs = await client.listUnspent(1, 1000, [address])
        return outs
    } catch (e) {
        throw new Error(`Couldn't retrieve unspents for ${address}, reason: ${e}`)
    }
}

async function getBalance (address, timestamp = 0) {
    const outs = await unspents(address, timestamp)
    let sum = 0.0
    for (const unspent of outs) {
        sum += unspent.amount
    }
    return Number(sum.toFixed(8))
}

async function verify (txo) {
    const tx = await client.getRawTransaction(txo.txId, true)
    const txoActual = tx.vout[txo.vout]
    if (txo.address) assert.strictEqual(txoActual.scriptPubKey.addresses[0], txo.address)
    if (txo.value) assert.strictEqual(txoActual.value * 1e8, txo.value)
}

function getAddress (keyPair) {
    return bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network: NETWORK }).address
}

function randomAddress () {
    return getAddress(bitcoin.ECPair.makeRandom({
        network: bitcoin.networks.testnet
    }), bitcoin.networks.testnet)
}

async function calcFee (ins, outs) {
    const { feerate } = await client.estimateSmartFee(2)
    const size = 291*Object.keys(ins).length + 34*Object.keys(outs).length
    return Math.round(feerate * size * 1e8 / 1024)
}

module.exports = {
    broadcast,
    calcFee,
    faucet,
    mine,
    network: NETWORK,
    unspents,
    verify,
    randomAddress,
    getAddress,
    getBalance,
    RANDOM_ADDRESS: randomAddress()
}
