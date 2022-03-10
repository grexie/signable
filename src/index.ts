import Web3 from 'web3';
import { ZERO_ADDRESS } from './utils/address';
import { AbiItem, AbiInput } from 'web3-utils';
import * as ethUtil from 'ethereumjs-util';
import * as fs from 'fs';
import * as path from 'path';

const ISignable = (() => {
  let filename;
  if (
    fs.existsSync(path.resolve(__dirname, '..', 'contracts', 'ISignable.json'))
  ) {
    filename = path.resolve(__dirname, '..', 'contracts', 'ISignable.json');
  } else {
    filename = path.resolve(
      __dirname,
      '..',
      '..',
      'contracts',
      'ISignable.json'
    );
  }
  return JSON.parse(fs.readFileSync(filename).toString());
})();

export interface Cache {
  get(key: string): Promise<string>;
  set(key: string, value: string, ttl: number): Promise<string>;
}

interface KeyStore {
  get(address: string): Promise<string>;
}

export interface SignerOptions {
  keyStore: KeyStore;
  address: string;
  web3: Web3;
  cache?: Cache;
}

const extractInputs = (abi: AbiItem): AbiInput[] => {
  return abi.inputs?.filter(
    input => input.internalType !== 'struct Signable.Signature'
  ) as AbiInput[];
};

const serializeInputs = (abi: AbiInput[]): string[] => {
  return abi.map(input => {
    if (input.type === 'tuple') {
      return `tuple(${serializeInputs(input.components ?? []).join(',')})`;
    } else {
      return input.type;
    }
  });
};

const serializeArguments = (inputs: AbiInput[], args: any): any[] => {
  const out: any[] = [];

  if (!Array.isArray(args) && typeof args === 'object' && args !== null) {
    for (const input of inputs) {
      if (!(input.name in args)) {
        throw new Error(`argument ${input.name} missing from args`);
      } else if (input.type === 'tuple') {
        out.push(serializeArguments(input.components ?? [], args[input.name]));
      } else {
        out.push(args[input.name]);
      }
    }
  } else {
    if (inputs.length !== args.length) {
      throw new Error('argument length mismatch');
    }

    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i].type === 'tuple') {
        out.push(serializeArguments(inputs[i].components ?? [], args[i]));
      } else {
        out.push(args[i]);
      }
    }
  }

  return out;
};

class Signer {
  readonly #keyStore: KeyStore;
  readonly #address: string;
  readonly #web3: Web3;
  readonly #cache?: Cache;
  #uniq?: string;

  constructor({ keyStore, address, web3, cache }: SignerOptions) {
    this.#keyStore = keyStore;
    this.#address = address;
    this.#web3 = web3;
    this.#cache = cache;
  }

  static UniqCacheKey(address: string) {
    return `signer:${address}:uniq`;
  }

  static SignerCacheKey(address: string) {
    return `signer:${address}:signer`;
  }

  async uniq() {
    if (!this.#uniq) {
      const key = Signer.UniqCacheKey(this.#address);

      this.#uniq = await this.#cache?.get(key);

      if (!this.#uniq) {
        const instance = new this.#web3.eth.Contract(
          ISignable as AbiItem[],
          this.#address
        );
        const batch = new this.#web3.BatchRequest();
        const promise = new Promise<string>((resolve, reject) => {
          batch.add(
            instance.methods
              .uniq()
              .call.request(
                { from: ZERO_ADDRESS },
                (err: Error | null, value: any) => {
                  if (err) {
                    reject(err);
                    return;
                  }

                  resolve(value);
                }
              )
          );
        });
        batch.execute();
        this.#uniq = await promise;
        this.#cache?.set(key, this.#uniq, -1);
      }
    }

    return this.#uniq;
  }

  async signer() {
    const key = Signer.SignerCacheKey(this.#address);

    let signer = await this.#cache?.get(key);

    if (!signer) {
      const instance = new this.#web3.eth.Contract(
        ISignable as AbiItem[],
        this.#address
      );
      const batch = new this.#web3.BatchRequest();
      const promise = new Promise<string>((resolve, reject) => {
        batch.add(
          instance.methods
            .signer()
            .call.request(
              { from: ZERO_ADDRESS },
              (err: Error | null, value: any) => {
                if (err) {
                  reject(err);
                  return;
                }

                resolve(value);
              }
            )
        );
      });
      batch.execute();
      signer = await promise;
      this.#cache?.set(key, signer, 3600);
    }

    return signer;
  }

  async sign(
    contract: AbiItem[],
    method: string,
    from: string,
    ...args: any[]
  ) {
    const methodAbi = contract.find(
      ({ name, type }) => name === method && type === 'function'
    );

    if (!methodAbi) {
      throw new Error(`unable to find method ${method} in contract`);
    }

    const uniq = await this.uniq();
    const signer = await this.signer();
    const privateKey = await this.#keyStore.get(signer);

    if (!privateKey) {
      throw new Error(`signer address ${signer} not in key store`);
    }

    const selector = this.#web3.eth.abi.encodeFunctionSignature(methodAbi);

    const inputs = extractInputs(methodAbi);

    const message = this.#web3.eth.abi.encodeParameters(
      ['bytes4', ...serializeInputs(inputs)],
      [selector, ...serializeArguments(inputs, args)]
    );
    const nonce = this.#web3.utils.randomHex(32);
    const buffer = ethUtil.toBuffer(
      this.#web3.eth.abi.encodeParameters(
        ['bytes32', 'bytes32', 'address', 'bytes'],
        [uniq, nonce, from, message]
      )
    );

    const hash = ethUtil.keccak256(buffer);
    const { r, s, v } = ethUtil.ecsign(hash, ethUtil.toBuffer(privateKey));

    return {
      nonce: nonce,
      r: ethUtil.bufferToHex(r),
      s: ethUtil.bufferToHex(s),
      v: v,
    };
  }
}

export { Signer };
