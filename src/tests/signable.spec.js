require('ts-node/register/transpile-only');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

const { expect } = require('chai');
const truffleAssert = require('truffle-assertions');
const { Signer } = require('../index');
const { ZERO_ADDRESS } = require('../utils/address');
const Example = artifacts.require('Example');

contract('Signable', ([sender]) => {
  let contract;
  let signer;

  const args = [
    ZERO_ADDRESS,
    {
      test1: 123n,
      test2: 456n,
      test3: 'hello world',
    },
    web3.utils.keccak256('test'),
  ];

  beforeEach(async () => {
    await web3.eth.accounts.wallet.create(3);
    contract = await Example.new(web3.eth.accounts.wallet[0].address);
    signer = new Signer({
      keyStore: {
        get(address) {
          const account = Array.from(web3.eth.accounts.wallet).find(
            account => account.address == address
          );
          return account?.privateKey;
        },
      },
      address: contract.address,
      web3: web3,
    });
  });

  it('should sign testA', async () => {
    const signature = await signer.sign(Example.abi, 'testA', sender, ...args);

    await truffleAssert.passes(contract.testA(...args, signature));
    await truffleAssert.reverts(contract.testA(...args, signature));
  });

  it('should sign testB', async () => {
    const signature = await signer.sign(Example.abi, 'testB', sender, ...args);

    await truffleAssert.passes(
      contract.testB(...args.slice(0, 2), signature, args[2])
    );
    await truffleAssert.reverts(
      contract.testB(...args.slice(0, 2), signature, args[2])
    );
  });

  it('should sign testC', async () => {
    const signature = await signer.sign(Example.abi, 'testC', sender, ...args);

    await truffleAssert.passes(contract.testC(signature, ...args));
    await truffleAssert.reverts(contract.testC(signature, ...args));
  });

  it('rotate signer', async () => {
    await contract.setSigner(web3.eth.accounts.wallet[1].address);

    const signature = await signer.sign(Example.abi, 'testA', sender, ...args);

    await truffleAssert.passes(contract.testA(...args, signature));
    await truffleAssert.reverts(contract.testA(...args, signature));
  });

  it("rotate signer doesn't reuse signatures", async () => {
    const signature = await signer.sign(Example.abi, 'testA', sender, ...args);

    await truffleAssert.passes(contract.testA(...args, signature));
    await contract.setSigner(web3.eth.accounts.wallet[1].address);
    await truffleAssert.reverts(contract.testA(...args, signature));
  });

  it('rotate signer to changed address', async () => {
    const signature = await signer.sign(Example.abi, 'testA', sender, ...args);

    await contract.setSigner(web3.eth.accounts.wallet[1].address);
    await truffleAssert.reverts(contract.testA(...args, signature));
    await contract.setSigner(web3.eth.accounts.wallet[0].address);
    await truffleAssert.passes(contract.testA(...args, signature));
    await truffleAssert.reverts(contract.testA(...args, signature));
  });

  it('rotate signer to unknown address', async () => {
    await contract.setSigner(sender);
    await expect(signer.sign(Example.abi, 'testA', sender, ...args)).to
      .eventually.be.rejected;

    await contract.setSigner(web3.eth.accounts.wallet[0].address);
    const signature = await signer.sign(Example.abi, 'testA', sender, ...args);
    await truffleAssert.passes(contract.testA(...args, signature));
    await truffleAssert.reverts(contract.testA(...args, signature));
  });
});
