import { UserBlockchainPresence } from "../blockchain/user-blockchain-presence"
import { Hex } from "viem"

/**
 * Simple true/false result object for most responses
 *  to client side requests.
 */
export interface OperationResult {
	result: boolean
}

export interface LivepeerImage {
	seed: number
	url: string
	nsfw: boolean
}
export interface StateType {
	streaming_audio: boolean
	streaming_text: boolean
	waiting_for_images: boolean
	current_request_id: string
	state_change_message: string
}

export interface ErrorType {
	error: string
}

export interface TextType {
	delta: string
}

export interface ImageType {
	urls: string[]
}

export interface ImageDimensions{
	width: number,
	height: number
}

/**
 * This is the payload we expect for a request to process
 *  a license assistant chat volley.
 */
export interface LicenseAssistantRequest {
	// The ID of the current user.
	user_id: string,
	// The latest user input.
	prompt: string,
	// If TRUE, then we should treat the next license
	//  assistant chat volley as the start of a new
	//  license terms session.  If FALSE, then we
	//  should treat it as an ongoing session.
	is_new_license_session: boolean
}

/**
 * This is the websocket message we send back to the front-end
 *  that lets it know whether or not the user is satisfied
 *  with the license terms for its NFT, currently being
 *  discussed with the license assistant.
 */
export interface LicenseType {
	is_license_ok_with_user: boolean
}

/**
 * This is the response payload created as a result of
 *  a Twitter share request from the client front-end.
 *
 * WARNING: This interface must match the declaration
 *  used by the client front-end.
 *
export interface TwitterImageCardUrlType {
	tweet_text: string,
	url_to_twitter_card: string,
	hash_tags_array: string[]
}
*/

/**
 * This is the expected request payload for a request from
 *  the client front-end to share a generated image on
 *  Twitter.
 *
 * WARNING: This interface must match the declaration
 *  used by the client front-end.
 */
export interface ShareImageOnTwitterRequest {
	// The ID of the user making the request.
	user_id: string,
	// The Livepeer image URL for the generated image.
	image_url: string,
	// The image dimensions.
	dimensions: ImageDimensions,

	// This field contains the custom
	//  value, if any, that the client passed
	//  to the back-end server during
	//  a request to it, in the
	//  TwitterCardDetails object.
	client_user_message: string
}

/**
 * This is the expected request payload for a request from
 *  the client front-end to mint a generated image on
 *  as an NFT.
 *
 * WARNING: This interface must match the declaration
 *  used by the client front-end.
 */
export interface MintNftRequest {
	// The ID of the user making the request.
	user_id: string,
	// The UserBlockchainPresence object for the requesting
	//  user in plain JSON format.  We will reconstitute it
	//  to a UserBlockchainPresence object.
	user_blockchain_presence_json_stringified: string,
	// The Livepeer image URL for the generated image.
	image_url: string,
	// The image dimensions.
	dimensions: ImageDimensions,

	// This field contains the custom
	//  value, if any, that the client passed
	//  to the back-end server during
	//  a request to it, in the
	//  TwitterCardDetails object.
	client_user_message: string
}

/**
 * This is the expected request payload for a request from
 *  the client front-end to share a generated image on
 *  Twitter.
 *
 * WARNING: This interface must match the declaration
 *  used by the client front-end.
 */
export interface GetUserBlockchainPresenceRequest {
	// The public address of the user making the request.
	user_public_address: string
}

// We use this type to cover all the plain JSON objects
//  we receive from the back-end object.
export type PlainJsonObject = Record<string, unknown>;

// Stringified JSON objects.
export type StringifiedJsonObject = string;

/**
 * This is the expected request payload for a request from
 *  the client front-end to share a generated image on
 *  Twitter.
 *
 * WARNING: This interface must match the declaration
 *  used by the client front-end.
 */
export interface StoreUserBlockchainPresenceRequest {
	// The user blockchain presence object to store for the
	//  given public address in stringified format.
	user_blockchain_presence_stringified: StringifiedJsonObject
}

/**
 * This interface describes a Twitter card details object.
 *
 * WARNING: This interface must match the declaration
 *  used by the client front-end.
 */
export interface TwitterCardDetails {
	card: string,
	tweet_text: string,
	hash_tags_array: string[],
	twitter_card_title: string,
	twitter_card_description: string,
	url_to_image: string,
	dimensions: ImageDimensions,

	// This is a copy of the full Twitter card URL
	//  that is here for convenience purposes to
	//  help the caller.
	twitter_card_url: string,

	// This field can be used by the front-end
	//  client to pass custom information back
	//  to itself.
	client_user_message: string
}

/**
 * These are the fields required for registering and minting
 *  an NFT.
 *
 *  These interface declaration must be the same between
 *   server and client.
 */
export interface IpMetadataUrisAndHashes {
	ipMetadataURI: string;
	ipMetadataHash: Hex;
	nftMetadataURI: string;
	nftMetadataHash: Hex;
}

/**
 * This interface extends the Twitter card details object
 *  to include the fields we need for minting an NFT.
 *
 * WARNING: This interface must match the declaration
 *  used by the client front-end.
 */
export interface MintNftImageDetails extends TwitterCardDetails {
	// We add the blockchain related elements to the
	//  Twitter card details.
	user_blockchain_presence_stringified: string,

	// We return the metadata the client needs to mint and
	//  register the asset.
	ipMetadata:  IpMetadataUrisAndHashes
}

// The request payload for a Storytime app request.
export interface RequestPayload_storytime {
	prompt: string
	genre: Genre
}

// The request payload for a Chatbot app request.
export interface RequestPayload_chat_bot {
	prompt: string
}

export interface Prompt {
	prompt: string
	caveat?: string
}

export type Genre =
	| "magic"
	| "scifi"
	| "swords"
	| "romance"
	| "drama"
	| "apocalypse"
	| "hollywood"
	| "singularity"
