import type {
  Address,
  ContractCallerFunctions,
  LogsContractCallerFn,
  NoExtraKeysCheck,
  SignTypedDataContractCallerFn,
  StaticContractCallerFn,
  TransactionContractCallerFn,
} from '../../types';
import type {
  JsonRpcProvider,
  BaseProvider,
  JsonRpcSigner,
} from '@ethersproject/providers';
import type { Signer } from '@ethersproject/abstract-signer';
import type {
  Contract as EthersContract,
  PayableOverrides,
  CallOverrides,
  ContractTransaction,
  EventFilter,
} from '@ethersproject/contracts';
import { assertEthersContractHasMethods } from '../misc';
import { assert } from 'ts-essentials';

export interface EthersProviderDeps {
  ethersProviderOrSigner: BaseProvider | Signer;
  EthersContract: typeof EthersContract; // passing Contract in allows not to include ethers as dependency even when using legacy ParaSwap class
}

export const constructContractCaller = (
  {
    ethersProviderOrSigner: providerOrSigner,
    EthersContract: Contract,
  }: EthersProviderDeps,
  account?: Address
): ContractCallerFunctions<ContractTransaction> => {
  const staticCall: StaticContractCallerFn = async (params) => {
    const { address, abi, contractMethod, args, overrides } = params;

    const contract = new Contract(address, abi, providerOrSigner);

    assertEthersContractHasMethods(contract, contractMethod);
    // drop keys not in CallOverrides
    const { block, gas, ...restOverrides } = overrides;
    // reassign values to keys in CallOverrides
    const normalizedOverrides = {
      ...restOverrides,
      blockTag: block,
      gasLimit: gas,
    };

    // type FinalCallOverrides = normalizedOverrides has extra props ? never : normalizedOverrides
    type FinalCallOverrides = NoExtraKeysCheck<
      typeof normalizedOverrides,
      CallOverrides
    >;

    // enforce overrides shape ethers accepts
    // TS will break if normalizedOverrides type has any keys not also present in CallOverrides
    const callOverrides: FinalCallOverrides = normalizedOverrides;
    // returns whatever the Contract.method returns: BigNumber, string, boolean
    return contract.callStatic[contractMethod](...args, callOverrides);
  };

  const transactCall: TransactionContractCallerFn<ContractTransaction> = async (
    params
  ) => {
    assert(account, 'account must be specified to create a signer');
    assert(
      isEthersProviderWithSigner(providerOrSigner) ||
        isEthersSigner(providerOrSigner),
      'ethers must be an instance of Signer or JsonRpcProvider to create a signer'
    );

    const { address, abi, contractMethod, args, overrides } = params;

    const signer =
      'getSigner' in providerOrSigner
        ? providerOrSigner.getSigner(account)
        : providerOrSigner;

    const contract = new Contract(address, abi, signer);

    assertEthersContractHasMethods(contract, contractMethod);
    // drop keys not in PayableOverrides
    const { gas, from, ...restOverrides } = overrides;
    // reassign values to keys in PayableOverrides
    const normalizedOverrides = {
      ...restOverrides,
      gasLimit: gas,
    };

    // type FinalPayableOverrides = normalizedOverrides has extra props ? never : normalizedOverrides
    type FinalPayableOverrides = NoExtraKeysCheck<
      typeof normalizedOverrides,
      PayableOverrides
    >;

    // enforce overrides shape ethers accepts
    // TS will break if normalizedOverrides type has any keys not also present in PayableOverrides
    const txOverrides: FinalPayableOverrides = normalizedOverrides;
    const txResponse: ContractTransaction = await contract[contractMethod](
      ...args,
      txOverrides
    );

    return txResponse;
  };

  const signTypedDataCall: SignTypedDataContractCallerFn = async (
    typedData
  ) => {
    assert(account, 'account must be specified to create a signer');
    assert(
      isEthersProviderWithSigner(providerOrSigner) ||
        isEthersSigner(providerOrSigner),
      'ethers must be an instance of Signer or JsonRpcProvider to create a signer'
    );

    const signer =
      'getSigner' in providerOrSigner
        ? providerOrSigner.getSigner(account)
        : providerOrSigner;

    assert(isTypedDataCapableSigner(signer), 'Signer can sign typed data');

    const { data, domain, types } = typedData;

    return signer._signTypedData(domain, types, data);
  };

  const getLogsCall: LogsContractCallerFn = async (params) => {
    const { address, abi, filter } = params;

    const contract = new Contract(address, abi, providerOrSigner);

    // assert(
    //   isEthersProviderWithSigner(providerOrSigner),
    //   'ethers must be an instance of Signer or JsonRpcProvider to create a signer'
    // );

    const provider = isEthersSigner(providerOrSigner)
      ? providerOrSigner.provider
      : providerOrSigner;

    assert(
      provider,
      'ethers must be an instance of Provider or Signer with Provider attached'
    );

    const logs = await contract.queryFilter(filter as EventFilter, 12223870);
    // const logs = await provider.getLogs(filter);
    console.log('🚀 ~  logs', logs);
    const decoded = logs.map((log) => {
      const { topic, args } = contract.interface.parseLog(log);
      return { topic, args };
    });
    console.log('🚀 ~  decoded', decoded);

    return decoded;

    // assertEthersContractHasMethods(contract, contractMethod);
    // // drop keys not in CallOverrides
    // const { block, gas, ...restOverrides } = overrides;
    // // reassign values to keys in CallOverrides
    // const normalizedOverrides = {
    //   ...restOverrides,
    //   blockTag: block,
    //   gasLimit: gas,
    // };

    // // type FinalCallOverrides = normalizedOverrides has extra props ? never : normalizedOverrides
    // type FinalCallOverrides = NoExtraKeysCheck<
    //   typeof normalizedOverrides,
    //   CallOverrides
    // >;

    // // enforce overrides shape ethers accepts
    // // TS will break if normalizedOverrides type has any keys not also present in CallOverrides
    // const callOverrides: FinalCallOverrides = normalizedOverrides;
    // // returns whatever the Contract.method returns: BigNumber, string, boolean
    // return contract.callStatic[contractMethod](...args, callOverrides);
  };

  return { staticCall, transactCall, signTypedDataCall, getLogsCall };
};

function isEthersProvider(
  providerOrSigner: BaseProvider | Signer
): providerOrSigner is BaseProvider {
  return '_isProvider' in providerOrSigner && providerOrSigner._isProvider;
}

function isEthersProviderWithSigner(
  providerOrSigner: JsonRpcProvider | BaseProvider | Signer
): providerOrSigner is JsonRpcProvider {
  return isEthersProvider(providerOrSigner) && 'getSigner' in providerOrSigner;
}

function isEthersSigner(
  providerOrSigner: BaseProvider | Signer
): providerOrSigner is Signer {
  return '_isSigner' in providerOrSigner && providerOrSigner._isSigner;
}

function isTypedDataCapableSigner(
  signer: Signer
): signer is Signer & Pick<JsonRpcSigner, '_signTypedData'> {
  return '_signTypedData' in signer;
}
