import { privateKeyToAccount, Address, Account } from 'viem/accounts'

// This is a pre-configured PIL Flavor: https://docs.story.foundation/docs/pil-flavors
export const NonCommercialSocialRemixingTermsId = '1'

// Add your rpc provider url to your .env file
// You can select from one of these: https://docs.story.foundation/docs/story-network#-rpcs
export const RPCProviderUrl = process.env.RPC_PROVIDER_URL || 'https://testnet.storyrpc.io'

// The currency used for paying License Tokens or tipping
// This address must be whitelisted by the protocol. You can see the
// currently whitelisted addresses here: https://docs.story.foundation/docs/royalty-module#whitelisted-revenue-tokens
export const CurrencyAddress: Address = (process.env.CURRENCY_ADDRESS as Address) || '0x91f6F05B08c16769d3c85867548615d270C42fC7'

export const mintContractApi = {
    inputs: [{ internalType: 'address', name: 'to', type: 'address' }],
    name: 'mint',
    outputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
}