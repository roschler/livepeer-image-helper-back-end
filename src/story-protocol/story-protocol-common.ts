// -------------------- BEGIN: STORY PROTOCOL ------------

// We assign this value to Hex fields when we don't have
//  an actual value yet.  This is a "sentinel" value.
import {Hex} from "viem";

export const HEX_UNINITIALIZED_VALUE = '0x';

export type EthereumProvider = { request(...args: any): Promise<any> }

/**
 * This function returns TRUE if the given hex value is
 *  uninitialized, FALSE if it has an actual value.
 *
 * @param hexValue - The hex value to inspect.
 */
export function isHexUninitializedValue(hexValue: Hex) {
    return hexValue === HEX_UNINITIALIZED_VALUE
}

/**
 * This function checks if a value is a hex string or not.
 *
 * @param value - The value to check.
 */
export const isHexValue = (value: any): value is Hex => {
    return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value);
};

/**
 * These are the fields we need to know about when interacting
 *  with an SPG NFT collection
 */
export interface SpgNftCollectionDetails {
    // The name given to the SPG NFT collection
    name: string,
    // They symbol assigned to the SPG NFT collection
    symbol: string,
    // The contract hash for the SPG NFT collection
    //  smart contract
    contract_address: Hex
    // The transaction hash of the transaction that
    //  submitted the SPG NFT collection to the
    //  blockchain.
    tx_hash: string
}

// -------------------- END  : STORY PROTOCOL ------------
