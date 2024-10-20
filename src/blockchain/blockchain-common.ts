// This module contains data and code shared between the
//  modules that do blockchain operations.
import { MetaMaskInpageProvider } from '@metamask/providers';

export type Maybe<Type> = Partial<Type> | null | undefined;

// Extend the Window interface to include the MetaMask provider
declare global {
    interface Window {
        ethereum?: MetaMaskInpageProvider;
    }
}

/**
 * Converts a Maybe<Type> value into a string representation.
 *
 * If the input value is `null`, it returns the string "null".
 * If the input value is `undefined`, it returns the string "undefined".
 * If the input value is of type string (or partial string), it returns the value cast to a string.
 * Otherwise, it throws an error.
 *
 * @template Type - The type of the input value.
 * @param {Maybe<Type>} maybeType - The value that may be a partial, null, or undefined.
 * @returns {string} - The string "null", "undefined", or the original value cast to a string.
 * @throws {Error} - Throws an error if the value is not of type string or null/undefined.
 */
export function maybeTypeToString<Type>(maybeType: Maybe<Type>): string {
    if (maybeType === null) {
        return "null";
    }
    if (maybeType === undefined) {
        return "undefined";
    }
    // Ensure the type is a string or throw an error
    if (typeof maybeType !== "string") {
        throw new Error("maybeTypeToString can only handle string types.");
    }
    return maybeType as string;
}


// Enum for user notification messages
export enum NotifyUserMessages {
    MetamaskNotInstalled = 'This web app requires MetaMask. Please install it now.',
    MetamaskNotReady = 'Please log into MetaMask now.',
    UnableToConnectMetamask = 'Unable to connect to MetaMask.',
    WrongChainId = 'This web app only runs on chain ID: ',
    UnableToGetPublicAddress = 'Unable to get the current public address from MetaMask. Error details:\n',
}

// Type definition for notifyMe function
export type NotifyFuncWithJsonObject = (jsonObj: Record<string, unknown>) => void;

// Type for the notify user function
export type NotifyUserFunction = (msgToUser: string) => void;

/**
 * Retrieves the friendly name for a given chain ID.
 * @param chainId - The chain ID to get the friendly name for.
 * @returns The friendly name of the chain ID.
 * @throws Error if the chain ID is unknown.
 */
export function getFriendlyChainIdName(chainId: string): string {
    const chainIdMap: Record<string, string> = {
        '0x1': 'Ethereum Mainnet',
        '0x3': 'Ropsten Testnet',
        '0x4': 'Rinkeby Testnet',
        '0x5': 'Goerli Testnet',
        '0x2a': 'Kovan Testnet',
        '0x5e9': 'Iliad',
        '0xaa36a7': 'Sepolia Testnet',
    };

    if (chainIdMap[chainId]) {
        return chainIdMap[chainId];
    }

    throw new Error(`Unknown chain ID: ${chainId}`);
}
