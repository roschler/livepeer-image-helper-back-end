import pinataSDK from "@pinata/sdk"
import { getEnvironmentVarOrError } from "../common-routines"

export async function uploadJSONToIPFS(jsonMetadata: any): Promise<string> {
    const pinataJwtApiKey =
        getEnvironmentVarOrError("PINATA_JWT");

    const pinata = new pinataSDK({ pinataJWTKey: pinataJwtApiKey })
    const { IpfsHash } = await pinata.pinJSONToIPFS(jsonMetadata)
    return IpfsHash
}
