import "dotenv/config"

// import type WebSocket from "ws"
import { WebSocket } from 'ws'

import fs, { createWriteStream } from "fs"
import websocket, { SocketStream } from "@fastify/websocket"
import type { FastifyInstance, FastifyRequest } from "fastify"
import {
	StateType,
	ShareImageOnTwitterRequest,
	TwitterCardDetails,
	GetUserBlockchainPresenceRequest,
	StoreUserBlockchainPresenceRequest,
	OperationResult,
	MintNftRequest,
	MintNftImageDetails, LicenseAssistantRequest,
} from "./system/types"
import {
	sendStateMessage,
	sendErrorMessage,
	sendTextMessage,
	saveMetaData_chat_bot,
	sendTwitterCardUrlMessage,
	sendUserBlockchainPresence,
	sendUserBlockchainPresenceStoreResult,
	sendMintNftImageDetailsMessage,
} from "./system/handlers"
import path from "node:path"
import { isFlagged } from "./openai-common"

import { Stream } from 'openai/streaming';
import { ChatCompletionChunk } from "openai/resources/chat/completions"
import { OpenAIParams_text_completion } from "./openai-parameter-objects"
import { processImageChatVolley, processLicenseChatVolley, shareImageOnTwitter } from "./process-chat-volley"
import {
	readUserBlockchainPresence, writeUserBlockchainPresence,
} from "./blockchain/blockchain-server-side-only"
import { sendSimpleStateMessage } from "./common-routines"
import { IpMetadata, StoryClient, StoryConfig } from "@story-protocol/core-sdk"
import { Hex, http } from 'viem'
import { RPCProviderUrl } from "./story-protocol/utils"
import { uploadJSONToIPFS } from "./story-protocol/uploadToIpfs"
import { createHash } from "node:crypto"
import { UserBlockchainPresence } from "./blockchain/user-blockchain-presence"


const CONSOLE_CATEGORY = 'websocket'
const appName = 'Chatbot'

// What do we say when the user is trying to be problematic?
const badPromptError =
	process.env.HARMFUL_PROMPT_RESPONSE ??
	"Let's keep the conversation positive and focused on healthy topics."

// Enable this in the `.env.local` file to stream text to the console

const streamTextToConsole =
	process.env.CONSOLE_STREAM_OUTPUT === "true" ? true : false

/**
 * This function extracts the suggested image generation prompt
 *  from the LLM Chatbot.
 *
 * @param {Object} payload - The payload field from the LLM
 *  response object.
 *
 * @return {String} - Returns the suggested image generation
 *  prompt.
 */
function extractImageGenerationPrompt(payload: any): string {
	if (typeof payload !== 'object' || payload === null)
		throw new Error(`The "message" parameter does not contain a valid object.`)

	// TODO: Put the real code here!
	return 'A frog wearing a hat.'
}

/**
 * Given an OpenAI streaming response, extract out the
 *  content we need contained in it.
 *
 * @param {StateType} state - The current state.
 * @param {Stream} stream - The OpenAI stream associated
 *  with the response.
 * @param {WebSocket|null} client - The client websocket we
 *  are servicing if we are in server mode, or NULL, if
 *  we are in stand-alone utility mode.
 * @param {Object<prompt, OpenAIParams_text_completion>} payload -
 *  The payload object received.
 *
 * @return {Object} - Returns an object containing the content
 *  we need from the streaming OpenAI text completions response.
 */
export async function extractOpenAiResponseDetails(state: StateType, stream: Stream<ChatCompletionChunk>, client: WebSocket | null, payload: {
	prompt: string;
	textCompletionParams: OpenAIParams_text_completion
}) {

	if (client === null) {
		// Handle the null case if needed
	} else if (!(client instanceof WebSocket)) {
		throw new Error(`The value in the client parameter is not NULL, so it must be a WebSocket object and it is not.`);
	}

	const fileName = state.current_request_id
	const fullFileName = fileName + ".txt"
	const fullOutputFilename =
		process.cwd() + "/output/text/" + fullFileName
	const dir = path.dirname(fullOutputFilename)

	console.info(CONSOLE_CATEGORY, `Writing text output to:\n${fullOutputFilename}`)

	// Ensure the directory exists
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}

	const localFile = createWriteStream(
		fullOutputFilename,
		{
			encoding: "utf-8",
		},
	)

	// Here we are streaming the output of the OpenAI completion to the client
	//  over the WebSocket connection as well as to the local filestream we
	//  created above. This will change in a future version to use Firestream
	const aryTextElements = []

	for await (const chunk of stream) {
		const text = chunk.choices[0]?.delta?.content || ""
		const stop = chunk.choices[0]?.finish_reason

		// Do not send a message to the client if we don't have
		//  a valid WebSocket instance.  It could be a stand-alone
		//  utility calling us.
		if (text !== null) {
			const newContent = chunk.choices[0]?.delta?.content;

			if (newContent)
				aryTextElements.push(newContent);

			if (client === null) {
				// No client connection.  Do nothing.
			} else {
				// Pass the chunk on to the client.
				sendTextMessage(client, { delta: text })
				localFile.write(text)
			}

			if (streamTextToConsole === true) {
				process.stdout.write(chunk.choices[0]?.delta?.content || "")
			}
		}

		// When OpenAI gives us a stop signal, we wrap up the filestream
		// and send a state message to the client so they know to update their UI.
		// If you see the reason "length" in the console, it means the stream
		// was stopped because the maximum token length was reached.
		// This limitation is set by `OPENAI_MAX_TOKENS` in the .env file
		// if you'd like to increase it, but be aware that GPT-4 in
		// particular can get very expensive very quickly!
		if (stop) {
			// -------------------- BEGIN: LLM OUTPUT RECEIVED, MAKE IMAGE GENERATION REQUEST ------------

			// TODO: Check the "stop" value for failure codes and take
			//  appropriate actions.

			// Now that we have gotten the entire response from the LLM,
			//  extract the image generation prompt and pass it on to the
			//  Livepeer network.
			console.info(CONSOLE_CATEGORY, `LLM response received.`)

			state.streaming_text = false

			// Do not send a message to the client if we don't have
			//  a valid WebSocket instance.  It could be a stand-alone
			//  utility calling us.
			if (client == null) {
				// No client connect.  Do nothing.
			} else {
				// Notify the client side front-end that we have received
				//  the entire LLM response.
				sendStateMessage(client, state)

				localFile.end()

				// Save the meta-data for the session.
				saveMetaData_chat_bot(fileName, payload)
				console.log(`${appName}: Stream from OpenAI stopped with reason: ${stop}`)

				// Extract the image generation prompt from the LLM result.

				// -------------------- END  : LLM OUTPUT RECEIVED, MAKE IMAGE GENERATION REQUEST ------------
			}
		}
	}

	// Time to return our aggregated result.
	const allTextElements =
		aryTextElements.join(' ');

	return allTextElements;
}

/**
 * This is the WebSocket connection handler.
 *
 * @param {SocketStream} connection - The WebSocket
 *  connection this handler services.
 * @param {FastifyRequest} request - The Fastify
 *  request object to process.
 */
async function wsConnection(
		connection: SocketStream,
		request: FastifyRequest) {

	// Initialize the state flags.
	const initialState = {
		streaming_audio: false,
		streaming_text: false,
		waiting_for_images: false,
		current_request_id: "",
		state_change_message: ""
	};

	// Use the `connection.socket` instead of `client`
	const client = connection.socket;

	sendStateMessage(client, initialState);
	console.log(`Client connected: ${request.ip}`);

	// The handler for new messages.
	client.on("message", async (raw) => {
		try {
			// Parse out the JSON message object.
			const message = JSON.parse(raw.toString());

			// Is it an image assistant request message?
			if (message.type === "request_image_assistant") {
				// -------------------- BEGIN: PROCESS IMAGE GEN USER INPUT FROM CLIENT ------------

				// Yes.  Process a chat volley.
				//
				// Every request must have a user ID and user input fields.
				const { user_id, prompt } = message.payload;

				if (!user_id || user_id.trim().length < 1)
					throw new Error(`BAD REQUEST: User ID is missing.`);

				if (!prompt || prompt.trim().length < 1)
					throw new Error(`BAD REQUEST: User input is missing.`);

				// Create a unique request ID.
				initialState.current_request_id = `${Date.now()}-${crypto.randomUUID()}`;

				// Check if the prompt is flagged as harmful before
				//  passing the request to AI handlers
				const flagged = await isFlagged(prompt);
				if (flagged) {
					console.log(`Image generation user prompt was flagged as harmful: ${prompt}`);

					// Tell the client the prompt was considered harmful
					//  so that it can notify the user.
					sendErrorMessage(client, {
						error: badPromptError,
					});

					return false; // Exit
				}

				// Submit the request to the LLM to get the image prompt
				//  we should send to Livepeer for image generation purposes.
				//
				// NOTE: processImageChatVolley will send a websocket response
				//  once it has received the new images.  It will send the
				//  "answer" it generated out-of-band with the via
				//  the sendTextMessage() function, and an intervening
				//  state messages with sendStateMessage().  The client
				//  knows the volley is finished when it receives a
				//  "data.type === "image" message, and that message
				//  contains the image URls for the generated images.
				const isChatVolleySuccessful =
					await processImageChatVolley(client, initialState, user_id, prompt)

				return isChatVolleySuccessful
			}
			// Is it an image assistant request message?
			else if (message.type === "request_license_assistant") {
				// -------------------- BEGIN: PROCESS LICENSE USER INPUT FROM CLIENT ------------

				// Yes.  Process a chat volley.
				//
				// Every request must have a user ID, user input fields.
				const licenseAssistantRequestObj = message.payload as LicenseAssistantRequest;

				if (!licenseAssistantRequestObj.user_id || licenseAssistantRequestObj.user_id.trim().length < 1)
					throw new Error(`BAD REQUEST: User ID is missing.`);

				if (!licenseAssistantRequestObj.prompt || licenseAssistantRequestObj.prompt.trim().length < 1)
					throw new Error(`BAD REQUEST: User input is missing.`);

				// Create a unique request ID.
				initialState.current_request_id = `${Date.now()}-${crypto.randomUUID()}`;

				// Check if the licenseAssistantRequestObj.prompt is flagged as harmful before
				//  passing the request to AI handlers
				const flagged = await isFlagged(licenseAssistantRequestObj.prompt);
				if (flagged) {
					console.log(`License user licenseAssistantRequestObj.prompt was flagged as harmful: ${licenseAssistantRequestObj.prompt}`);

					// Tell the client the licenseAssistantRequestObj.prompt was considered harmful
					//  so that it can notify the user.
					sendErrorMessage(client, {
						error: badPromptError,
					});

					return false; // Exit
				}

				// Submit the request to the LLM to get the answer
				//  we should send to the user for license terms
				//  discussion purposes.
				//
				// NOTE: processLicenseChatVolley will send a websocket response
				//  once it has received the new images.  It will send the
				//  "answer" it generated out-of-band with the via
				//  the sendTextMessage() function, and an intervening
				//  state messages with sendStateMessage().  The client
				//  knows the chat volley is finished when we send them
				//  a "data.type === "license_response".  The payload
				//  of that message will have a flag telling the
				//  client if the user has accepted the license
				//  terms for its NFT, or not.
				const isChatVolleySuccessful =
					await processLicenseChatVolley(
						client,
						initialState,
						licenseAssistantRequestObj.user_id,
						licenseAssistantRequestObj.prompt,
						licenseAssistantRequestObj.is_new_license_session)

				return isChatVolleySuccessful
				// -------------------- END  : PROCESS LICENSE INPUT FROM CLIENT ------------
			} else if (message.type === "share_image_on_twitter") {
				// -------------------- BEGIN: SHARE IMAGE ON TWITTER ------------

				// User wants to share a generated image.
				//
				// Every request must have a user ID and image URL
				//  field in the payload.
				const {
					user_id,
					image_url,
					dimensions,
					client_user_message
				} = message.payload as ShareImageOnTwitterRequest;

				if (!user_id || user_id.trim().length < 1)
					throw new Error(`BAD REQUEST: The user ID is missing.`);

				if (!image_url || image_url.trim().length < 1)
					throw new Error(`BAD REQUEST: The image URL is missing.`);

				if (!dimensions)
					throw new Error(`BAD REQUEST: The image dimensions are missing.`);

				// Create a unique request ID.
				initialState.current_request_id = `${Date.now()}-${crypto.randomUUID()}`;

				// Call the function that does the share on Twitter
				//  operations.  It will return the URL to
				//  our GET route that will serve up the Twitter
				//  card document the Twitter share intent requires
				//  for showing an image preview on a Tweet.
				const twitterCardDetails =
					await shareImageOnTwitter(
						client,
						user_id,
						image_url,
						dimensions,
						client_user_message);

				// Send it back to the client.
				sendTwitterCardUrlMessage(client, twitterCardDetails)

				return true
				// -------------------- END  : SHARE IMAGE ON TWITTER ------------
			} else if (message.type === "request_get_user_blockchain_presence") {
				// -------------------- BEGIN: REQUEST USER BLOCKCHAIN PRESENCE OBJECT ------------

				// Process the request.
				//
				// Every request must have a public address.
				const {
					user_public_address
				} = message.payload as GetUserBlockchainPresenceRequest;

				if (!user_public_address || user_public_address.trim().length < 1)
					throw new Error(`BAD REQUEST: The user public address is missing.`);

				// Get the user blockchain object or
				//  return null if none exists.
				const userBlockchainPresenceObjOrNull =
					await readUserBlockchainPresence(user_public_address)

				// Send the result to the client.
				sendUserBlockchainPresence(client, userBlockchainPresenceObjOrNull)

				return true;

				// -------------------- END  : REQUEST USER BLOCKCHAIN PRESENCE OBJECT ------------
			} else if (message.type === "request_store_user_blockchain_presence") {
				// -------------------- BEGIN: REQUEST USER BLOCKCHAIN PRESENCE OBJECT ------------

				// Process the request.
				//
				// Every request must have a  a valid, non-null
				//  user blockchain presence object.
				const {
					user_blockchain_presence_stringified
				} = message.payload as StoreUserBlockchainPresenceRequest;

				if (user_blockchain_presence_stringified.length < 1)
					throw new Error(`BAD REQUEST: The user blockchain presence string is empty.`);

				// Reconstitute the user blockchain presence object.
				const userBlockchainPresenceObj =
					UserBlockchainPresence.fromJsonString(user_blockchain_presence_stringified)

				// Reject any user blockchain presence object with
				//  an uninstantiated SPG NFT collection contract
				//  address.
				if (!userBlockchainPresenceObj.isSpgNftCollectionInitialized()) {
					throw new Error(`The user blockchain presence object does not have a SPG NFT collection smart contract hash yet.`);
				}

				// Store it.
				await writeUserBlockchainPresence(userBlockchainPresenceObj)

				const resultOfOperation: OperationResult =
					{ result: true }

				// Send the result to the client.
				sendUserBlockchainPresenceStoreResult(client, resultOfOperation)

				return true;

				// -------------------- END  : REQUEST USER BLOCKCHAIN PRESENCE OBJECT ------------

			} else if (message.type === "mint_nft") {
				// -------------------- BEGIN: MINT NFT ------------

				sendSimpleStateMessage(client, 'Beginning NFT minting setup...')

				// User wants to mint their generated image as an NFT.
				//
				// Every request must have a user blockchain presence
				//  object in JSON format and the Livepeer image URL
				//  for the generated image in the payload.
				const {
					user_id,
					image_url,
					dimensions,
					client_user_message,
					user_blockchain_presence_json_stringified
				} = message.payload as MintNftRequest;

				if (!user_id || user_id.trim().length < 1)
					throw new Error(`BAD REQUEST: The user ID is missing.`);

				if (!image_url || image_url.trim().length < 1)
					throw new Error(`BAD REQUEST: The image URL is missing.`);

				if (!dimensions)
					throw new Error(`BAD REQUEST: The image dimensions are missing.`);

				if (user_blockchain_presence_json_stringified.length < 1)
					throw new Error(`BAD REQUEST: The stringified user blockchain presence object is missing.`);

				// Reconstitute the user_blockchain_presence_json object.
				const userBlockchainPresenceObj =
					UserBlockchainPresence.fromJsonString(user_blockchain_presence_json_stringified)

				// Create a unique request ID.
				initialState.current_request_id = `${Date.now()}-${crypto.randomUUID()}`;

				sendSimpleStateMessage(client, 'Preparing image for sharing...')

				// Call the function that does the share on Twitter
				//  operations.  It will return the URL to
				//  our GET route that will serve up the Twitter
				//  card document the Twitter share intent requires
				//  for showing an image preview on a Tweet.
				const twitterCardDetails =
					await shareImageOnTwitter(
						client,
						user_id,
						image_url,
						dimensions,
						client_user_message);

				// -------------------- BEGIN: WRITE IP AND NFT METADATA TO IPFS ------------

				sendSimpleStateMessage(client, 'Preparing IP and NFT assets for the blockchain...')

				// Set up the StoryConfig object.
				//
				// Docs: https://docs.story.foundation/docs/typescript-sdk-setup
				const storyConfig: StoryConfig = {
					account: userBlockchainPresenceObj.publicAddress,
					transport: http(RPCProviderUrl),
					chainId: 'iliad',
				}
				const storyClientObj = StoryClient.newClient(storyConfig)


				// Now that we created or confirmed the existence of the user's
				//  SPG NFT collection, mint a new NFT against it using the current
				//  generated image.
				//
				// 2. Set up your IP Metadata
				//
				// Docs: https://docs.story.foundation/docs/ipa-metadata-standard
				const ipMetadata: IpMetadata =
					storyClientObj.ipAsset.generateIpMetadata({
						// Use the Twitter card title created by the LLM.
						title: twitterCardDetails.twitter_card_title,
						// Use the Twitter card description created by the LLM.
						description: twitterCardDetails.twitter_card_description,
						// URI to our S3 bucket for generated images.
						watermarkImg: twitterCardDetails.url_to_image,
						// TODO: What should we actually put here?  These values
						//  are straight out of the Typescript tutorial
						//  'non-commercial' sample.
						attributes: [
							{
								key: 'Rarity',
								value: 'Legendary',
							},
						],
					})

				// 3. Set up your NFT Metadata
				//
				// Docs: https://eips.ethereum.org/EIPS/eip-721
				const nftMetadata = {
					// Use the Twitter card title created by the LLM.
					name: twitterCardDetails.twitter_card_title,
					// Use the Twitter card description created by the LLM.
					description: twitterCardDetails.twitter_card_description,
					// URI to our S3 bucket for generated images.
					image: twitterCardDetails.url_to_image,
				}

				sendSimpleStateMessage(client, 'Writing IP and NFT metadata to the blockchain...')

				// Upload the IP and NFT metadata to IPFS.
				const ipMetadataURI = await uploadJSONToIPFS(ipMetadata)
				const ipMetadataHash = createHash('sha256').update(JSON.stringify(ipMetadata)).digest('hex')
				const nftIpfsHash = await uploadJSONToIPFS(nftMetadata)
				const nftHash = createHash('sha256').update(JSON.stringify(nftMetadata)).digest('hex')				
				
				// -------------------- END  : WRITE IP AND NFT METADATA TO IPFS ------------

				// Merge the Twitter card details and IP/NFT metadata
				//  details into our mint NFT image details object.
				const mintNftImageDetails: MintNftImageDetails =
					{
						...twitterCardDetails,
						user_blockchain_presence_stringified: userBlockchainPresenceObj.toJsonString(),
						ipMetadata: {
							ipMetadataURI: ipMetadataURI,
							ipMetadataHash: ipMetadataHash as Hex,
							nftMetadataURI: nftIpfsHash,
							nftMetadataHash: nftHash as Hex
						}
					}

				// Send it back to the client.
				sendMintNftImageDetailsMessage(client, mintNftImageDetails)

				sendSimpleStateMessage(client, 'NFT is ready for minting and registering...')

				return true

				// -------------------- END  : MINT NFT ------------
			} else {
				throw new Error(`BAD REQUEST(ws.client.on): Unknown message type -> ${message.type}.`);
			}
		} catch (err) {
			const errMsg =
				`Failure during chat volley processing.  Details: ${err.message}`git

			sendErrorMessage(client, { error: errMsg})

			console.error(err);

			return false
		}
	});

	// The handler for when the WebSocket closes.
	client.on('close', (code, reason) => {
		console.log('***** Client disconnected *****');
		console.log(`Close code: ${code}`);
		console.log(`Close reason: ${reason.toString()}`);
	});


	// The handler for when an error occurs.
	client.on('error', (err) => {
		console.error('----->>>>> WebSocket error:', err);
	});
}

/**
 * This is the WebSocket controller for the image generation
 *  assistant chat-bot app.
 *
 * @param {FastifyInstance} fastify - A valid Fastify
 *  instance.
 */
export default async function wsControllerForChatBot(fastify: FastifyInstance) {
	await fastify.register(websocket)
	fastify.get("/chatbot", { websocket: true }, wsConnection)
}
