import type WebSocket from "ws"
import fs, { createWriteStream } from "fs"
import {
	LivepeerImage,
	ImageType,
	StateType,
	ErrorType,
	TextType,
	Genre, TwitterCardDetails, OperationResult, MintNftImageDetails,
} from "./types"
import path from "node:path"
import { OpenAIParams_text_completion } from "../openai-parameter-objects"
import { CurrentChatState_image_assistant } from "../chat-volleys/chat-volleys"
import { StatusCodes } from 'http-status-codes';
import { UserBlockchainPresence } from "../blockchain/user-blockchain-presence"

// Pull in all of our environment variables
// and set defaults if any of them are missing
const livepeer_sd_gateway =
	process.env.LIVEPEER_SD_GATEWAY_HOST ?? "dream-gateway.livepeer.cloud"
const model_id = process.env.LIVEPEER_SD_MODEL_ID ?? "ByteDance/SDXL-Lightning"
const negative_prompt = process.env.LIVEPEER_SD_NEGATIVE_PROMPT ?? undefined
const image_size = Number(process.env.LIVEPEER_SD_IMAGE_SIZE ?? "1024")
const guidance_scale = Number(process.env.LIVEPEER_SD_GUIDANCE ?? "15")
const num_images = Number(process.env.LIVEPEER_SD_IMAGE_COUNT ?? "1")

const livePeerRequestOptions = {
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		Authorization: `Bearer ${process.env.LIVEPEER_API_KEY}`,
	},
}

/**
 * Make an image generation request against the Livepeer service
 *  for the Storytime app.
 *
 * @param {String} prompt - The prompt to pass to the Livepeer
 *  image generation API.
 *
 * @return {Promise<*>}
 */
export const generateImages_storytime = async (prompt: string): Promise<any> => {
	let urls
	const body = {
		prompt,
		model_id,
		guidance_scale,
		negative_prompt,
		width: image_size,
		height: image_size,
		num_images_per_prompt: num_images,
	}
	const request = await _request({
		...livePeerRequestOptions,
		body: JSON.stringify(body),
	})

	const { images } = await request.json()
	if (!images || images.length === 0) {
		throw new Error("No images returned from Livepeer")
	}

	try {
		urls = images.map((image: LivepeerImage) => {
			return image.url
		})
	} catch (e) {
		console.error("Error parsing image URLs", e)
	}
	return urls
}

/**
 * Make an image generation request against the Livepeer service
 *  for the Chatbot app.
 *
 * NOTE: This function uses an exponential back-off and retry
 *  algorithm if the Livepeer network is busy.  (i.e. - It
 *  returns a 503/Service Unavailable error).
 *
 * @param prompt - The prompt to pass to the image generator model.
 * @param negative_prompt - The negative prompt to pass to the image generator model.
 * @param chatStateObj - The current state of the chat session.
 * @param funcStateMessage - Optional function to receive state messages, or null.
 * @param maxRetries - Maximum retry count; should be a positive integer or 0.
 *
 * @return {Promise<string[]>} - Array of image URLs.
 */
export const generateImages_chat_bot = async (
	prompt: string,
	negative_prompt: string,
	chatStateObj: CurrentChatState_image_assistant,
	funcStateMessage: ((stateMessage: string) => void) | null,
	maxRetries: number
): Promise<string[]> => {

	// Validate maxRetries parameter
	if (typeof maxRetries !== "number" || maxRetries < 0) {
		throw new Error("maxRetries must be a positive integer or 0.");
	}

	let urls: string[]
		= [];
	const body = {
		prompt: prompt,
		model_id: chatStateObj.model_id,
		lora_models: {},
		guidance_scale: chatStateObj.guidance_scale,
		negative_prompt: negative_prompt,
		width: image_size,
		height: image_size,
		num_images_per_prompt: num_images,
	};

	let attempt = 0;

	// Retry loop with exponential back-off
	while (attempt <= maxRetries) {
		try {
			const request = await _request({
				...livePeerRequestOptions,
				body: JSON.stringify(body),
			});

			// Check if request succeeded
			if (request.status === StatusCodes.OK) {
				const { images } = await request.json();
				if (!images || images.length === 0) {
					throw new Error("No images returned from Livepeer");
				}
				urls = images.map((image: LivepeerImage) => image.url);
				return urls; // Exit if successful
			} else if (request.status === StatusCodes.SERVICE_UNAVAILABLE) {
				// Handle 503 Service Unavailable with exponential back-off
				attempt += 1;
				if (attempt > maxRetries) {
					throw new Error(
						"Livepeer network is under heavy load. Please try again later."
					);
				}

				// Calculate exponential back-off delay (e.g., 1s, 2s, 4s, ...)
				const numSecondsBeforeRetry = Math.pow(2, attempt);

				// Notify state message if funcStateMessage is provided
				if (funcStateMessage && attempt > 1) {
					funcStateMessage(
						`Livepeer is busy. Retrying image request in ${numSecondsBeforeRetry} seconds...`
					);
				}

				// Wait for the calculated back-off time before retrying
				await new Promise((resolve) =>
					setTimeout(resolve, numSecondsBeforeRetry * 1000)
				);
			} else {
				// If it's another error, throw it directly
				const errMsg = `(generateImages_chat_bot) The image request failed with status code(${request.status}) and status text: ${request.statusText}\nService URL: ${request.url}`;
				console.error(errMsg);
				throw new Error(errMsg);
			}
		} catch (error) {
			// Log error on last attempt if retries are exhausted
			if (attempt >= maxRetries) {
				console.error(
					"Error after maximum retries:", error
				);
				throw error;
			}
			attempt += 1;
		}
	}

	return urls; // Empty array if no successful response and maxRetries exhausted
};

/**
 * Create a request object for our use.
 *
 * @param {Object} options - The options for the
 *  current request.
 *
 * @return {Promise<Response>} - The promise resolves
 *  to the response from the Livepeer service.
 *
 * @private
 */
const _request = async (options: object): Promise<Response> => {
	const endpoint = `https://${livepeer_sd_gateway}/text-to-image`
	return fetch(endpoint, options)
}

export const sendTextMessage = (client: WebSocket, payload: TextType) => {
	_send(client, {
		type: "text",
		payload,
	})
}

/**
 * Send a JSON object to the client.
 *
 * @param client - The target websocket client.
 * @param jsonObj - The JSON object to send.  It will
 *  be stringified.
 */
export const sendJsonObjectMessage = (client: WebSocket, jsonObj: object) => {
	const payload = JSON.stringify(jsonObj)

	_send(client, {
		type: "json_response_object_stringified",
		payload,
	})
}

export const sendImageMessage = (client: WebSocket, payload: ImageType) => {
	_send(client, {
		type: "image",
		payload,
	})
}

export const sendStateMessage = (client: WebSocket, payload: StateType) => {
	_send(client, {
		type: "state",
		payload,
	})
}

/**
 * This function sends a Twitter card URL response to the websocket
 *  client.
 *
 * @param client - The target websocket client.
 * @param payload - The message payload.
 */
export const sendTwitterCardUrlMessage = (client: WebSocket, payload: TwitterCardDetails) => {
	_send(client, {
		type: "twitter_card_details",
		payload,
	})
}

/**
 * This function sends a mint NFT image details response to the websocket
 *  client.
 *
 * @param client - The target websocket client.
 * @param payload - The message payload.
 */
export const sendMintNftImageDetailsMessage = (client: WebSocket, payload: MintNftImageDetails) => {
	_send(client, {
		type: "mint_nft_image_details",
		payload,
	})
}

/**
 * This function sends a UserBlockchainPresence object
 *  back to the client.
 *
 * @param client - The target websocket client.
 * @param userBlockchainPresenceObj - The user blockchain presence
 *  object to send as a result of a request.
 */
export const sendUserBlockchainPresence = (client: WebSocket, userBlockchainPresenceObj: UserBlockchainPresence|null) => {

	const payload =
		userBlockchainPresenceObj ===  null
	? null
			: userBlockchainPresenceObj.toJsonString()

	_send(client, {
		type: "get_user_blockchain_presence_result",
		payload,
	})
}

//
/**
 * This function sends a UserBlockchainPresence object
 *  back to the client.
 *
 * @param client - The target websocket client.
 * @param payload - The message payload.
 */
export const sendUserBlockchainPresenceStoreResult = (client: WebSocket, payload: OperationResult) => {
	_send(client, {
		type: "store_user_blockchain_presence_result",
		payload,
	})
}

export const sendErrorMessage = (client: WebSocket, payload: ErrorType) => {
	_send(client, {
		type: "error",
		payload,
	})
}

const _send = (c: WebSocket, p: object) => {
	c.send(JSON.stringify(p))
}

/**
 * Saves the meta-data associated with an ongoing Storytime
 *  session.
 *
 * @param {String} fileName - The output file name for the
 *  metadata to be stored in.
 * @param {Object} payload - The object to write to the file.
 */
export const saveMetaData_storytime = (
	fileName: string,
	payload: { prompt: string; genre: Genre },
) => {
	const { prompt, genre } = payload
	const metadata = {
		model: process.env.OPENAI_MODEL ?? "unknown",
		prompt,
		genre,
	}

	const fullOutputFilePath =
		process.cwd() + "/output/story/" + fileName + ".json"

	const dir = path.dirname(fullOutputFilePath);

	// Ensure the directory exists
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	const string = JSON.stringify(metadata, null, 2)
	const metaFile = createWriteStream(
		fullOutputFilePath,
		{
			encoding: "utf-8",
		},
	)
	metaFile.write(string)
	metaFile.end()
}

/**
 * Saves the meta-data associated with an ongoing Chatbot
 *  session.
 *
 * @param {String} fileName - The output file name for the
 *  metadata to be stored in.
 * @param {Object} payload - The object to write to the file.
 */
export const saveMetaData_chat_bot = (
	fileName: string,
	payload: { prompt: string; textCompletionParams: OpenAIParams_text_completion },
) => {
	const { prompt, textCompletionParams } = payload
	const metadata = {
		prompt,
		textCompletionParams,
	}

	const fullOutputFilePath =
		process.cwd() + "/output/chat/" + fileName + ".json"

	const dir = path.dirname(fullOutputFilePath);

	// Ensure the directory exists
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	const string = JSON.stringify(metadata, null, 2)
	const metaFile = createWriteStream(
		fullOutputFilePath,
		{
			encoding: "utf-8",
		},
	)
	metaFile.write(string)
	metaFile.end()
}


export const saveImageURLs = (fileName: string, payload: string[]) => {
	const urls = {
		urls: payload,
	}

	const string = JSON.stringify(urls, null, 2)


	const fullOutputFilePath =
		process.cwd() + "/output/image/" + fileName + ".json"

	const dir = path.dirname(fullOutputFilePath);

	// Ensure the directory exists
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	const metaFile = createWriteStream(
		fullOutputFilePath,
		{
			encoding: "utf-8",
		},
	)
	metaFile.write(string)
	metaFile.end()
}
