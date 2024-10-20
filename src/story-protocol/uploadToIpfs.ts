import pinataSDK from "@pinata/sdk"

export async function uploadJSONToIPFS(jsonMetadata: any): Promise<string> {
    if (typeof process.env.PINATA_JWT === 'undefined')
        throw new Error(`Could not find the PINATA_JWT environment variable.`);

    const pinata = new pinataSDK({ pinataJWTKey: process.env.PINATA_JWT })
    const { IpfsHash } = await pinata.pinJSONToIPFS(jsonMetadata)
    return IpfsHash
}
