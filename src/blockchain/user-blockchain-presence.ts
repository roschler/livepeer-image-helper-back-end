// This module contains the code for the user blockchain object and
//  helper utilities.

import { createWalletClient, custom, Account, Hex, isHex, defineChain, http } from "viem"

import {
    getFriendlyChainIdName,
    Maybe,
    maybeTypeToString,
    NotifyUserFunction,
    NotifyUserMessages,
} from "./blockchain-common"
import {
    EthereumProvider,
    HEX_UNINITIALIZED_VALUE, isHexUninitializedValue,
    SpgNftCollectionDetails,
} from "../story-protocol/story-protocol-common"
import {
    CreateIpAssetWithPilTermsRequest,
    CreateIpAssetWithPilTermsResponse, CreateNFTCollectionRequest, PIL_TYPE,
    StoryClient,
    StoryConfig,
    SupportedChainIds,
} from "@story-protocol/core-sdk"
import { MetaMaskInpageProvider } from "@metamask/providers"
import { RPCProviderUrl } from "../story-protocol/utils"
import {SimpleWalletClient} from "@story-protocol/core-sdk/dist/declarations/src/abi/generated";
import { MintNftImageDetails } from "../system/types"

/**
 * WARNING: Keep this file in sync with the file of the same name
 *  between CLIENT and BACK-END server.
 */

export const bVerboseUserManagement = true;

const CONSOLE_CATEGORY = 'user-blockchain-presence';

/**
 * This type combines the mint NFT and IP request and response
 *  interfaces into a single interface.
 */
export interface MintNftRequestAndResponse {
    ipId: string,
    mintNftRequestDetails: CreateIpAssetWithPilTermsRequest,
    mintNftResponseDetails: CreateIpAssetWithPilTermsResponse
}

// Need to define the iliad chain so we can assign it to the wallet client..
const iliadChain = defineChain({
    id: 1513,
    name: 'Iliad',
    network: 'iliad',
    nativeCurrency: {
        decimals: 18,
        name: 'IP',
        symbol: 'IP',
    },
    rpcUrls: {
        default: {
            http: ['https://1513.rpc.thirdweb.com'],
        },
    },
    blockExplorers: {
        // This explorer is for all transactions.
        default: { name: 'Storyscan Explorer', url: 'https://testnet.storyscan.xyz' },

        // This explorer is only for assets.
        // default: { name: 'Storyscan Explorer', url: 'https://explorer.story.foundation/ipa/' },
    },
});

// TODO: Figure out why the above import isn't working.
// export type SupportedChainIds = "1513" | "iliad";

// Utility function to check if a string is a valid SupportedChainIds value
function isSupportedChainId(chainId: string): chainId is SupportedChainIds {
    return chainId === "1513" || chainId === "iliad";
}

/**
 * This interface is solely to allow string indexing on the
 *  listOfNftObjs data member.
 */
type ListOfNftObjectsInterface = Record<string, unknown>; // Allow indexing with string keys

/**
 * This interface is conform the type of NFT arrays.
 */
type ArrayOfNftObjectsInterface = unknown[]; // Allow indexing with string keys


// -------------------- BEGIN: SERIALIZER/DESERIALIZE USER BLOCKCHAIN PRESENCE ------------

/**
 * Serializes an object containing BigInt properties by converting BigInt values to strings.
 *
 * @param obj - The object to serialize.
 * @returns The JSON string with BigInt values converted to strings.
 */
function serializeWithBigInt(obj: any): string {
    return JSON.stringify(obj, (_key, value) => {
        return typeof value === 'bigint' ? value.toString() : value;
    });
}

/**
 * Deserializes a JSON string, converting BigInt-like string values back to BigInt.
 *
 * @param jsonStr - The JSON string to deserialize.
 * @returns The object with BigInt values restored.
 */
function deserializeWithBigInt(jsonStr: string): any {
    return JSON.parse(jsonStr, (_key, value) => {
        if (typeof value === 'string' && /^\d+n?$/.test(value)) {
            return BigInt(value.replace('n', ''));
        }
        return value;
    });
}

// -------------------- END  : SERIALIZER/DESERIALIZE USER BLOCKCHAIN PRESENCE ------------

/**
 * Class to maintain a user's blockchain details and facilitate transactions with MetaMask.
 *
 * WARNING: Keep the latest version of this class in sync with the
 *  back-end server!
 */
export class UserBlockchainPresence {

    // -------------------- BEGIN: DATA MEMBERS ------------

    // The preflight check will set these values.
    // public currentAccount: Account | null = null;
    public publicAddress: Hex = HEX_UNINITIALIZED_VALUE;
    public walletClient: unknown = null;
    public chainId = '';
    public enforceChainId: string | null;

    // >>>>> STORY PROTOCOL

    // This is the user's primary Story Protocol Gateway
    //  NFT collection hash.
    public spgNftCollectionDetails: SpgNftCollectionDetails = {
        name: '',
        symbol: '',
        contract_address: HEX_UNINITIALIZED_VALUE,
        tx_hash: HEX_UNINITIALIZED_VALUE
    };

    // Every time they create a new NFT against their
    //  SPG NFT collection, it will be added to this
    //  array.
    public listOfNftObjs: ListOfNftObjectsInterface = {};

    // We also add the new NFT to this array that we keep
    //   in chronological order of NFT creation.
    public aryOfNftObjectsInterface: ArrayOfNftObjectsInterface = [];

    // -------------------- END  : DATA MEMBERS ------------

    /**
     * @Constructor
     *
     * @param enforceChainId - The chain ID the public address
     *  is tied to.
     */
    constructor(enforceChainId: string | null) {
        if (enforceChainId !== null) {
            if (enforceChainId.length < 1)
                throw new Error(`The enforceChainId parameter is not NULL, so it can not be empty.`);
        }

        this.enforceChainId = enforceChainId;
    }

    /**
     * This function returns TRUE if the SPG NFT collection details
     *  have been created yet for this user blockchain presence object,
     *  FALSE if not.
     */
    public isSpgNftCollectionInitialized() {
        return !isHexUninitializedValue(this.spgNftCollectionDetails.contract_address);
    }

    // -------------------- BEGIN: NFT ARRAY FUNCTIONS ------------

    /**
     * Store a newly created NFT in our collection of those.
     *  If there is an existing entry for that NFT, its
     *  value will be overwritten with the new one.
     *
     * @param mintAndRegisterResponseObj - The response object
     *  from a mint and register call.
     */
    public addNftDetailsIntoSpgCollection(
        mintAndRegisterResponseObj: MintNftRequestAndResponse) {

        // Store the NFT details in a property whose name
        //  is the ipId value.
        this.listOfNftObjs[mintAndRegisterResponseObj.ipId] = mintAndRegisterResponseObj

        // Add it to the array we keep in chronological order
        //  of NFT creation.
        this.aryOfNftObjectsInterface.push(mintAndRegisterResponseObj)
    }

    // -------------------- END  : NFT ARRAY FUNCTIONS ------------

    /**
     * Checks if MetaMask is installed in the browser.
     * @returns True if MetaMask is installed, false otherwise.
     */
    public isMetamaskInstalled(): boolean {
        const isInstalled =
            typeof window !== 'undefined' &&
            typeof window.ethereum !== 'undefined' &&
            window.ethereum?.isMetaMask === true;
        if (bVerboseUserManagement) {
            console.log(`isMetamaskInstalled: ${isInstalled}`);
        }
        return isInstalled;
    }

    /**
     * Checks if MetaMask wallet is available.
     * @returns True if MetaMask is ready, false otherwise.
     */
    public isMetamaskReady(): boolean {
        const isReady = this.isMetamaskInstalled();
        if (bVerboseUserManagement) {
            console.log(`isMetamaskReady: ${isReady}`);
        }
        return isReady;
    }

    /**
     * Checks if MetaMask is connected to our web app.
     * @returns True if connected, false otherwise.
     */
    public async isMetamaskConnected(): Promise<boolean | null | undefined> {
        if (!this.isMetamaskInstalled()) {
            if (bVerboseUserManagement) {
                console.log(`isMetamaskConnected: MetaMask is not installed.`);
            }
            return false;
        }
        try {
            const accounts = await window.ethereum?.request<string[]>({ method: 'eth_accounts' });
            const isConnected = accounts && accounts.length > 0;
            if (bVerboseUserManagement) {
                console.log(`isMetamaskConnected: ${isConnected}`);
            }
            return isConnected;
        } catch (error: unknown) {
            if (bVerboseUserManagement) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.log(`isMetamaskConnected error: ${errorMessage}`);
            }
            return false;
        }
    }

    /**
     * Connects to MetaMask.
     * @returns True if connected, false otherwise.
     */
    public async connectToMetamask(): Promise<boolean> {
        const isConnected = await this.isMetamaskConnected();
        if (isConnected) {
            if (bVerboseUserManagement) {
                console.log('connectToMetamask: Already connected to MetaMask.');
            }
            return true;
        }
        try {
            const accounts = await window.ethereum?.request<string[]>({ method: 'eth_requestAccounts' });
            if (accounts && accounts.length > 0) {
                if (bVerboseUserManagement) {
                    console.log('connectToMetamask: Successfully connected to MetaMask.');
                }
                return true;
            } else {
                if (bVerboseUserManagement) {
                    console.log('connectToMetamask: No accounts returned.');
                }
                return false;
            }
        } catch (error: unknown) {
            if (bVerboseUserManagement) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.log(`connectToMetamask error: ${errorMessage}`);
            }
            return false;
        }
    }

    /**
     * Gets the current chain ID from MetaMask.
     *
     * @returns The current chain ID.
     *
     * @throws Error if the operation fails.
     */
    public async getCurrentChainId(): Promise<SupportedChainIds> {
        try {
            const hexChainId =
                await window.ethereum?.request<string>({ method: 'eth_chainId' });

            if (bVerboseUserManagement) {
                console.log(`getCurrentChainId: ${hexChainId} (${getFriendlyChainIdName(maybeTypeToString(hexChainId))})`);
            }

            if (hexChainId === null || typeof hexChainId === 'undefined')
                throw new Error(`The chain ID is unassigned.`);

            // Need to convert the hex chain ID to a SupportedChainIds value.
            if (hexChainId === '0x5e9')
                // Only iliad is supported currently.
                return 'iliad'
            else
                throw new Error(`The following chain ID value is invalid: ${hexChainId}`);

        } catch (error: unknown) {
            if (bVerboseUserManagement) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.log(`getCurrentChainId error: ${errorMessage}`);
            }
            throw new Error(
                `Failed to get current chain ID: ${error instanceof Error ? error.message : String(error)}`
            );

        }
    }

    /**
     * This function returns a StoryConfig object built from
     *  our data members.
     *
     * @private
     */
    private async _getStoryConfig(): Promise<StoryConfig> {
        if (!window.ethereum)
            throw new Error(`Unable to find an Ethereum provider.`);

        const ethProvider: MetaMaskInpageProvider = window.ethereum;

        const config: StoryConfig = {
            // account: this.currentAccount, // MetaMask account
            chainId: await this.getCurrentChainId(), // Get the current chain ID from MetaMask
            // transport: custom(ethProvider), // Using MetaMask's provider
            transport: http(RPCProviderUrl), // Using MetaMask's provider
            wallet: this.walletClient as SimpleWalletClient
        };

        return config
    }

    /**
     * This function creates the primary SPG NFT collection for the
     *  user.
     *
     * @param collectionName - The name for the SPG NFT collection
     * @param collectionSymbol - The symbol SPG NFT collection
     *
     * @returns - Returns TRUE if the operation succeeded, FALSE
     *  if not.
     */
    public async createSpgNftCollection(collectionName: string, collectionSymbol: string): Promise<boolean> {
        try {
            if (collectionName.length < 1)
                throw new Error(`The collection name is empty.`);
            if (collectionSymbol.length < 1)
                throw new Error(`The collection symbol is empty.`);

            // Ensure that preflight checks are done and MetaMask is connected
            const isReady = await this.preflightCheck();
            if (!isReady) {
                console.error("MetaMask is not ready for transactions.");
                return false
            }

            // Set up StoryClient configuration using Metamask account and provider
            const storyConfigObj = await this._getStoryConfig();

            const storyClientObj = StoryClient.newClient(storyConfigObj);

            const createNftCollectionRequestObj: CreateNFTCollectionRequest =
                {
                    name: collectionName,      // Name for the new NFT collection
                    symbol: collectionSymbol,  // Symbol for the collection
                    txOptions: { waitForTransaction: true }, // Options for waiting for the transaction to complete,
                    owner: this.publicAddress // Make sure you provide the owner address here!
                }

            // Create the SPG NFT Collection using the StoryClient
            const newCollection = await storyClientObj.nftClient.createNFTCollection(createNftCollectionRequestObj);

            // Log the results
            console.log(
                `New SPG NFT collection created at transaction hash ${newCollection.txHash}`,
                `NFT contract address: ${newCollection.nftContract}`
            );

            if (typeof newCollection.nftContract === 'undefined')
                throw new Error(`The SPG NFT collection contract is invalid.`);
            if (typeof newCollection.txHash === 'undefined')
                throw new Error(`The transaction hash for the SPG NFT collection contract.`);


            // Store the collection details in the user object
            this.spgNftCollectionDetails = {
                name: collectionName,
                symbol: collectionSymbol,
                contract_address: newCollection.nftContract,
                tx_hash: newCollection.txHash,
            };

            return true
        } catch (error) {
            console.error("Failed to create NFT collection:", error);
            return false
        }
    }

    /**
     * Given an NFT minting details object, mint and register
     *  the NFT.
     *
     * @param imageDetailsForNftMinting - The NFT minting
     *  details object that describes the NFT.
     *
     * @returns - Returns the response object that contains
     *  the mint and register results.
     */
    public async mintAndRegisterNft(imageDetailsForNftMinting: MintNftImageDetails): Promise<MintNftRequestAndResponse> {

        // Ensure that preflight checks are done and MetaMask is connected
        const isReady = await this.preflightCheck();
        if (!isReady) {
            throw new Error("MetaMask is not ready for transactions.");
        }

        // Set up StoryClient configuration using Metamask account and provider
        const config = await this._getStoryConfig();

        const storyClientObj = StoryClient.newClient(config);

        // -------------------- BEGIN: MINT AND REGISTER NFT ------------

        // Register the NFT as an IP Asset

        // NOTE: The response we got from the server to our
        //  mint NFT request has the URI and hash details
        //  we need to mint and register the NFT since it
        //  does that part of the transaction for us.
        //
        // Docs: https://docs.story.foundation/docs/spg-functions#mint--register--attach-terms

        const ipMetadataURI = `https://ipfs.io/ipfs/${imageDetailsForNftMinting.ipMetadata.ipMetadataURI}`;
        const nftMetadataURI = `https://ipfs.io/ipfs/${imageDetailsForNftMinting.ipMetadata.nftMetadataURI}`;

        const ipMetadataHash = `0x${imageDetailsForNftMinting.ipMetadata.ipMetadataHash}`;
        const nftMetadataHash = `0x${imageDetailsForNftMinting.ipMetadata.nftMetadataHash}`;

        // const ipMetadataHash = toHex(`0x${imageDetailsForNftMinting.ipMetadata.ipMetadataHash}`, {size: 32});
        // const nftMetadataHash = toHex(`0x${imageDetailsForNftMinting.ipMetadata.nftMetadataHash}`, {size: 32});

        const mintAndRegisterRequestObj: CreateIpAssetWithPilTermsRequest =
            {
                // Put the user's SPG NFT collection contract hash here.
                nftContract: this.spgNftCollectionDetails.contract_address,

                pilType: PIL_TYPE.NON_COMMERCIAL_REMIX,
                ipMetadata: {
                    ipMetadataURI: ipMetadataURI,
                    ipMetadataHash: ipMetadataHash as Hex,
                    nftMetadataURI: nftMetadataURI,
                    nftMetadataHash: nftMetadataHash as Hex,
                },
                recipient: this.publicAddress,
                txOptions: { waitForTransaction: true },
            }

        const mintAndRegisterResponseObj: CreateIpAssetWithPilTermsResponse =
            await storyClientObj.ipAsset.mintAndRegisterIpAssetWithPilTerms(mintAndRegisterRequestObj)

        if (typeof mintAndRegisterResponseObj.ipId === 'undefined' || isHexUninitializedValue(mintAndRegisterResponseObj.ipId) )
            throw new Error(`Invalid ID for the mint and register operation.`);

        console.log(`Root IPA created at transaction hash ${mintAndRegisterResponseObj.txHash}, IPA ID: ${mintAndRegisterResponseObj.ipId}`)
        console.log(`View on the explorer: https://explorer.story.foundation/ipa/${mintAndRegisterResponseObj.ipId}`)

        // -------------------- END  : MINT AND REGISTER NFT ------------

        const mintNftRequestAndResponseObj = {
            ipId: mintAndRegisterResponseObj.ipId,
            mintNftRequestDetails: mintAndRegisterRequestObj,
            mintNftResponseDetails: mintAndRegisterResponseObj
        }

        return mintNftRequestAndResponseObj;
    }

    /**
     * Gets the current public address from MetaMask.
     * @returns The current public address.
     * @throws Error if the operation fails.
     */
    public async getCurrentPublicAddress(): Promise<Hex> {
        try {
            const accounts = await window.ethereum?.request<string[]>({ method: 'eth_accounts' });
            if (accounts && accounts.length > 0) {
                const address = accounts[0];
                if (bVerboseUserManagement) {
                    console.log(`getCurrentPublicAddress: ${address}`);
                }

                if (typeof address !== 'string')
                    throw new Error(`The address returned is not a string.`);

                if (!isHex(address))
                    throw new Error(`The address received from Metamask is not a string.`);

                return address;
            } else {
                throw new Error('No accounts available.');
            }
        } catch (error: unknown) {
            if (bVerboseUserManagement) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.log(`getCurrentPublicAddress error: ${errorMessage}`);
            }
            throw new Error(
                `Failed to get current public address: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Switches to the specified chain ID in MetaMask.
     * @param newChainId - The chain ID to switch to.
     * @returns True if the switch was successful, false otherwise.
     * @throws Error if newChainId is invalid.
     */
    public async switchToChainId(newChainId: string): Promise<boolean> {
        if (!newChainId) {
            throw new Error('chainId cannot be empty.');
        }

        try {
            // Validate newChainId by attempting to get its friendly name
            const chainName = getFriendlyChainIdName(newChainId);
            if (bVerboseUserManagement) {
                console.log(`Attempting to switch to chain ID: ${newChainId} (${chainName})`);
            }
        } catch (error: unknown) {
            if (bVerboseUserManagement) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.log(`switchToChainId error: ${errorMessage}`);
            }
            throw new Error(`Invalid chain ID: ${newChainId}`);
        }

        try {
            await window.ethereum?.request<void>({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: newChainId }],
            });

            this.chainId = newChainId;

            if (bVerboseUserManagement) {
                console.log(`Switched to chain ID: ${newChainId} (${getFriendlyChainIdName(newChainId)})`);
            }

            return true;
        } catch (error: unknown) {
            if (bVerboseUserManagement) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.log(`switchToChainId error: ${errorMessage}`);
            }
            return false;
        }
    }

    /**
     * Default implementation of doNotifyUser.
     * @param msgToUser - The message to display to the user.
     */
    private defaultDoNotifyUser(msgToUser: string): void {
        if (!msgToUser || msgToUser.trim() === '') {
            console.error('doNotifyUser: msgToUser cannot be empty.');
            return;
        }
        // Replace alert with a console log to avoid using alert in code
        console.log(`User notification: ${msgToUser}`);
    }

    /**
     * Performs a preflight check to ensure MetaMask is ready and connected.
     *
     * @param doNotifyUser - Function to notify the user with messages.
     *
     * @returns True if the preflight check is successful, false otherwise.
     */
    public async preflightCheck(
        doNotifyUser: NotifyUserFunction = this.defaultDoNotifyUser.bind(this)
    ): Promise<boolean> {
        const notify = doNotifyUser;

        // Check if MetaMask is installed
        if (!this.isMetamaskInstalled()) {
            notify(NotifyUserMessages.MetamaskNotInstalled);
            return false;
        }

        // Check if MetaMask is ready
        if (!this.isMetamaskReady()) {
            notify(NotifyUserMessages.MetamaskNotReady);
            return false;
        }

        // Check if MetaMask is connected
        const isConnected = await this.isMetamaskConnected();
        if (!isConnected) {
            const connected = await this.connectToMetamask();
            if (!connected) {
                notify(NotifyUserMessages.UnableToConnectMetamask);
                return false;
            }
        }

        // Get the current chain ID
        let currentChainId: string;

        try {
            const returnedChainId = await this.getCurrentChainId();

            if (typeof returnedChainId !== 'string')
                throw new Error(`Unable to get the current chain ID.`);

            currentChainId = returnedChainId
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            notify(`Failed to get current chain ID: ${errorMessage}`);
            return false;
        }

        // Handle enforceChainId
        if (this.enforceChainId) {
            if (currentChainId !== this.enforceChainId) {
                try {
                    const switched = await this.switchToChainId(this.enforceChainId);
                    if (!switched) {
                        const chainName = getFriendlyChainIdName(this.enforceChainId);
                        notify(NotifyUserMessages.WrongChainId + `${chainName}.`);
                        return false;
                    }
                } catch (error: unknown) {
                    const chainName = getFriendlyChainIdName(this.enforceChainId);
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    notify(
                        NotifyUserMessages.WrongChainId + `${chainName}. Error details:\n${errorMessage}`
                    );
                    return false;
                }
            } else {
                this.chainId = currentChainId;
            }
        } else {
            this.chainId = currentChainId;
        }

        // Initialize the wallet client data member and get the current public address.
        try {
            // We need access to the MetaMask provider from the global window object
            const provider: false | EthereumProvider | undefined =
                typeof window !== 'undefined' && window.ethereum;

            if (!provider) {
                // This should not happen since we do a full presence check for
                //  Metamask, but just in case.
                console.error("MetaMask is not installed or provider is unavailable.");
            } else {
                // Initialize the wallet client using the MetaMask provider
                this.walletClient = createWalletClient({
                    // Need to specify the chain here too.
                    // TODO: This should not be hard-coded.
                    chain: iliadChain,
                    transport: custom(provider),
                });

                // Make the public address easy to get to.
                this.publicAddress = await this.getCurrentPublicAddress();

                // Set the wallet client to the currently selected
                //  public address.
                (this.walletClient as { account: string}).account = this.publicAddress
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            notify(NotifyUserMessages.UnableToGetPublicAddress + errorMessage);
            return false;
        }

        // Preflight check successful
        if (bVerboseUserManagement) {
            console.log('preflightCheck: Successful.');
        }
        return true;
    }

    /**
     * Returns an NFT from our array of NFTs.
     *
     * @param ndxOfNft - The index into the NFT arrays
     *  for the desired NFT details.  -1 will get  you
     *   the details for the most recently created NFT.
     *
     * @returns - Returns the NFT details object at the
     *  desired array slot.  If the array is empty, then
     *  NULL is returned.  If ndxOfNft is -1, the details
     *  of the most recently created NFT will be returned.
     */
    public getNftByIndex(ndxOfNft=-1): unknown | null {

        // TODO: Use different explorers for different blockchains.
        if (ndxOfNft < -1 || ndxOfNft >= this.aryOfNftObjectsInterface.length)
            throw new Error(`Invalid NFT objects array index.`);

        // If ndxOfNft is -1, that means get the latest one
        //  added.
        if (ndxOfNft === -1) {
            if (this.aryOfNftObjectsInterface.length < 1)
                // No NFTs yet.
                return null
            else
                // Return the most recently created NFT.
                return this.aryOfNftObjectsInterface[this.aryOfNftObjectsInterface.length - 1]
        } else {
            // Return the requested NFT at the desired slot index.
            return this.aryOfNftObjectsInterface[ndxOfNft]
        }
    }

    /**
     * This function returns the explore page URL that will show
     *  the blockchain details for a desired NFT object.
     *
     * @param ndxOfNft - The index into the NFT arrays
     *  for the desired NFT details.  -1 will get  you
     *   the details for the most recently created NFT.
     *
     * @returns - Returns the explorer page URL for the
     *  desired NFT, found in our array of NFTs
     *  at the specified index.
     */
    public getNftExplorerPageUrl(ndxOfNft=-1) {
        // Get the Nft at the specified index from our array of those.
        const nftDetails =
            this.getNftByIndex(ndxOfNft);

        if (!nftDetails)
            throw new Error(`Invalid NFT index of the NFT array is empty.`);

        const mintRequestAndResponseDetailsObj =
            nftDetails as MintNftRequestAndResponse;

        const nftId =
            mintRequestAndResponseDetailsObj.mintNftResponseDetails.ipId;

        // TODO: Have different explorer URLs for different blockchains.
        const explorerPageUrl =
            `https://explorer.story.foundation/ipa/${nftId}`

        return explorerPageUrl
    }

    /**
     * Return the contents of this object in string format
     *  but with proper handling of BigInt fields.
     */
    public toJsonString() {
        return serializeWithBigInt(this)
    }

    /**
     * Static method to reconstitute a plain JSON object
     */
    static fromJsonObject(rawJson: Partial<UserBlockchainPresence>): UserBlockchainPresence {
        return new UserBlockchainPresence(rawJson.enforceChainId ?? '');
    }

    /**
     * Static method to reconstitute a plain JSON object
     *  but one that is JSON.stringify() string format.
     */
    static fromJsonString(jsonStr: string): UserBlockchainPresence {
        if (jsonStr.length < 1)
            throw new Error(`The JSON string is empty.`);

        // Deserialize the JSON object with proper handling
        //  for BigInt fields.
        const rawJson =
            deserializeWithBigInt(jsonStr)

        return reconstituteUserBlockchainPresence(rawJson);
    }
}


/**
 * Reconstitute a user blockchain presence object in plain
 *   JSON object format to a UserBlockchainPresence object.
 *
 * @param rawJson - The plain JSON object
 */
/* eslint-disable */
export function reconstituteUserBlockchainPresence(rawJson: Record<string, unknown>): UserBlockchainPresence {
    // Validate that the raw data is an object
    if (typeof rawJson !== 'object' || rawJson === null) {
        throw new Error('Invalid JSON structure for UserBlockchainPresence.');
    }

    // Create a new UserBlockchainPresence object
    const userBlockchainPresence = UserBlockchainPresence.fromJsonObject(rawJson);

    // Disable TypeScript checks by casting to any
    const userBlockchainPresenceAny = userBlockchainPresence as any;

    // Iterate over the properties in the raw JSON object and dynamically assign them to the instance
    Object.keys(rawJson).forEach((key) => {
        userBlockchainPresenceAny[key] = rawJson[key]; // No type checks
    });

    return userBlockchainPresence;
}
/* eslint-enable */


