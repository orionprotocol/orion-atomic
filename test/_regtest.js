const assert = require('assert')
const bitcoin = require('bitcoinjs-lib')
const Client = require('bitcoin-core')
const getByteCount = require('./getByteCount')

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
    const txId = await client.sendToAddress(address, value / 1e8, 'sendtoaddress example', 'Nemo From Example.com')
    await client.generate(1)

    const tx = await client.getTransaction(txId)
    let unspent = tx.details[0]
    unspent.txId = txId
    return unspent
}

async function unspents (address) {
    const res = await client.importMulti([{scriptPubKey: {address: address}, timestamp: 0}])
    console.log(res)
    const unspents = await client.listUnspent(1, 1000, [ address ])

    return unspents
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
    RANDOM_ADDRESS: randomAddress()
}
